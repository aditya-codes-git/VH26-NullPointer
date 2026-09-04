import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkerPool } from '../src/processing/workerPool.js';
import { WorkerScaler } from '../src/workers/workerScaler.js';
import { QueueManager } from '../src/queues/queueManager.js';
import { BatchProcessor } from '../src/processing/batchProcessor.js';
import { SheddingPolicy } from '../src/backpressure/sheddingPolicy.js';
import { MetricsCollector } from '../src/metrics/metricsCollector.js';
import { BackpressureController } from '../src/backpressure/backpressureController.js';
import { AdaptiveDecisionEngine } from '../src/decision-engine/adaptiveEngine.js';
import { RetryController } from '../src/resilience/retryController.js';
import { DEFAULT_CONFIG } from '../src/config/pipelineConfig.js';
import { PipelineEvent } from '../src/models/event.js';

describe('Stretch Goal 2 — Dynamic Worker Scaling', () => {
  let config = {
    ...DEFAULT_CONFIG,
    MIN_WORKERS: 2,
    MAX_WORKERS: 6,
    SCALE_UP_PRESSURE_THRESHOLD: 0.40,
    SCALE_UP_UTILIZATION_THRESHOLD: 0.75,
    SCALE_DOWN_PRESSURE_THRESHOLD: 0.15,
    SCALE_DOWN_UTILIZATION_THRESHOLD: 0.35,
    SCALE_UP_COOLDOWN_MS: 50,
    SCALE_DOWN_COOLDOWN_MS: 100,
    SCALE_SUSTAINED_WINDOW_MS: 50,
    BASE_PROCESSING_DELAY_MS: 5,
  };

  let queueManager: QueueManager;
  let retryController: RetryController;
  let batchProcessor: BatchProcessor;
  let sheddingPolicy: SheddingPolicy;
  let backpressureController: BackpressureController;
  let adaptiveEngine: AdaptiveDecisionEngine;
  let metricsCollector: MetricsCollector;
  let workerPool: WorkerPool;
  let workerScaler: WorkerScaler;

  beforeEach(() => {
    queueManager = new QueueManager(config);
    retryController = new RetryController(config, queueManager);
    batchProcessor = new BatchProcessor(config, retryController);
    sheddingPolicy = new SheddingPolicy(queueManager);
    backpressureController = new BackpressureController(config, queueManager);
    adaptiveEngine = new AdaptiveDecisionEngine(config, queueManager);

    metricsCollector = new MetricsCollector(
      queueManager,
      sheddingPolicy,
      backpressureController,
      adaptiveEngine,
      retryController
    );

    workerPool = new WorkerPool(
      config,
      queueManager,
      batchProcessor,
      sheddingPolicy,
      adaptiveEngine,
      retryController
    );
    workerPool.registerMetricsCollector(metricsCollector);

    workerScaler = new WorkerScaler(
      config,
      workerPool,
      queueManager,
      metricsCollector
    );
    metricsCollector.registerWorkerScaler(workerScaler);
  });

  afterEach(() => {
    workerScaler.stop();
    workerPool.stop();
  });

  const createEvent = (id: string, type: any = 'ORDER', priority: any = 'CRITICAL'): PipelineEvent => ({
    id,
    type,
    priority,
    payload: { price: 100 },
    createdAt: Date.now(),
    queuedAt: Date.now(),
    status: 'QUEUED',
  });

  it('TEST 1: Starts with minWorkers', () => {
    workerPool.start();
    expect(workerPool.getActiveWorkerCount()).toBe(config.MIN_WORKERS);
    const telemetry = workerScaler.getTelemetry();
    expect(telemetry.currentWorkers).toBe(config.MIN_WORKERS);
    expect(telemetry.minWorkers).toBe(2);
    expect(telemetry.maxWorkers).toBe(6);
  });

  it('TEST 2: Scales up when sustained compound conditions are met (pressure >= 40% AND backlog/utilization)', async () => {
    workerPool.start();
    expect(workerPool.getActiveWorkerCount()).toBe(2);

    // Enqueue 900 events to low queue (3000 capacity -> 30% pressure)
    // Needs 1200+ for >= 40% pressure
    for (let i = 0; i < 1300; i++) {
      queueManager.lowQueue.enqueue(createEvent(`LOW-${i}`, 'CLICK', 'LOW'));
    }

    const maxPressure = workerScaler.getMaxQueuePressure();
    expect(maxPressure).toBeGreaterThanOrEqual(0.40);

    // First evaluation: condition is detected, starts sustained window timer
    await workerScaler.evaluate();
    expect(workerPool.getActiveWorkerCount()).toBe(2);

    // Wait for sustained window (50ms)
    await new Promise((r) => setTimeout(r, 60));

    // Second evaluation after sustained window: should trigger scale up to 4
    await workerScaler.evaluate();
    expect(workerPool.getActiveWorkerCount()).toBe(4);
    expect(workerScaler.scaleUpCount).toBe(1);
    expect(workerScaler.lastScalingAction?.direction).toBe('UP');
    expect(workerScaler.lastScalingAction?.previousWorkers).toBe(2);
    expect(workerScaler.lastScalingAction?.newWorkers).toBe(4);
  });

  it('TEST 3: Does NOT scale up from backlog increase alone if pressure < 40%', async () => {
    workerPool.start();
    expect(workerPool.getActiveWorkerCount()).toBe(2);

    // Enqueue 300 events to low queue (300 / 3000 = 10% pressure, well below 40%)
    for (let i = 0; i < 300; i++) {
      queueManager.lowQueue.enqueue(createEvent(`LOW-${i}`, 'CLICK', 'LOW'));
    }

    await workerScaler.evaluate();
    await new Promise((r) => setTimeout(r, 60));
    await workerScaler.evaluate();

    // Must NOT scale up because pressure < 40%
    expect(workerPool.getActiveWorkerCount()).toBe(2);
    expect(workerScaler.scaleUpCount).toBe(0);
  });

  it('TEST 4: Does NOT exceed maxWorkers', async () => {
    workerPool.start();
    // Fill critical queue to 90% (1800 items)
    for (let i = 0; i < 1800; i++) {
      queueManager.criticalQueue.enqueue(createEvent(`CRIT-${i}`, 'ORDER', 'CRITICAL'));
    }

    // Step 1: Scale 2 -> 4
    await workerScaler.evaluate();
    await new Promise((r) => setTimeout(r, 60));
    await workerScaler.evaluate();
    expect(workerPool.getActiveWorkerCount()).toBe(4);

    // Wait for cooldown
    await new Promise((r) => setTimeout(r, 60));

    // Step 2: Scale 4 -> 6 (maxWorkers)
    await workerScaler.evaluate();
    await new Promise((r) => setTimeout(r, 60));
    await workerScaler.evaluate();
    expect(workerPool.getActiveWorkerCount()).toBe(6);

    // Wait for cooldown
    await new Promise((r) => setTimeout(r, 60));

    // Step 3: Should not scale past maxWorkers (6)
    await workerScaler.evaluate();
    await new Promise((r) => setTimeout(r, 60));
    await workerScaler.evaluate();
    expect(workerPool.getActiveWorkerCount()).toBe(6);
  });

  it('TEST 5: Scales down when pressure, backlog, and utilization are low', async () => {
    workerPool.start();
    // Manually scale to 4
    await workerPool.scaleTo(4);
    expect(workerPool.getActiveWorkerCount()).toBe(4);

    // All queues empty, 0% pressure, 0 utilization
    expect(workerScaler.getMaxQueuePressure()).toBe(0);

    // First evaluation starts scale down sustained timer
    await workerScaler.evaluate();
    expect(workerPool.getActiveWorkerCount()).toBe(4);

    // Wait for scale down sustained window (50 * 2 = 100ms)
    await new Promise((r) => setTimeout(r, 120));

    // Second evaluation triggers scale down to 2 (minWorkers)
    await workerScaler.evaluate();
    expect(workerPool.getActiveWorkerCount()).toBe(2);
    expect(workerScaler.scaleDownCount).toBe(1);
    expect(workerScaler.lastScalingAction?.direction).toBe('DOWN');
  });

  it('TEST 6: Does NOT scale down below minWorkers', async () => {
    workerPool.start();
    expect(workerPool.getActiveWorkerCount()).toBe(2);

    await workerScaler.evaluate();
    await new Promise((r) => setTimeout(r, 120));
    await workerScaler.evaluate();

    expect(workerPool.getActiveWorkerCount()).toBe(2);
    expect(workerScaler.scaleDownCount).toBe(0);
  });

  it('TEST 7: Cooldown prevents repeated oscillation', async () => {
    workerPool.start();
    for (let i = 0; i < 1500; i++) {
      queueManager.lowQueue.enqueue(createEvent(`LOW-${i}`, 'CLICK', 'LOW'));
    }

    await workerScaler.evaluate();
    await new Promise((r) => setTimeout(r, 60));
    await workerScaler.evaluate();
    expect(workerPool.getActiveWorkerCount()).toBe(4);

    // Immediate next evaluation without waiting for cooldown (50ms cooldown)
    await workerScaler.evaluate();
    // Still 4, not 6 yet because cooldown is active
    expect(workerPool.getActiveWorkerCount()).toBe(4);
  });

  it('TEST 8: Dynamically added workers actually process real events', async () => {
    let processedIds = new Set<string>();
    workerPool.setListeners(
      ({ event }) => {
        processedIds.add(event.id);
      },
      () => {}
    );

    workerPool.start();
    await workerPool.scaleTo(4);
    expect(workerPool.getActiveWorkerCount()).toBe(4);

    for (let i = 0; i < 20; i++) {
      queueManager.criticalQueue.enqueue(createEvent(`CRIT-SCALE-${i}`));
    }

    // Wait for workers to process events
    await new Promise((r) => setTimeout(r, 150));
    expect(processedIds.size).toBeGreaterThan(0);

    const statuses = workerPool.getWorkerStatuses();
    expect(statuses.length).toBe(4);
    const totalProcessed = statuses.reduce((sum, s) => sum + s.processedCount, 0);
    expect(totalProcessed).toBeGreaterThan(0);
  });

  it('TEST 9: Graceful scale down lets in-flight work finish and removes worker', async () => {
    workerPool.start();
    await workerPool.scaleTo(4);
    expect(workerPool.getActiveWorkerCount()).toBe(4);

    // Scale down to 2
    await workerPool.scaleTo(2);
    // Active worker count drops immediately
    expect(workerPool.getActiveWorkerCount()).toBe(2);

    // Allow loops to safely exit
    await new Promise((r) => setTimeout(r, 50));
    expect(workerPool.getTotalWorkerCount()).toBe(2);
  });

  it('TEST 10: Fault tolerance still works seamlessly with scaled workers', async () => {
    workerPool.start();
    await workerPool.scaleTo(4);

    retryController.armFailure('ORDER', 'single');
    expect(retryController.isArmed()).toBe(true);

    const event = createEvent('ORDER-FT-TEST', 'ORDER', 'CRITICAL');
    await workerPool.processSingleEvent(event, 'STREAM', 'worker-4');

    // Event failed and was scheduled for retry
    expect(retryController.retryAttempts).toBe(1);
    expect(event.status).toBe('RETRYING');
  });

  it('TEST 11: Scaling history records only actual worker count transitions', async () => {
    workerPool.start();
    for (let i = 0; i < 1500; i++) {
      queueManager.lowQueue.enqueue(createEvent(`LOW-${i}`, 'CLICK', 'LOW'));
    }

    // Trigger scale up
    await workerScaler.evaluate();
    await new Promise((r) => setTimeout(r, 60));
    await workerScaler.evaluate();

    const telemetry = workerScaler.getTelemetry();
    expect(telemetry.scalingHistory.length).toBe(1);
    expect(telemetry.scalingHistory[0].direction).toBe('UP');
    expect(telemetry.scalingHistory[0].previousWorkers).toBe(2);
    expect(telemetry.scalingHistory[0].newWorkers).toBe(4);
    expect(telemetry.scalingHistory[0].reason).toContain('Sustained high load');

    // Run evaluation while stable: should NOT add a fake entry
    await workerScaler.evaluate();
    expect(workerScaler.getTelemetry().scalingHistory.length).toBe(1);
  });

  it('TEST 12: Telemetry Snapshot contains accurate workerScaling object', () => {
    workerPool.start();
    const snapshot = metricsCollector.getSnapshot();
    expect(snapshot.workerScaling).toBeDefined();
    expect(snapshot.workerScaling.currentWorkers).toBe(2);
    expect(snapshot.workerScaling.minWorkers).toBe(2);
    expect(snapshot.workerScaling.maxWorkers).toBe(6);
    expect(Array.isArray(snapshot.workerScaling.workers)).toBe(true);
    expect(snapshot.workerScaling.workers.length).toBe(2);
  });
});
