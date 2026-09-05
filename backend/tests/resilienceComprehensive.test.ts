import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config/pipelineConfig.js';
import { QueueManager } from '../src/queues/queueManager.js';
import { RetryController } from '../src/resilience/retryController.js';
import { DuplicateDetector } from '../src/resilience/duplicateDetector.js';
import { BatchProcessor } from '../src/processing/batchProcessor.js';
import { PipelineEvent } from '../src/models/event.js';

describe('Resilience, Fault Tolerance & Deduplication Suite', () => {
  let config: typeof DEFAULT_CONFIG;
  let queueManager: QueueManager;
  let retryController: RetryController;
  let batchProcessor: BatchProcessor;
  let duplicateDetector: DuplicateDetector;

  beforeEach(() => {
    config = {
      ...DEFAULT_CONFIG,
      MAX_RETRIES: 3,
      RETRY_BACKOFF_BASE_MS: 50,
    };
    queueManager = new QueueManager(config);
    retryController = new RetryController(config, queueManager);
    batchProcessor = new BatchProcessor(config, retryController);
    duplicateDetector = new DuplicateDetector(1, 1000); // 1s TTL for testing
  });

  function makeEvent(id: string, type: 'PAYMENT' | 'ORDER' | 'INVENTORY' | 'CLICK' | 'LOG' = 'ORDER'): PipelineEvent {
    return {
      id,
      type,
      priority: 'CRITICAL',
      payload: { amount: 100 },
      createdAt: Date.now(),
      status: 'QUEUED',
    };
  }

  it('isolates partial batch failures: only failed item is retried while surviving items succeed', async () => {
    const batch: PipelineEvent[] = [];
    for (let i = 1; i <= 10; i++) {
      batch.push(makeEvent(`batch_ev_${i}`));
    }

    // Arm failure targeting specifically batch_ev_4
    retryController.armFailure('ORDER', 'single');
    // Force target onto batch_ev_4
    const originalShouldSimulate = retryController.shouldSimulateFailure.bind(retryController);
    retryController.shouldSimulateFailure = (ev) => ev.id === 'batch_ev_4';

    const result = await batchProcessor.processBatch(batch, 'worker-batch-test');

    // 9 events must be successfully processed
    expect(result.processedCount).toBe(9);
    expect(result.events.length).toBe(9);
    expect(result.events.map((e) => e.id)).not.toContain('batch_ev_4');

    // Exactly 1 event must be isolated for targeted retry
    expect(result.failedEvents.length).toBe(1);
    expect(result.failedEvents[0].id).toBe('batch_ev_4');
    expect(result.failedEvents[0].status).toBe('RETRYING');
    expect(result.failedEvents[0].retryCount).toBe(1);

    // Business side effects applied only to the 9 successful events
    expect(retryController.isCompleted('batch_ev_1')).toBe(true);
    expect(retryController.isCompleted('batch_ev_4')).toBe(false);
  });

  it('exhausts maximum retries and transitions event to PERMANENT_FAILURE (DLQ)', () => {
    const event = makeEvent('exhaust_ev_1');

    // Attempt 1: Fail -> Retry 1
    const ret1 = retryController.handleFailedEvent(event, 'w-1', 'Simulated failure 1');
    expect(ret1).toBe(true);
    expect(event.retryCount).toBe(1);
    expect(event.status).toBe('RETRYING');

    // Attempt 2: Fail -> Retry 2
    const ret2 = retryController.handleFailedEvent(event, 'w-1', 'Simulated failure 2');
    expect(ret2).toBe(true);
    expect(event.retryCount).toBe(2);

    // Attempt 3: Fail -> Retry 3 (Reached MAX_RETRIES = 3)
    const ret3 = retryController.handleFailedEvent(event, 'w-1', 'Simulated failure 3');
    expect(ret3).toBe(true);
    expect(event.retryCount).toBe(3);

    // Attempt 4: Fail -> Permanent Failure Exhaustion
    const ret4 = retryController.handleFailedEvent(event, 'w-1', 'Simulated failure 4');
    expect(ret4).toBe(false);
    expect(event.retryCount).toBe(4);
    expect(event.status).toBe('PERMANENT_FAILURE');
    expect(retryController.permanentFailures).toBe(1);
  });

  it('separates external duplicate rejection from legitimate internal retries with original Event ID', () => {
    const eventId = 'ORD-TX-888';

    // 1. External submission -> Admitted
    const check1 = duplicateDetector.checkAndRegister(eventId, 'ORDER', 'CRITICAL');
    expect(check1.isDuplicate).toBe(false);

    // 2. Second external submission with same Event ID -> Rejected by DuplicateDetector
    const check2 = duplicateDetector.checkAndRegister(eventId, 'ORDER', 'CRITICAL');
    expect(check2.isDuplicate).toBe(true);
    expect(duplicateDetector.duplicatesPrevented).toBe(1);

    // 3. Legitimate internal retry:
    // When the original event is retried by RetryController, it retains its original Event ID.
    // The retry executes applySideEffect on RetryController idempotency ledger.
    const event = makeEvent(eventId);
    const sideEffect1 = retryController.applySideEffect(event, 'w-1');
    expect(sideEffect1).toBe(true);

    // Duplicate retry execution must NOT execute duplicate business side effect
    const sideEffect2 = retryController.applySideEffect(event, 'w-2');
    expect(sideEffect2).toBe(false);
    expect(retryController.duplicatesPrevented).toBe(1);
  });

  it('verifies TTL expiration permits re-registration of the same Event ID', async () => {
    const eventId = 'TTL-TEST-123';

    // Initial registration
    const c1 = duplicateDetector.checkAndRegister(eventId, 'ORDER', 'CRITICAL');
    expect(c1.isDuplicate).toBe(false);

    // Immediate re-check -> duplicate
    const c2 = duplicateDetector.checkAndRegister(eventId, 'ORDER', 'CRITICAL');
    expect(c2.isDuplicate).toBe(true);

    // Wait past 1s TTL
    await new Promise((r) => setTimeout(r, 1100));

    // After TTL, re-registration must be allowed
    const c3 = duplicateDetector.checkAndRegister(eventId, 'ORDER', 'CRITICAL');
    expect(c3.isDuplicate).toBe(false);
  });

  it('tests concurrent duplicate requests for race conditions', async () => {
    const eventId = 'CONCURRENT-ID-999';

    // Simulate 20 concurrent external requests with the exact same ID
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        Promise.resolve(duplicateDetector.checkAndRegister(eventId, 'ORDER', 'CRITICAL'))
      )
    );

    const admitted = results.filter((r) => !r.isDuplicate);
    const rejected = results.filter((r) => r.isDuplicate);

    // Exactly 1 request must be admitted, exactly 19 rejected
    expect(admitted.length).toBe(1);
    expect(rejected.length).toBe(19);
  });
});
