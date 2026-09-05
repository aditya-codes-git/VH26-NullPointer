import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config/pipelineConfig.js';
import { QueueManager } from '../src/queues/queueManager.js';
import { SheddingPolicy } from '../src/backpressure/sheddingPolicy.js';
import { BackpressureController } from '../src/backpressure/backpressureController.js';
import { AdaptiveDecisionEngine } from '../src/decision-engine/adaptiveEngine.js';
import { MetricsCollector } from '../src/metrics/metricsCollector.js';
import { PriorityRouter } from '../src/router/priorityRouter.js';
import { WorkerPool } from '../src/processing/workerPool.js';
import { BatchProcessor } from '../src/processing/batchProcessor.js';
import { PipelineEvent } from '../src/models/event.js';

describe('Event Accounting Invariant & LOW Queue Dynamics', () => {
  let config: typeof DEFAULT_CONFIG;
  let queueManager: QueueManager;
  let sheddingPolicy: SheddingPolicy;
  let backpressureController: BackpressureController;
  let adaptiveEngine: AdaptiveDecisionEngine;
  let metricsCollector: MetricsCollector;
  let priorityRouter: PriorityRouter;
  let batchProcessor: BatchProcessor;
  let workerPool: WorkerPool;

  beforeEach(() => {
    config = { ...DEFAULT_CONFIG };
    queueManager = new QueueManager(config);
    sheddingPolicy = new SheddingPolicy(queueManager);
    backpressureController = new BackpressureController(config, queueManager);
    adaptiveEngine = new AdaptiveDecisionEngine(config, queueManager);
    metricsCollector = new MetricsCollector(
      queueManager,
      sheddingPolicy,
      backpressureController,
      adaptiveEngine
    );
    priorityRouter = new PriorityRouter(queueManager, sheddingPolicy, metricsCollector);
    batchProcessor = new BatchProcessor(config);
    workerPool = new WorkerPool(config, queueManager, batchProcessor, sheddingPolicy, adaptiveEngine);
    workerPool.registerMetricsCollector(metricsCollector);
  });

  function createEvent(id: string, type: 'PAYMENT' | 'ORDER' | 'INVENTORY' | 'CLICK' | 'LOG', priority: 'CRITICAL' | 'HIGH' | 'LOW'): PipelineEvent {
    return {
      id,
      type,
      priority,
      payload: {},
      createdAt: Date.now(),
      status: 'QUEUED',
    };
  }

  it('preserves the conservation law: RECEIVED = PROCESSED + QUEUED + SHED + IN_FLIGHT under standard flow', () => {
    // Ingest 30 events (10 of each priority)
    for (let i = 1; i <= 10; i++) {
      const crit = createEvent(`c_${i}`, 'PAYMENT', 'CRITICAL');
      metricsCollector.recordIncomingEvent(crit);
      priorityRouter.route(crit);

      const high = createEvent(`h_${i}`, 'INVENTORY', 'HIGH');
      metricsCollector.recordIncomingEvent(high);
      priorityRouter.route(high);

      const low = createEvent(`l_${i}`, 'CLICK', 'LOW');
      metricsCollector.recordIncomingEvent(low);
      priorityRouter.route(low);
    }

    const snap1 = metricsCollector.getSnapshot();
    const queued1 = queueManager.getTotalQueued();
    const sum1 = snap1.totalProcessed + queued1 + snap1.shedCount + snap1.criticalInFlight;
    expect(snap1.totalReceived).toBe(30);
    expect(queued1).toBe(30);
    expect(sum1).toBe(snap1.totalReceived);

    // Now process 5 critical events
    for (let i = 1; i <= 5; i++) {
      const ev = queueManager.criticalQueue.dequeue()!;
      metricsCollector.recordProcessedEvent(ev, 10);
    }

    const snap2 = metricsCollector.getSnapshot();
    const queued2 = queueManager.getTotalQueued();
    const sum2 = snap2.totalProcessed + queued2 + snap2.shedCount + snap2.criticalInFlight;
    expect(snap2.totalProcessed).toBe(5);
    expect(queued2).toBe(25);
    expect(sum2).toBe(snap2.totalReceived);
  });

  it('tests whether HIGH queue capacity overflow preserves accounting invariant or silently drops events', () => {
    // Fill HIGH queue to full capacity (2000 events)
    for (let i = 1; i <= config.HIGH_QUEUE_CAPACITY; i++) {
      const high = createEvent(`h_${i}`, 'INVENTORY', 'HIGH');
      metricsCollector.recordIncomingEvent(high);
      priorityRouter.route(high);
    }

    expect(queueManager.highQueue.size()).toBe(config.HIGH_QUEUE_CAPACITY);

    // Now attempt to route 1 more HIGH event past capacity
    const overflowHigh = createEvent(`h_overflow`, 'INVENTORY', 'HIGH');
    metricsCollector.recordIncomingEvent(overflowHigh);
    const result = priorityRouter.route(overflowHigh);

    expect(result.success).toBe(false);
    expect(result.dropped).toBe(true);

    const snap = metricsCollector.getSnapshot();
    const totalQueued = queueManager.getTotalQueued();
    const accounted = snap.totalProcessed + totalQueued + snap.shedCount + snap.criticalInFlight;

    // Expected: Every admitted/recorded event must be accounted for.
    // If the overflow event was recorded as incoming but silently dropped without being counted in shedCount,
    // this test will fail and expose the silent drop bug!
    expect(accounted).toBe(snap.totalReceived);
  });

  it('tests whether LOW queue events suffer starvation when CRITICAL/HIGH queue has continuous backlog', async () => {
    // Queue 20 CRITICAL events and 10 LOW events
    for (let i = 1; i <= 20; i++) {
      const crit = createEvent(`c_starve_${i}`, 'PAYMENT', 'CRITICAL');
      queueManager.criticalQueue.enqueue(crit);
    }
    for (let i = 1; i <= 10; i++) {
      const low = createEvent(`l_starve_${i}`, 'CLICK', 'LOW');
      queueManager.lowQueue.enqueue(low);
    }

    const processedEvents: PipelineEvent[] = [];
    workerPool.setListeners(
      ({ event }) => {
        processedEvents.push(event);
      },
      () => {}
    );

    // Worker pool is configured with CRITICAL_WORKER_RATIO: 0.80 (80% critical, 20% non-critical to avoid starvation)
    expect(config.CRITICAL_WORKER_RATIO).toBe(0.80);

    // Run workers to process 15 events
    workerPool.start();

    // Wait until at least 10 events are processed
    const startWait = Date.now();
    while (processedEvents.length < 10 && Date.now() - startWait < 2000) {
      await new Promise((r) => setTimeout(r, 10));
    }
    workerPool.stop();

    // Anti-starvation requirement:
    // When CRITICAL_WORKER_RATIO is 0.80, among 10 processed events, at least 1 LOW event should be processed.
    // If workerPool.ts uses strict priority with unconditional `continue;` on criticalQueue,
    // exactly 0 LOW events will be processed, exposing the LOW queue starvation bug!
    const lowProcessed = processedEvents.filter((e) => e.priority === 'LOW').length;
    expect(lowProcessed).toBeGreaterThan(0);
  });

  it('measures LOW queue drain rate under maximum batch size (detecting flash-drain vs paced recovery)', async () => {
    // Fill low queue with 3000 events
    for (let i = 1; i <= 3000; i++) {
      queueManager.lowQueue.enqueue(createEvent(`bulk_${i}`, 'CLICK', 'LOW'));
    }
    expect(queueManager.lowQueue.size()).toBe(3000);

    // Start worker pool first then scale to max workers (8)
    workerPool.start();
    workerPool.setStrategy('DEFER + SHED');
    await workerPool.scaleTo(8);
    expect(workerPool.getActiveWorkerCount()).toBe(8);

    const startTime = Date.now();
    workerPool.start();

    // Wait until low queue is empty
    while (queueManager.lowQueue.size() > 0 && Date.now() - startTime < 3000) {
      await new Promise((r) => setTimeout(r, 5));
    }
    const drainDurationMs = Date.now() - startTime;
    workerPool.stop();

    // If 3000 events drain in under 60ms (50,000+ events/sec), it confirms the unpaced flash-drain anomaly
    // where batch execution delay is fixed at 15ms for 250 items without per-item pacing.
    // Expected healthy paced drain for 3,000 events should take at least 500ms.
    expect(drainDurationMs).toBeGreaterThan(500);
  });

  it('verifies existing queued LOW events are never cleared when DEFER or SHED triggers', () => {
    // Fill low queue to 2500 events
    for (let i = 1; i <= 2500; i++) {
      queueManager.lowQueue.enqueue(createEvent(`q_${i}`, 'CLICK', 'LOW'));
    }
    expect(queueManager.lowQueue.size()).toBe(2500);

    // Evaluate adaptive engine -> reaches DEFER / SHED
    const evalResult = adaptiveEngine.evaluate(200, 50);
    expect(['DEFER', 'DEFER + SHED', 'SHED']).toContain(evalResult.strategy);

    // Verify low queue size is still intact and not wiped out
    expect(queueManager.lowQueue.size()).toBe(2500);
  });
});
