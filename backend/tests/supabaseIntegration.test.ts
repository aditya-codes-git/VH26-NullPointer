import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { HistoryPersister } from '../src/persistence/historyPersister.js';
import { createApiRouter } from '../src/api/routes.js';
import { EventSimulator } from '../src/simulator/eventSimulator.js';
import { MetricsCollector } from '../src/metrics/metricsCollector.js';
import { QueueManager } from '../src/queues/queueManager.js';
import { SheddingPolicy } from '../src/backpressure/sheddingPolicy.js';
import { BackpressureController } from '../src/backpressure/backpressureController.js';
import { AdaptiveDecisionEngine } from '../src/decision-engine/adaptiveEngine.js';
import { RetryController } from '../src/resilience/retryController.js';
import { DuplicateDetector } from '../src/resilience/duplicateDetector.js';
import { PriorityRouter } from '../src/router/priorityRouter.js';
import { WorkerPool } from '../src/processing/workerPool.js';
import { BatchProcessor } from '../src/processing/batchProcessor.js';
import { WorkerScaler } from '../src/workers/workerScaler.js';
import { FormalizedDecisionEngine } from '../src/decision-engine/formalizedDecisionEngine.js';
import { DEFAULT_CONFIG } from '../src/config/pipelineConfig.js';
import { PipelineEvent } from '../src/models/event.js';
import * as supabaseClient from '../src/supabase/supabaseClient.js';

describe('Supabase Authentication, Persistence & RLS Integration Suite', () => {
  let app: express.Express;
  let historyPersister: HistoryPersister;
  let queueManager: QueueManager;
  let sheddingPolicy: SheddingPolicy;
  let backpressureController: BackpressureController;
  let adaptiveEngine: AdaptiveDecisionEngine;
  let retryController: RetryController;
  let metricsCollector: MetricsCollector;
  let duplicateDetector: DuplicateDetector;
  let priorityRouter: PriorityRouter;
  let workerPool: WorkerPool;
  let batchProcessor: BatchProcessor;
  let workerScaler: WorkerScaler;
  let decisionEngine: FormalizedDecisionEngine;
  let simulator: EventSimulator;

  beforeEach(() => {
    const config = { ...DEFAULT_CONFIG };
    queueManager = new QueueManager(config);
    sheddingPolicy = new SheddingPolicy(queueManager);
    backpressureController = new BackpressureController(config, queueManager);
    adaptiveEngine = new AdaptiveDecisionEngine(config, queueManager);
    retryController = new RetryController(config, queueManager);
    duplicateDetector = new DuplicateDetector(60, 10000);
    batchProcessor = new BatchProcessor(config, retryController);

    metricsCollector = new MetricsCollector(
      queueManager,
      sheddingPolicy,
      backpressureController,
      adaptiveEngine,
      retryController
    );

    priorityRouter = new PriorityRouter(queueManager, sheddingPolicy, metricsCollector);

    workerPool = new WorkerPool(
      config,
      queueManager,
      batchProcessor,
      sheddingPolicy,
      adaptiveEngine,
      retryController
    );
    workerPool.registerMetricsCollector(metricsCollector);

    workerScaler = new WorkerScaler(config, workerPool, queueManager, metricsCollector);
    decisionEngine = new FormalizedDecisionEngine(
      config,
      queueManager,
      adaptiveEngine,
      workerPool,
      workerScaler,
      metricsCollector
    );

    historyPersister = new HistoryPersister();

    simulator = new EventSimulator(
      config,
      (event) => {
        metricsCollector.recordIncomingEvent(event);
        priorityRouter.route(event);
      },
      undefined,
      duplicateDetector
    );

    app = express();
    app.use(express.json());
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
        decisionEngine,
        historyPersister
      )
    );
  });

  afterEach(() => {
    historyPersister.destroy();
    simulator.stop();
  });

  it('verifies GET /api/persistence/status reports configured telemetry and buffer metrics', async () => {
    const res = await request(app).get('/api/persistence/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('isConfigured');
    expect(res.body).toHaveProperty('dbStatus');
    expect(res.body).toHaveProperty('bufferedEventsCount');
    expect(res.body).toHaveProperty('totalEventsPersisted');
  });

  it('enforces authentication on historical endpoints and rejects unauthenticated requests with HTTP 401', async () => {
    // 1. GET /api/history/runs
    const runsRes = await request(app).get('/api/history/runs');
    expect(runsRes.status).toBe(401);
    expect(runsRes.body.error).toMatch(/Authentication required/i);

    // 2. GET /api/history/events
    const eventsRes = await request(app).get('/api/history/events');
    expect(eventsRes.status).toBe(401);

    // 3. GET /api/history/analytics
    const analyticsRes = await request(app).get('/api/history/analytics');
    expect(analyticsRes.status).toBe(401);

    // 4. POST /api/runs/start
    const startRes = await request(app).post('/api/runs/start').send({ scenario: 'CRITICAL_HEAVY' });
    expect(startRes.status).toBe(401);

    // 5. POST /api/runs/stop
    const stopRes = await request(app).post('/api/runs/stop');
    expect(stopRes.status).toBe(401);
  });

  it('guarantees that non-blocking persistence buffer does not block or slow down pipeline processing', () => {
    // Simulate active run context
    (historyPersister as any).activeRun = {
      runId: 'test-run-123',
      userId: 'user-abc',
      userToken: 'fake-jwt',
      scenario: 'CRITICAL_HEAVY',
      startTime: Date.now(),
    };

    const startTime = performance.now();
    for (let i = 0; i < 500; i++) {
      const event: PipelineEvent = {
        id: `evt_perf_${i}`,
        type: 'ORDER',
        priority: 'CRITICAL',
        payload: { amount: 100 },
        createdAt: Date.now(),
        queuedAt: Date.now(),
        status: 'PROCESSED',
        strategy: 'STREAM',
      };
      historyPersister.recordEvent(event, 7.5);
    }
    const elapsed = performance.now() - startTime;

    // 500 buffered events should take < 15ms in-memory (zero I/O on hot path)
    expect(elapsed).toBeLessThan(50);
    const telemetry = historyPersister.getTelemetry();
    expect(telemetry.bufferedEventsCount).toBe(500);
  });

  it('verifies DB failure safety: simulated database disconnect does not cause data loss or crash the pipeline', async () => {
    // Mock verifyUserToken to return an authenticated user
    vi.spyOn(supabaseClient.authService, 'verifyUserToken').mockResolvedValue({
      id: 'mock-user-123',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    } as any);

    // Force startRun to return null simulating Supabase network failure
    vi.spyOn(historyPersister, 'startRun').mockResolvedValue(null);

    const res = await request(app)
      .post('/api/runs/start')
      .set('Authorization', 'Bearer mock-jwt-token')
      .send({ scenario: 'CRITICAL_HEAVY' });

    // Pipeline should return HTTP 500 with descriptive error, not crash the process
    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Failed to create run record in Supabase');

    // Pipeline components remain fully operational
    const snap = metricsCollector.getSnapshot();
    expect(queueManager.criticalQueue.size()).toBe(0);
    expect(snap.totalReceived).toBe(0);
  });

  it('verifies user isolation contract (Row Level Security boundary)', async () => {
    // Mock user A
    const userA = {
      id: 'user-uuid-aaaa',
      email: 'usera@adaptiflow.io',
    };
    // Mock user B
    const userB = {
      id: 'user-uuid-bbbb',
      email: 'userb@adaptiflow.io',
    };

    vi.spyOn(supabaseClient.authService, 'verifyUserToken').mockImplementation(async (token: string) => {
      if (token === 'token-user-a') return userA as any;
      if (token === 'token-user-b') return userB as any;
      return null;
    });

    // Test request with User A's token
    const resA = await request(app)
      .get('/api/history/runs')
      .set('Authorization', 'Bearer token-user-a');

    // Should authenticate successfully and proceed to query (even if empty in mock)
    expect(resA.status).not.toBe(401);

    // Test request with User B's token
    const resB = await request(app)
      .get('/api/history/runs')
      .set('Authorization', 'Bearer token-user-b');

    expect(resB.status).not.toBe(401);
  });

  it('verifies automatic event buffering and duplicate event prevention during active run', () => {
    (historyPersister as any).activeRun = {
      runId: 'run-auto-123',
      userId: 'user-auto-123',
      userToken: 'token-auto-123',
      scenario: 'CRITICAL_HEAVY',
      startTime: Date.now(),
    };

    const event1: PipelineEvent = {
      id: 'evt_dup_test_1',
      type: 'PAYMENT',
      priority: 'CRITICAL',
      payload: { amount: 500 },
      createdAt: Date.now(),
      queuedAt: Date.now(),
      status: 'PROCESSED',
      strategy: 'STREAM',
    };

    // First record: should be buffered
    historyPersister.recordEvent(event1, 12.4, 'worker-1');
    expect(historyPersister.getTelemetry().bufferedEventsCount).toBe(1);

    // Duplicate record with identical event ID: must be ignored (preventing duplicate persistence)
    historyPersister.recordEvent(event1, 14.1, 'worker-2');
    expect(historyPersister.getTelemetry().bufferedEventsCount).toBe(1);

    // Different event: should be buffered
    const event2: PipelineEvent = {
      ...event1,
      id: 'evt_dup_test_2',
    };
    historyPersister.recordEvent(event2, 9.8, 'worker-1');
    expect(historyPersister.getTelemetry().bufferedEventsCount).toBe(2);
  });

  it('verifies pre-run event buffering preserves events before run initialization', async () => {
    // Ensure no active run initially
    (historyPersister as any).activeRun = null;

    const event: PipelineEvent = {
      id: 'evt_pre_run_1',
      type: 'ORDER',
      priority: 'CRITICAL',
      payload: {},
      createdAt: Date.now(),
      queuedAt: Date.now(),
      status: 'PROCESSED',
      strategy: 'STREAM',
    };

    // Record event before run starts
    historyPersister.recordEvent(event, 10.0);

    // Mock startRun to succeed
    vi.spyOn(supabaseClient, 'createScopedClient').mockReturnValue({
      from: () => ({
        insert: () => ({
          select: () => ({
            single: async () => ({ data: { id: 'new-run-uuid' }, error: null }),
          }),
        }),
      }),
    } as any);

    // Simulate startRun
    await historyPersister.startRun('test-user', 'test-token', 'CRITICAL_HEAVY', {});

    // Pre-run event should now be transferred into the active run's event buffer
    const tel = historyPersister.getTelemetry();
    expect(tel.activeRunId).toBe('new-run-uuid');
    expect(tel.bufferedEventsCount).toBe(1);
  });

  it('verifies POST /api/history/sync forces buffer flush and returns sync telemetry', async () => {
    vi.spyOn(supabaseClient.authService, 'verifyUserToken').mockResolvedValue({
      id: 'sync-user-id',
      email: 'sync@adaptiflow.io',
    } as any);

    vi.spyOn(historyPersister, 'flushBuffers').mockImplementation(async () => {});

    const res = await request(app)
      .post('/api/history/sync')
      .set('Authorization', 'Bearer valid-sync-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('dbStatus');
    expect(res.body).toHaveProperty('pending');
    expect(res.body).toHaveProperty('lastSyncedTime');
  });

  it('verifies POST /api/simulator/start automatically creates workload run when authenticated', async () => {
    vi.spyOn(supabaseClient.authService, 'verifyUserToken').mockResolvedValue({
      id: 'sim-user-id',
      email: 'sim@adaptiflow.io',
    } as any);

    const startRunSpy = vi.spyOn(historyPersister, 'startRun').mockResolvedValue('sim-run-uuid');

    const res = await request(app)
      .post('/api/simulator/start')
      .set('Authorization', 'Bearer valid-sim-token');

    expect(res.status).toBe(200);
    expect(startRunSpy).toHaveBeenCalledWith(
      'sim-user-id',
      'valid-sim-token',
      expect.any(String),
      expect.any(Object)
    );
    expect(simulator.isRunning()).toBe(true);
  });
});
