import { describe, it, expect, beforeEach } from 'vitest';
import { DuplicateDetector } from '../src/resilience/duplicateDetector.js';
import { QueueManager } from '../src/queues/queueManager.js';
import { DEFAULT_CONFIG } from '../src/config/pipelineConfig.js';
import { PipelineEvent } from '../src/models/event.js';
import { PriorityRouter } from '../src/router/priorityRouter.js';
import { SheddingPolicy } from '../src/backpressure/sheddingPolicy.js';
import { MetricsCollector } from '../src/metrics/metricsCollector.js';
import { BackpressureController } from '../src/backpressure/backpressureController.js';
import { AdaptiveDecisionEngine } from '../src/decision-engine/adaptiveEngine.js';
import { RetryController } from '../src/resilience/retryController.js';
import { WorkerPool } from '../src/processing/workerPool.js';
import { BatchProcessor } from '../src/processing/batchProcessor.js';

describe('Stretch Feature 3 — Redundant / Duplicate Event Detection', () => {
  let detector: DuplicateDetector;
  let queueManager: QueueManager;
  let sheddingPolicy: SheddingPolicy;
  let backpressureController: BackpressureController;
  let adaptiveEngine: AdaptiveDecisionEngine;
  let retryController: RetryController;
  let metricsCollector: MetricsCollector;
  let priorityRouter: PriorityRouter;

  beforeEach(() => {
    detector = new DuplicateDetector(60, 10000);

    const config = { ...DEFAULT_CONFIG, RETRY_BACKOFF_BASE_MS: 10 };
    queueManager = new QueueManager(config);
    sheddingPolicy = new SheddingPolicy(queueManager);
    backpressureController = new BackpressureController(config, queueManager);
    adaptiveEngine = new AdaptiveDecisionEngine(config, queueManager);
    retryController = new RetryController(config, queueManager);

    metricsCollector = new MetricsCollector(
      queueManager,
      sheddingPolicy,
      backpressureController,
      adaptiveEngine,
      retryController
    );
    metricsCollector.registerDuplicateDetector(detector);

    priorityRouter = new PriorityRouter(queueManager, sheddingPolicy, metricsCollector);
  });

  const createEvent = (id: string, type: any = 'ORDER', priority: any = 'CRITICAL'): PipelineEvent => ({
    id,
    type,
    priority,
    payload: { amount: 99.99 },
    createdAt: Date.now(),
    queuedAt: Date.now(),
    status: 'QUEUED',
  });

  it('TEST 1: Initial event is admitted as NEW', () => {
    const result = detector.checkAndRegister('EVT-101', 'ORDER', 'CRITICAL');

    expect(result.isDuplicate).toBe(false);
    expect(result.reason).toBeUndefined();
    expect(detector.duplicatesDetected).toBe(0);
    expect(detector.duplicatesPrevented).toBe(0);

    const telemetry = detector.getTelemetry();
    expect(telemetry.activeRegistryEntries).toBe(1);
    expect(telemetry.duplicatesDetected).toBe(0);
  });

  it('TEST 2: Duplicate external event with same Event ID is blocked', () => {
    const res1 = detector.checkAndRegister('EVT-202', 'ORDER', 'CRITICAL');
    expect(res1.isDuplicate).toBe(false);

    const res2 = detector.checkAndRegister('EVT-202', 'ORDER', 'CRITICAL');
    expect(res2.isDuplicate).toBe(true);
    expect(res2.reason).toContain("Event ID 'EVT-202' already admitted");
    expect(res2.entry).toBeDefined();
    expect(res2.entry?.eventId).toBe('EVT-202');

    expect(detector.duplicatesDetected).toBe(1);
    expect(detector.duplicatesPrevented).toBe(1);

    const telemetry = detector.getTelemetry();
    expect(telemetry.duplicatesDetected).toBe(1);
    expect(telemetry.duplicatesPrevented).toBe(1);
    expect(telemetry.recentDuplicates.length).toBe(1);
    expect(telemetry.recentDuplicates[0].eventId).toBe('EVT-202');
  });

  it('TEST 3: Duplicate event is rejected before entering queues (pipeline remains untainted)', () => {
    const event1 = createEvent('EVT-303');
    const check1 = detector.checkAndRegister(event1.id, event1.type, event1.priority);

    if (!check1.isDuplicate) {
      metricsCollector.recordIncomingEvent(event1);
      priorityRouter.route(event1);
    }

    expect(queueManager.criticalQueue.size()).toBe(1);
    expect(metricsCollector.totalReceived).toBe(1);

    // Duplicate submission attempt
    const event2 = createEvent('EVT-303');
    const check2 = detector.checkAndRegister(event2.id, event2.type, event2.priority);

    if (!check2.isDuplicate) {
      metricsCollector.recordIncomingEvent(event2);
      priorityRouter.route(event2);
    }

    // Pipeline must NOT have enqueued or admitted the duplicate
    expect(check2.isDuplicate).toBe(true);
    expect(queueManager.criticalQueue.size()).toBe(1);
    expect(metricsCollector.totalReceived).toBe(1);
    expect(detector.duplicatesPrevented).toBe(1);
  });

  it('TEST 4: duplicatesPrevented counter increments accurately across multiple duplicate attempts', () => {
    detector.checkAndRegister('EVT-404', 'PAYMENT', 'CRITICAL');

    // Attempt 5 duplicates
    for (let i = 0; i < 5; i++) {
      const res = detector.checkAndRegister('EVT-404', 'PAYMENT', 'CRITICAL');
      expect(res.isDuplicate).toBe(true);
    }

    expect(detector.duplicatesDetected).toBe(5);
    expect(detector.duplicatesPrevented).toBe(5);
    expect(detector.getTelemetry().recentDuplicates.length).toBe(5);
  });

  it('TEST 5: Concurrent identical events admit exactly 1 and reject remaining', () => {
    const concurrentCount = 10;
    const results: boolean[] = [];

    for (let i = 0; i < concurrentCount; i++) {
      const check = detector.checkAndRegister('EVT-CONCURRENT-555', 'INVENTORY', 'HIGH');
      results.push(check.isDuplicate);
    }

    const admitted = results.filter((isDup) => !isDup).length;
    const rejected = results.filter((isDup) => isDup).length;

    expect(admitted).toBe(1);
    expect(rejected).toBe(9);
    expect(detector.duplicatesPrevented).toBe(9);
  });

  it('TEST 6: Internal fault-tolerance retries bypass external admission check and are protected by Idempotency', async () => {
    const batchProcessor = new BatchProcessor({ ...DEFAULT_CONFIG, RETRY_BACKOFF_BASE_MS: 10 }, retryController);
    const workerPool = new WorkerPool(
      DEFAULT_CONFIG,
      queueManager,
      batchProcessor,
      sheddingPolicy,
      adaptiveEngine,
      retryController
    );

    const event = createEvent('EVT-RETRY-606', 'ORDER', 'CRITICAL');

    // 1. External admission: Admitted by DuplicateDetector
    const externalAdmission = detector.checkAndRegister(event.id, event.type, event.priority);
    expect(externalAdmission.isDuplicate).toBe(false);

    metricsCollector.recordIncomingEvent(event);
    priorityRouter.route(event);
    expect(queueManager.criticalQueue.size()).toBe(1);

    // Worker dequeues event for processing
    const processingEvent = queueManager.criticalQueue.dequeue()!;
    expect(queueManager.criticalQueue.size()).toBe(0);

    // 2. Worker executes business side effect once
    const firstSideEffect = retryController.applySideEffect(processingEvent, 'worker-1');
    expect(firstSideEffect).toBe(true);
    expect(retryController.isCompleted(processingEvent.id)).toBe(true);

    // 3. Worker experiences failure and triggers retry
    retryController.handleFailedEvent(processingEvent, 'worker-1', 'Simulated failure during checkout');
    expect(processingEvent.retryCount).toBe(1);
    expect(processingEvent.status).toBe('RETRYING');

    // Wait for retry backoff and requeue
    await new Promise((resolve) => setTimeout(resolve, 30));

    // Event is re-queued directly with original Event ID
    expect(queueManager.criticalQueue.size()).toBe(1);

    // 4. Retried event re-processed: Idempotency check prevents duplicate business side effect
    const retriedEvent = queueManager.criticalQueue.dequeue()!;
    const secondSideEffect = retryController.applySideEffect(retriedEvent, 'worker-2');
    expect(secondSideEffect).toBe(false); // Side effect prevented!
    expect(retryController.duplicatesPrevented).toBe(1);

    // 5. Verification of separated responsibilities:
    // DuplicateDetector handled external admission (0 external duplicates blocked for this event)
    expect(detector.duplicatesPrevented).toBe(0);
    // RetryController handled internal retry protection (1 business duplicate prevented)
    expect(retryController.duplicatesPrevented).toBe(1);
  });

  it('TEST 7: TTL expiration allows same Event ID to be admitted again after window expires', async () => {
    // Fast TTL detector: 0.1s (100ms)
    const shortTtlDetector = new DuplicateDetector(0.1, 100);

    const first = shortTtlDetector.checkAndRegister('EVT-TTL-707', 'CLICK', 'LOW');
    expect(first.isDuplicate).toBe(false);

    // Immediate re-check -> Blocked
    const immediate = shortTtlDetector.checkAndRegister('EVT-TTL-707', 'CLICK', 'LOW');
    expect(immediate.isDuplicate).toBe(true);

    // Wait for TTL (120ms)
    await new Promise((resolve) => setTimeout(resolve, 120));

    // Expired -> Should be admitted as fresh entry
    const afterExpiry = shortTtlDetector.checkAndRegister('EVT-TTL-707', 'CLICK', 'LOW');
    expect(afterExpiry.isDuplicate).toBe(false);
  });

  it('TEST 8: LRU bounded capacity evicts oldest entry when max capacity is reached', () => {
    // Small capacity detector: 3 entries
    const lruDetector = new DuplicateDetector(60, 3);

    lruDetector.checkAndRegister('ID-1', 'LOG', 'LOW');
    lruDetector.checkAndRegister('ID-2', 'LOG', 'LOW');
    lruDetector.checkAndRegister('ID-3', 'LOG', 'LOW');

    expect(lruDetector.getTelemetry().activeRegistryEntries).toBe(3);

    // Adding 4th entry evicts ID-1 (oldest)
    lruDetector.checkAndRegister('ID-4', 'LOG', 'LOW');
    expect(lruDetector.getTelemetry().activeRegistryEntries).toBe(3);

    // ID-1 was evicted and can now be re-registered as NEW
    const recheck1 = lruDetector.checkAndRegister('ID-1', 'LOG', 'LOW');
    expect(recheck1.isDuplicate).toBe(false);

    // ID-4 is still in registry -> Duplicate
    const recheck4 = lruDetector.checkAndRegister('ID-4', 'LOG', 'LOW');
    expect(recheck4.isDuplicate).toBe(true);
  });

  it('TEST 9: Accounting invariant strictly holds (rejected duplicates do not increment totalReceived)', () => {
    // Submit 5 distinct external events
    for (let i = 1; i <= 5; i++) {
      const id = `EVT-INV-${i}`;
      const check = detector.checkAndRegister(id, 'ORDER', 'CRITICAL');
      if (!check.isDuplicate) {
        const ev = createEvent(id);
        metricsCollector.recordIncomingEvent(ev);
        priorityRouter.route(ev);
      }
    }

    // Submit 10 duplicate attempts of EVT-INV-1
    for (let i = 0; i < 10; i++) {
      const check = detector.checkAndRegister('EVT-INV-1', 'ORDER', 'CRITICAL');
      if (!check.isDuplicate) {
        const ev = createEvent('EVT-INV-1');
        metricsCollector.recordIncomingEvent(ev);
        priorityRouter.route(ev);
      }
    }

    const snapshot = metricsCollector.getSnapshot();

    // totalReceived must be exactly 5, NOT 15
    expect(snapshot.totalReceived).toBe(5);
    expect(snapshot.duplicateDetection?.duplicatesPrevented).toBe(10);

    // Strict accounting invariant check:
    // DIFF = totalReceived - (processed + queued + shed + inFlight) === 0
    const totalQueued = snapshot.criticalQueueSize + snapshot.highQueueSize + snapshot.lowQueueSize;
    const inFlight = 0;
    const diff = snapshot.totalReceived - (snapshot.totalProcessed + totalQueued + snapshot.shedCount + inFlight);
    expect(diff).toBe(0);
  });
});
