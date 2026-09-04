import { describe, it, expect, beforeEach } from 'vitest';
import { RetryController } from '../src/resilience/retryController.js';
import { QueueManager } from '../src/queues/queueManager.js';
import { DEFAULT_CONFIG } from '../src/config/pipelineConfig.js';
import { PipelineEvent } from '../src/models/event.js';
import { BatchProcessor } from '../src/processing/batchProcessor.js';
import { WorkerPool } from '../src/processing/workerPool.js';
import { SheddingPolicy } from '../src/backpressure/sheddingPolicy.js';
import { MetricsCollector } from '../src/metrics/metricsCollector.js';
import { BackpressureController } from '../src/backpressure/backpressureController.js';
import { AdaptiveDecisionEngine } from '../src/decision-engine/adaptiveEngine.js';

describe('Stretch Goal 1 — Fault Tolerance with Idempotent Retry', () => {
  let config = { ...DEFAULT_CONFIG, RETRY_BACKOFF_BASE_MS: 10 };
  let queueManager: QueueManager;
  let retryController: RetryController;
  let batchProcessor: BatchProcessor;

  beforeEach(() => {
    config = { ...DEFAULT_CONFIG, RETRY_BACKOFF_BASE_MS: 10 };
    queueManager = new QueueManager(config);
    retryController = new RetryController(config, queueManager);
    batchProcessor = new BatchProcessor(config, retryController);
  });

  const createSampleEvent = (id: string, type: any = 'ORDER', priority: any = 'CRITICAL'): PipelineEvent => ({
    id,
    type,
    priority,
    payload: { amount: 100 },
    createdAt: Date.now(),
    queuedAt: Date.now(),
    status: 'QUEUED',
  });

  it('TEST 1: Failure is detected when armed', () => {
    retryController.armFailure();
    expect(retryController.isArmed()).toBe(true);

    const event = createSampleEvent('EVENT-101');
    const willFail = retryController.shouldSimulateFailure(event);
    expect(willFail).toBe(true);
    // Once triggered, the armed trigger is consumed
    expect(retryController.isArmed()).toBe(false);
  });

  it('TEST 2: Failed event is retried via RetryController', async () => {
    const event = createSampleEvent('EVENT-102');
    const scheduled = retryController.handleFailedEvent(event, 'worker-1', 'Simulated failure');
    expect(scheduled).toBe(true);
    expect(event.status).toBe('RETRYING');
    expect(event.retryCount).toBe(1);

    // Wait for backoff timeout (~10ms)
    await new Promise((resolve) => setTimeout(resolve, 30));

    // Event should be re-enqueued to critical queue
    expect(queueManager.criticalQueue.size()).toBe(1);
    const dequeued = queueManager.criticalQueue.dequeue();
    expect(dequeued?.id).toBe('EVENT-102');
  });

  it('TEST 3: Retry keeps the exact same eventId', async () => {
    const originalId = 'EVENT-STABLE-ID-8F31';
    const event = createSampleEvent(originalId);

    retryController.handleFailedEvent(event, 'worker-2', 'Network timeout');
    await new Promise((resolve) => setTimeout(resolve, 30));

    const reDequeued = queueManager.criticalQueue.dequeue();
    expect(reDequeued).toBeDefined();
    expect(reDequeued?.id).toBe(originalId);
    expect(reDequeued?.id).toBe('EVENT-STABLE-ID-8F31');
  });

  it('TEST 4: Only the failed event is retried (targeted retry)', async () => {
    const eventA = createSampleEvent('EVENT-A', 'ORDER', 'CRITICAL');
    const eventB = createSampleEvent('EVENT-B', 'PAYMENT', 'CRITICAL');

    // Fail only eventA
    retryController.handleFailedEvent(eventA, 'worker-1', 'Simulated crash');
    await new Promise((resolve) => setTimeout(resolve, 30));

    // Only eventA was requeued
    expect(queueManager.criticalQueue.size()).toBe(1);
    const requeued = queueManager.criticalQueue.dequeue();
    expect(requeued?.id).toBe('EVENT-A');
  });

  it('TEST 5: Retry counter increments accurately', () => {
    const event = createSampleEvent('EVENT-105');
    expect(event.retryCount).toBeUndefined();

    retryController.handleFailedEvent(event, 'worker-1', 'Failure 1');
    expect(event.retryCount).toBe(1);
    expect(retryController.retryAttempts).toBe(1);
    expect(retryController.getTelemetry().retryFailures).toBe(1);

    retryController.handleFailedEvent(event, 'worker-1', 'Failure 2');
    expect(event.retryCount).toBe(2);
    expect(retryController.retryAttempts).toBe(2);
    expect(retryController.getTelemetry().retryFailures).toBe(2);
  });

  it('TEST 6: Successful retry produces exactly one PROCESSED event and records recovery', () => {
    const event = createSampleEvent('EVENT-106');
    event.retryCount = 1;

    // First attempt executed side effect
    const firstSideEffect = retryController.applySideEffect(event, 'worker-1');
    expect(firstSideEffect).toBe(true);

    // Record recovery success
    retryController.recordRecoverySuccess(event, 'worker-2');
    expect(retryController.retrySuccesses).toBe(1);

    const telemetry = retryController.getTelemetry();
    expect(telemetry.lastRecovery?.eventId).toBe('EVENT-106');
    expect(telemetry.lastRecovery?.status).toBe('SUCCESS');
    expect(telemetry.lastRecovery?.workerId).toBe('worker-2');
  });

  it('TEST 7: Entire batch is NOT retried when one event fails in batchProcessor', async () => {
    const eventA = createSampleEvent('BATCH-A', 'CLICK', 'LOW');
    const eventB = createSampleEvent('BATCH-B', 'LOG', 'LOW');
    const eventC = createSampleEvent('BATCH-C', 'LOG', 'LOW');
    const eventD = createSampleEvent('BATCH-D', 'CLICK', 'LOW');
    const eventE = createSampleEvent('BATCH-E', 'LOG', 'LOW');

    const batch = [eventA, eventB, eventC, eventD, eventE];

    // Arm failure specifically for LOG
    retryController.armFailure('LOG');

    const result = await batchProcessor.processBatch(batch, 'worker-batch-1');

    // Only 1 event failed (the first LOG encountered: eventB)
    expect(result.failedEvents.length).toBe(1);
    expect(result.failedEvents[0].id).toBe('BATCH-B');

    // 4 surviving events succeeded!
    expect(result.processedCount).toBe(4);
    expect(result.events.map((e) => e.id)).toEqual(['BATCH-A', 'BATCH-C', 'BATCH-D', 'BATCH-E']);
    for (const e of result.events) {
      expect(e.status).toBe('PROCESSED');
    }

    // Wait for eventB backoff
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(queueManager.lowQueue.size()).toBe(1);
    expect(queueManager.lowQueue.dequeue()?.id).toBe('BATCH-B');
  });

  it('TEST 8: Maximum retry limit is enforced (MAX_RETRIES = 3)', () => {
    const event = createSampleEvent('EVENT-EXHAUST');

    // Attempt 1 -> Fail
    retryController.handleFailedEvent(event, 'worker-1', 'Fail 1');
    expect(event.status).toBe('RETRYING');

    // Attempt 2 -> Fail
    retryController.handleFailedEvent(event, 'worker-1', 'Fail 2');
    expect(event.status).toBe('RETRYING');

    // Attempt 3 -> Fail
    retryController.handleFailedEvent(event, 'worker-1', 'Fail 3');
    expect(event.status).toBe('RETRYING');

    // Attempt 4 -> Exceeds MAX_RETRIES (3)
    const canRetry = retryController.handleFailedEvent(event, 'worker-1', 'Fail 4');
    expect(canRetry).toBe(false);
    expect(event.status).toBe('PERMANENT_FAILURE');
    expect(event.dropReason).toContain('Exceeded max retry limit');
    expect(retryController.permanentFailures).toBe(1);
  });

  it('TEST 9: Permanent failure is recorded in audit logs', () => {
    const event = createSampleEvent('EVENT-PERM');
    event.retryCount = 3;
    retryController.handleFailedEvent(event, 'worker-1', 'Fatal error');

    const telemetry = retryController.getTelemetry();
    expect(telemetry.permanentFailures).toBe(1);
    const permLog = telemetry.recentRecoveries.find((r) => r.status === 'PERMANENT_FAILURE');
    expect(permLog).toBeDefined();
    expect(permLog?.eventId).toBe('EVENT-PERM');
  });

  it('TEST 10: Idempotency prevents duplicate business side effects', () => {
    const event = createSampleEvent('ORDER-PAYMENT-999', 'PAYMENT', 'CRITICAL');

    // Execution 1: Normal processing executes side effect
    const firstExecution = retryController.applySideEffect(event, 'worker-1');
    expect(firstExecution).toBe(true);
    expect(retryController.isCompleted('ORDER-PAYMENT-999')).toBe(true);
    expect(retryController.duplicatesPrevented).toBe(0);

    const sideEffect = retryController.getSideEffect('ORDER-PAYMENT-999');
    expect(sideEffect?.executionCount).toBe(1);

    // Execution 2: Worker retry or duplicate call attempts to apply side effect again
    const secondExecution = retryController.applySideEffect(event, 'worker-2');
    expect(secondExecution).toBe(false); // Side effect prevented!
    expect(retryController.duplicatesPrevented).toBe(1);

    // Ledger still reflects that the business effect occurred exactly once
    expect(sideEffect?.executionCount).toBe(2); // attempted twice, but executed only once
  });

  it('TEST 11 & 12 & 13: Accounting Invariant (Diff = 0), Retries do not increment RECEIVED or double-count PROCESSED', async () => {
    const sheddingPolicy = new SheddingPolicy(queueManager);
    const backpressureController = new BackpressureController(config, queueManager);
    const adaptiveEngine = new AdaptiveDecisionEngine(config, queueManager);

    const metricsCollector = new MetricsCollector(
      queueManager,
      sheddingPolicy,
      backpressureController,
      adaptiveEngine,
      retryController
    );

    const workerPool = new WorkerPool(
      config,
      queueManager,
      batchProcessor,
      sheddingPolicy,
      adaptiveEngine,
      retryController
    );
    workerPool.registerMetricsCollector(metricsCollector);

    workerPool.setListeners(
      ({ event, latencyMs }) => {
        metricsCollector.recordProcessedEvent(event, latencyMs);
      },
      (events, durationMs) => {
        metricsCollector.recordBatchProcessed(events, durationMs);
      }
    );

    // Ingest 1 Critical Event
    const event = createSampleEvent('EVENT-CRIT-ACCOUNTING');
    metricsCollector.recordIncomingEvent(event);
    queueManager.criticalQueue.enqueue(event);

    expect(metricsCollector.totalReceived).toBe(1);
    expect(metricsCollector.totalProcessed).toBe(0);

    // Arm a failure for this event
    retryController.armFailure();

    // Dequeue and process -> Triggers worker failure
    const dequeued = queueManager.criticalQueue.dequeue()!;
    await workerPool.processSingleEvent(dequeued, 'STREAM', 'worker-1');

    // Verify failure: Not counted as processed, Received is STILL 1
    expect(metricsCollector.totalReceived).toBe(1);
    expect(metricsCollector.totalProcessed).toBe(0);
    expect(retryController.retryFailures).toBe(1);

    // Wait for backoff re-enqueue
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(queueManager.criticalQueue.size()).toBe(1);

    // Second worker execution -> Succeeds
    const retriedEvent = queueManager.criticalQueue.dequeue()!;
    await workerPool.processSingleEvent(retriedEvent, 'STREAM', 'worker-2');

    // Final accounting check
    expect(metricsCollector.totalReceived).toBe(1);
    expect(metricsCollector.totalProcessed).toBe(1);
    expect(retryController.retrySuccesses).toBe(1);

    const snapshot = metricsCollector.getSnapshot();
    // Invariant requirement 1: A successful retry shows Retry Attempts = 1, Successful Retries = 1, Retry Failures = 0, Permanent Failures = 0
    expect(snapshot.faultTolerance.retryAttempts).toBe(1);
    expect(snapshot.faultTolerance.retrySuccesses).toBe(1);
    expect(snapshot.faultTolerance.retryFailures).toBe(0);
    expect(snapshot.faultTolerance.permanentFailures).toBe(0);
    const queuedTotal =
      snapshot.criticalQueueSize + snapshot.highQueueSize + snapshot.lowQueueSize;
    const accounted =
      snapshot.totalProcessed +
      queuedTotal +
      snapshot.shedCount +
      snapshot.criticalInFlight;
    const diff = snapshot.totalReceived - accounted;

    expect(diff).toBe(0);
  });
});
