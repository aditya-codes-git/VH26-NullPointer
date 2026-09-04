import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createServer, Server } from 'http';
import { createApiRouter } from '../src/api/routes.js';
import { DEFAULT_CONFIG } from '../src/config/pipelineConfig.js';
import { QueueManager } from '../src/queues/queueManager.js';
import { PriorityRouter } from '../src/router/priorityRouter.js';
import { SheddingPolicy } from '../src/backpressure/sheddingPolicy.js';
import { BackpressureController } from '../src/backpressure/backpressureController.js';
import { AdaptiveDecisionEngine } from '../src/decision-engine/adaptiveEngine.js';
import { MetricsCollector } from '../src/metrics/metricsCollector.js';
import { EventSimulator } from '../src/simulator/eventSimulator.js';
import { classifyEvent } from '../src/classifier/eventClassifier.js';
import { PipelineEvent } from '../src/models/event.js';

describe('Ingestion API & Pipeline Integration', () => {
  let server: Server;
  let baseUrl: string;
  let queueManager: QueueManager;
  let priorityRouter: PriorityRouter;
  let metricsCollector: MetricsCollector;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());

    const config = { ...DEFAULT_CONFIG };
    queueManager = new QueueManager(config);
    priorityRouter = new PriorityRouter(queueManager);
    const sheddingPolicy = new SheddingPolicy(queueManager);
    const backpressureController = new BackpressureController(config, queueManager);
    const adaptiveEngine = new AdaptiveDecisionEngine(config, queueManager);

    metricsCollector = new MetricsCollector(
      queueManager,
      sheddingPolicy,
      backpressureController,
      adaptiveEngine
    );

    const simulator = new EventSimulator(config, () => {});
    // Mount routes without an active Kafka producer to verify 503 behavior
    app.use('/api', createApiRouter(simulator, metricsCollector, config));

    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    const addr = server.address() as any;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('rejects events missing required id field with 400', async () => {
    const res = await fetch(`${baseUrl}/api/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'ORDER',
        timestamp: Date.now(),
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain('id');
  });

  it('rejects events with invalid event type with 400', async () => {
    const res = await fetch(`${baseUrl}/api/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'evt_test_1',
        type: 'UNKNOWN_INVALID_TYPE',
        timestamp: Date.now(),
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain('type');
  });

  it('rejects events missing timestamp with 400', async () => {
    const res = await fetch(`${baseUrl}/api/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'evt_test_1',
        type: 'PAYMENT',
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toContain('timestamp');
  });

  it('returns HTTP 503 when Kafka broker is unavailable (no silent fallback for external ingestion)', async () => {
    const res = await fetch(`${baseUrl}/api/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'evt_test_1',
        type: 'PAYMENT',
        timestamp: Date.now(),
        payload: { amount: 100 },
      }),
    });

    const data = await res.json();
    expect(res.status).toBe(503);
    expect(data.status).toBe('rejected');
    expect(data.error).toContain('Kafka ingestion unavailable');
  });

  it('reports Kafka connection status in GET /api/health', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toHaveProperty('kafka');
    expect(data.kafka).toHaveProperty('connected');
    expect(data.kafka).toHaveProperty('brokers');
  });

  it('verifies consumer routing logic correctly places critical events into criticalQueue without direct shedding', () => {
    // Simulate what the Kafka Consumer executes upon message receipt
    const rawKafkaMessage = {
      id: 'ext_kafka_99',
      type: 'PAYMENT',
      timestamp: Date.now(),
      payload: { amount: 250 },
    };

    const priority = classifyEvent(rawKafkaMessage.type as any);
    expect(priority).toBe('CRITICAL');

    const pipelineEvent: PipelineEvent = {
      id: rawKafkaMessage.id,
      type: rawKafkaMessage.type as any,
      priority,
      payload: rawKafkaMessage.payload,
      createdAt: rawKafkaMessage.timestamp,
      queuedAt: Date.now(),
      status: 'QUEUED',
    };

    metricsCollector.recordIncomingEvent(pipelineEvent);
    const result = priorityRouter.route(pipelineEvent);

    expect(result.success).toBe(true);
    expect(result.queueName).toBe('CRITICAL_QUEUE');
    expect(queueManager.criticalQueue.size()).toBe(1);
    expect(queueManager.criticalQueue.peek()?.id).toBe('ext_kafka_99');
    expect(metricsCollector.criticalReceived).toBe(1);
  });
});
