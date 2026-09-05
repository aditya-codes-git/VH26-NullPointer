import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { createServer, Server as HttpServer } from 'http';
import request from 'supertest';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { DEFAULT_CONFIG } from '../src/config/pipelineConfig.js';
import { QueueManager } from '../src/queues/queueManager.js';
import { PriorityRouter } from '../src/router/priorityRouter.js';
import { BatchProcessor } from '../src/processing/batchProcessor.js';
import { SheddingPolicy } from '../src/backpressure/sheddingPolicy.js';
import { BackpressureController } from '../src/backpressure/backpressureController.js';
import { AdaptiveDecisionEngine } from '../src/decision-engine/adaptiveEngine.js';
import { WorkerPool } from '../src/processing/workerPool.js';
import { MetricsCollector } from '../src/metrics/metricsCollector.js';
import { RetryController } from '../src/resilience/retryController.js';
import { EventSimulator } from '../src/simulator/eventSimulator.js';
import { createApiRouter } from '../src/api/routes.js';
import { setupSocketServer } from '../src/websocket/socketServer.js';
import { WorkerScaler } from '../src/workers/workerScaler.js';
import { DuplicateDetector } from '../src/resilience/duplicateDetector.js';
import { FormalizedDecisionEngine } from '../src/decision-engine/formalizedDecisionEngine.js';

describe('End-to-End System API & Socket.IO Telemetry Suite', () => {
  let app: express.Express;
  let httpServer: HttpServer;
  let metricsCollector: MetricsCollector;
  let simulator: EventSimulator;
  let clientSocket: ClientSocketType;
  let port: number;

  beforeEach(async () => {
    app = express();
    app.use(express.json());

    const config = { ...DEFAULT_CONFIG, BASE_PROCESSING_DELAY_MS: 2 };
    const queueManager = new QueueManager(config);
    const retryController = new RetryController(config, queueManager);
    const batchProcessor = new BatchProcessor(config, retryController);
    const sheddingPolicy = new SheddingPolicy(queueManager);
    const backpressureController = new BackpressureController(config, queueManager);
    const adaptiveEngine = new AdaptiveDecisionEngine(config, queueManager);
    const duplicateDetector = new DuplicateDetector(60, 10000);

    metricsCollector = new MetricsCollector(
      queueManager,
      sheddingPolicy,
      backpressureController,
      adaptiveEngine,
      retryController
    );
    metricsCollector.registerDuplicateDetector(duplicateDetector);

    const priorityRouter = new PriorityRouter(queueManager, sheddingPolicy, metricsCollector);

    const workerPool = new WorkerPool(
      config,
      queueManager,
      batchProcessor,
      sheddingPolicy,
      adaptiveEngine,
      retryController
    );
    workerPool.registerMetricsCollector(metricsCollector);

    const workerScaler = new WorkerScaler(config, workerPool, queueManager, metricsCollector);
    metricsCollector.registerWorkerScaler(workerScaler);

    const decisionEngine = new FormalizedDecisionEngine(
      config,
      queueManager,
      adaptiveEngine,
      workerPool,
      workerScaler,
      metricsCollector
    );
    metricsCollector.registerDecisionEngine(decisionEngine);

    workerPool.setListeners(
      ({ event, latencyMs }) => {
        metricsCollector.recordProcessedEvent(event, latencyMs);
      },
      (events, durationMs) => {
        metricsCollector.recordBatchProcessed(events, durationMs);
      }
    );

    simulator = new EventSimulator(
      config,
      (event) => {
        metricsCollector.recordIncomingEvent(event);
        priorityRouter.route(event);
      },
      undefined,
      duplicateDetector
    );

    metricsCollector.registerSimulator(simulator);
    backpressureController.registerSimulator(simulator);

    workerPool.start();

    app.use(
      '/api',
      createApiRouter(
        simulator,
        metricsCollector,
        config,
        undefined,
        retryController,
        workerScaler,
        duplicateDetector,
        priorityRouter,
        decisionEngine
      )
    );

    httpServer = createServer(app);
    setupSocketServer(httpServer, metricsCollector, workerPool);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address() as any;
        port = addr.port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  it('verifies complete ingestion lifecycle: POST /api/ingest admits event and updates metrics', async () => {
    const eventPayload = {
      id: `e2e_${Date.now()}`,
      type: 'PAYMENT',
      timestamp: Date.now(),
      payload: { amount: 250 },
    };

    const res = await request(app).post('/api/ingest').send(eventPayload);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('admitted');
    expect(res.body.eventId).toBe(eventPayload.id);

    // Verify metrics updated
    const metricsRes = await request(app).get('/api/metrics');
    expect(metricsRes.status).toBe(200);
    expect(metricsRes.body.totalReceived).toBeGreaterThan(0);
    expect(metricsRes.body.criticalReceived).toBeGreaterThan(0);
  });

  it('verifies workload mode switching alters backend simulator configuration', async () => {
    // 1. Switch to CRITICAL_HEAVY
    const res1 = await request(app).post('/api/simulator/workload').send({ scenario: 'CRITICAL_HEAVY' });
    expect(res1.status).toBe(200);
    expect(res1.body.scenario).toBe('CRITICAL_HEAVY');
    expect(res1.body.configuredDistribution.priorityDistribution.CRITICAL).toBe(60);

    // 2. Switch to HIGH_HEAVY
    const res2 = await request(app).post('/api/simulator/workload').send({ scenario: 'HIGH_HEAVY' });
    expect(res2.status).toBe(200);
    expect(res2.body.scenario).toBe('HIGH_HEAVY');
    expect(res2.body.configuredDistribution.priorityDistribution.HIGH).toBe(60);

    // 3. Switch to LOW_HEAVY
    const res3 = await request(app).post('/api/simulator/workload').send({ scenario: 'LOW_HEAVY' });
    expect(res3.status).toBe(200);
    expect(res3.body.scenario).toBe('LOW_HEAVY');
    expect(res3.body.configuredDistribution.priorityDistribution.LOW).toBe(60);

    // 4. Invalid scenario rejected with 400
    const res4 = await request(app).post('/api/simulator/workload').send({ scenario: 'INVALID_MODE' });
    expect(res4.status).toBe(400);
  });

  it('verifies Socket.IO telemetry client receives real-time snapshots with all required subsystems', async () => {
    clientSocket = ClientSocket(`http://localhost:${port}`);

    const receivedSnapshot = await new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket.IO telemetry timeout')), 3000);
      clientSocket.on('telemetry', (snapshot) => {
        clearTimeout(timer);
        resolve(snapshot);
      });
    });

    // Check core telemetry fields
    expect(receivedSnapshot).toBeDefined();
    expect(receivedSnapshot.timestamp).toBeTypeOf('number');
    expect(receivedSnapshot.queues).toBeDefined();
    expect(receivedSnapshot.queues.critical).toBeDefined();
    expect(receivedSnapshot.queues.high).toBeDefined();
    expect(receivedSnapshot.queues.low).toBeDefined();
    expect(receivedSnapshot.workload).toBeDefined();
    expect(receivedSnapshot.workload.configuredDistribution).toBeDefined();
    expect(receivedSnapshot.faultTolerance).toBeDefined();
    expect(receivedSnapshot.workerScaling).toBeDefined();
    expect(receivedSnapshot.duplicateDetection).toBeDefined();
    expect(receivedSnapshot.decisionFunction).toBeDefined();
  });

  it('verifies simulator rate and spike controls via REST endpoints', async () => {
    // Normal load (~1000)
    const normRes = await request(app).post('/api/simulator/normal');
    expect(normRes.status).toBe(200);
    expect(normRes.body.mode).toBe('NORMAL');

    // Spike load (~20000)
    const spikeRes = await request(app).post('/api/simulator/spike');
    expect(spikeRes.status).toBe(200);
    expect(spikeRes.body.mode).toBe('SPIKE');

    // Custom rate
    const rateRes = await request(app).post('/api/simulator/rate').send({ rate: 5000 });
    expect(rateRes.status).toBe(200);
    expect(rateRes.body.rate).toBe(5000);

    // Stop simulator
    const stopRes = await request(app).post('/api/simulator/stop');
    expect(stopRes.status).toBe(200);
    expect(stopRes.body.mode).toBe('STOPPED');
  });
});
