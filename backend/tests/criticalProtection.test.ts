import { describe, it, expect, beforeEach } from 'vitest';
import { SheddingPolicy } from '../src/backpressure/sheddingPolicy.js';
import { QueueManager } from '../src/queues/queueManager.js';
import { DEFAULT_CONFIG } from '../src/config/pipelineConfig.js';
import { PipelineEvent } from '../src/models/event.js';

describe('Critical Event Protection & Fail-safe Shedding', () => {
  let queueManager: QueueManager;
  let sheddingPolicy: SheddingPolicy;

  beforeEach(() => {
    queueManager = new QueueManager(DEFAULT_CONFIG);
    sheddingPolicy = new SheddingPolicy(queueManager);
  });

  it('sheds low-priority click and log events with audit logs', () => {
    for (let i = 0; i < 10; i++) {
      queueManager.lowQueue.enqueue({
        id: `click_${i}`,
        type: 'CLICK',
        priority: 'LOW',
        payload: {},
        createdAt: Date.now(),
        queuedAt: Date.now(),
        status: 'QUEUED',
      });
    }

    const result = sheddingPolicy.executeShedding(5, 'QUEUE_PRESSURE_EXCEEDED');
    expect(result.shedCount).toBe(5);
    expect(result.safetyViolations).toBe(0);
    expect(result.entries.length).toBe(5);
    expect(result.entries[0].reason).toBe('QUEUE_PRESSURE_EXCEEDED');
    expect(queueManager.lowQueue.size()).toBe(5);
  });

  it('safely intercepts any critical event attempting to be shed without crashing', () => {
    // Deliberately place a CRITICAL event in the low queue to test fail-safe intercept
    const criticalEvent: PipelineEvent = {
      id: 'crit_payment_99',
      type: 'PAYMENT',
      priority: 'CRITICAL',
      payload: { amount: 250 },
      createdAt: Date.now(),
      queuedAt: Date.now(),
      status: 'QUEUED',
    };
    queueManager.lowQueue.enqueue(criticalEvent);

    // Call shedding
    const result = sheddingPolicy.executeShedding(1, 'TEST_SHED');

    // Verification:
    // 1. Critical event was NOT shed
    expect(result.shedCount).toBe(0);
    // 2. Safety violation was recorded
    expect(result.safetyViolations).toBe(1);
    expect(sheddingPolicy.totalSafetyViolations).toBe(1);
    // 3. Critical event was safely routed to the protected critical queue!
    expect(queueManager.criticalQueue.size()).toBe(1);
    expect(queueManager.criticalQueue.peek()?.id).toBe('crit_payment_99');
  });
});
