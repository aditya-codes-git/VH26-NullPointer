import { describe, it, expect, beforeEach } from 'vitest';
import { QueueManager } from '../src/queues/queueManager.js';
import { DEFAULT_CONFIG } from '../src/config/pipelineConfig.js';
import { AdaptiveDecisionEngine } from '../src/decision-engine/adaptiveEngine.js';
import { SheddingPolicy } from '../src/backpressure/sheddingPolicy.js';
import { BackpressureController } from '../src/backpressure/backpressureController.js';
import { MetricsCollector } from '../src/metrics/metricsCollector.js';
import { BatchProcessor } from '../src/processing/batchProcessor.js';
import { WorkerPool } from '../src/processing/workerPool.js';
import { PriorityRouter } from '../src/router/priorityRouter.js';
import { PipelineEvent } from '../src/models/event.js';

describe('Adaptive Pipeline Upgrade - Comprehensive Verification', () => {
  let queueManager: QueueManager;
  let adaptiveEngine: AdaptiveDecisionEngine;
  let sheddingPolicy: SheddingPolicy;
  let backpressureController: BackpressureController;
  let metricsCollector: MetricsCollector;
  let batchProcessor: BatchProcessor;
  let priorityRouter: PriorityRouter;

  beforeEach(() => {
    queueManager = new QueueManager(DEFAULT_CONFIG);
    adaptiveEngine = new AdaptiveDecisionEngine(DEFAULT_CONFIG, queueManager);
    sheddingPolicy = new SheddingPolicy(queueManager);
    backpressureController = new BackpressureController(DEFAULT_CONFIG, queueManager);
    metricsCollector = new MetricsCollector(
      queueManager,
      sheddingPolicy,
      backpressureController,
      adaptiveEngine
    );
    batchProcessor = new BatchProcessor(DEFAULT_CONFIG);
    priorityRouter = new PriorityRouter(queueManager, sheddingPolicy, metricsCollector);
  });

  it('1. maintains independent queue sizes and capacities for CRITICAL, HIGH, and LOW', () => {
    expect(queueManager.criticalQueue.capacity).toBe(DEFAULT_CONFIG.CRITICAL_QUEUE_CAPACITY);
    expect(queueManager.highQueue.capacity).toBe(DEFAULT_CONFIG.HIGH_QUEUE_CAPACITY);
    expect(queueManager.lowQueue.capacity).toBe(DEFAULT_CONFIG.LOW_QUEUE_CAPACITY);

    const critEvent: PipelineEvent = {
      id: 'crit_1',
      type: 'ORDER',
      priority: 'CRITICAL',
      payload: {},
      createdAt: Date.now(),
      queuedAt: Date.now(),
      status: 'QUEUED',
    };
    const highEvent: PipelineEvent = {
      id: 'high_1',
      type: 'INVENTORY',
      priority: 'HIGH',
      payload: {},
      createdAt: Date.now(),
      queuedAt: Date.now(),
      status: 'QUEUED',
    };
    const lowEvent: PipelineEvent = {
      id: 'low_1',
      type: 'CLICK',
      priority: 'LOW',
      payload: {},
      createdAt: Date.now(),
      queuedAt: Date.now(),
      status: 'QUEUED',
    };

    priorityRouter.route(critEvent);
    priorityRouter.route(highEvent);
    priorityRouter.route(lowEvent);

    expect(queueManager.criticalQueue.size()).toBe(1);
    expect(queueManager.highQueue.size()).toBe(1);
    expect(queueManager.lowQueue.size()).toBe(1);
  });

  it('2. exposes per-tier strategies simultaneously (CRITICAL=STREAM, HIGH=STREAM, LOW=ADAPTIVE)', () => {
    // Under nominal conditions
    const evalNominal = adaptiveEngine.evaluate(10, 10);
    expect(evalNominal.criticalStrategy).toBe('STREAM');
    expect(evalNominal.highStrategy).toBe('STREAM');
    expect(evalNominal.lowStrategy).toBe('STREAM');

    // Fill low queue to induce BATCH mode (>= 30% of 3000 = 900 items)
    for (let i = 0; i < 1000; i++) {
      queueManager.lowQueue.enqueue({
        id: `low_${i}`,
        type: 'LOG',
        priority: 'LOW',
        payload: {},
        createdAt: Date.now(),
        queuedAt: Date.now(),
        status: 'QUEUED',
      });
    }

    const evalBatch = adaptiveEngine.evaluate(250, 50);
    expect(evalBatch.criticalStrategy).toBe('STREAM');
    expect(evalBatch.highStrategy).toBe('STREAM');
    expect(evalBatch.lowStrategy).toBe('BATCH');

    // Fill low queue to induce DEFER + SHED mode (>= 92% of 3000 = 2760 items)
    for (let i = 1000; i < 2800; i++) {
      queueManager.lowQueue.enqueue({
        id: `low_${i}`,
        type: 'CLICK',
        priority: 'LOW',
        payload: {},
        createdAt: Date.now(),
        queuedAt: Date.now(),
        status: 'QUEUED',
      });
    }

    const evalShed = adaptiveEngine.evaluate(400, 50);
    expect(evalShed.criticalStrategy).toBe('STREAM');
    expect(evalShed.highStrategy).toBe('STREAM');
    expect(evalShed.lowStrategy).toBe('DEFER + SHED');
  });

  it('3. protects critical events and guarantees zero critical loss', () => {
    const orderEvent: PipelineEvent = {
      id: 'ord_123',
      type: 'ORDER',
      priority: 'CRITICAL',
      payload: {},
      createdAt: Date.now(),
      queuedAt: Date.now(),
      status: 'QUEUED',
    };

    metricsCollector.recordIncomingEvent(orderEvent);
    queueManager.criticalQueue.enqueue(orderEvent);

    const snapshot1 = metricsCollector.getSnapshot();
    expect(snapshot1.criticalReceived).toBe(1);
    expect(snapshot1.criticalQueueSize).toBe(1);
    expect(snapshot1.criticalLost).toBe(0);
    expect(snapshot1.criticalShed).toBe(0);

    // Process event
    const dequeued = queueManager.criticalQueue.dequeue()!;
    metricsCollector.recordProcessedEvent(dequeued, 12);

    const snapshot2 = metricsCollector.getSnapshot();
    expect(snapshot2.criticalProcessed).toBe(1);
    expect(snapshot2.criticalQueueSize).toBe(0);
    expect(snapshot2.criticalLost).toBe(0);
    expect(snapshot2.criticalShed).toBe(0);
  });

  it('4. ensures high-priority processing continues streaming while low-priority is shedding', async () => {
    const workerPool = new WorkerPool(
      DEFAULT_CONFIG,
      queueManager,
      batchProcessor,
      sheddingPolicy,
      adaptiveEngine
    );
    workerPool.registerMetricsCollector(metricsCollector);

    let highProcessedCount = 0;
    workerPool.setListeners(
      ({ event }) => {
        if (event.priority === 'HIGH') highProcessedCount++;
      },
      () => {}
    );

    // Fill low queue to shed threshold
    for (let i = 0; i < 2900; i++) {
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

    // Add high priority inventory events
    for (let i = 0; i < 5; i++) {
      queueManager.highQueue.enqueue({
        id: `inv_${i}`,
        type: 'INVENTORY',
        priority: 'HIGH',
        payload: {},
        createdAt: Date.now(),
        queuedAt: Date.now(),
        status: 'QUEUED',
      });
    }

    workerPool.setStrategy('DEFER + SHED');
    workerPool.start();

    // Allow worker loop ticks
    await new Promise((r) => setTimeout(r, 100));
    workerPool.stop();

    expect(highProcessedCount).toBeGreaterThan(0);
    expect(sheddingPolicy.totalShedCount).toBeGreaterThan(0);
  });

  it('5. computes dynamic batch size according to configurable pressure thresholds', () => {
    // 0-30% pressure -> 10
    const res1 = adaptiveEngine.calculateBatchSize(0.15, 0, 20);
    expect(res1.batchSize).toBe(10);
    expect(res1.reason).toContain('15%');

    // 30-50% pressure -> 25
    const res2 = adaptiveEngine.calculateBatchSize(0.40, 0, 40);
    expect(res2.batchSize).toBe(25);

    // 50-70% pressure -> 50
    const res3 = adaptiveEngine.calculateBatchSize(0.60, 0, 50);
    expect(res3.batchSize).toBe(50);

    // 70-85% pressure -> 100
    const res4 = adaptiveEngine.calculateBatchSize(0.75, 0, 60);
    expect(res4.batchSize).toBe(100);

    // 85-95% pressure -> 200
    const res5 = adaptiveEngine.calculateBatchSize(0.90, 0, 60);
    expect(res5.batchSize).toBe(200);

    // >95% pressure -> 250
    const res6 = adaptiveEngine.calculateBatchSize(0.98, 0, 80);
    expect(res6.batchSize).toBe(250);
  });

  it('6. bounds batch size history to latest 50 observations', () => {
    for (let i = 0; i < 70; i++) {
      // Simulate low queue changes
      queueManager.lowQueue.enqueue({
        id: `ev_${i}`,
        type: 'CLICK',
        priority: 'LOW',
        payload: {},
        createdAt: Date.now(),
        queuedAt: Date.now(),
        status: 'QUEUED',
      });
      // Force snapshot to trigger observation buffer update
      const snapshot = metricsCollector.getSnapshot();
      expect(snapshot.batchSizeHistory.length).toBeLessThanOrEqual(50);
      expect(snapshot.batching.history.length).toBeLessThanOrEqual(50);
    }
  });

  it('7 & 8. logs individual shed events with full audit metadata without duplicate logs', () => {
    for (let i = 0; i < 3; i++) {
      queueManager.lowQueue.enqueue({
        id: `ext_click_${i}`,
        type: 'CLICK',
        priority: 'LOW',
        payload: {},
        createdAt: Date.now(),
        queuedAt: Date.now(),
        status: 'QUEUED',
      });
    }

    const result = sheddingPolicy.executeShedding(3, 'Controlled shedding due to queue pressure');
    expect(result.shedCount).toBe(3);
    expect(result.entries.length).toBe(3);

    const firstEntry = result.entries[0];
    expect(firstEntry.id).toBe('ext_click_0');
    expect(firstEntry.type).toBe('CLICK');
    expect(firstEntry.priority).toBe('LOW');
    expect(firstEntry.reason).toBe('Controlled shedding due to queue pressure');
    expect(firstEntry.timestamp).toBeGreaterThan(0);

    // Verify all logged IDs are unique (no duplicate logs)
    const loggedIds = result.entries.map((e) => e.id);
    const uniqueIds = new Set(loggedIds);
    expect(uniqueIds.size).toBe(loggedIds.length);
  });

  it('9. tracks shed counters matching actual shed events per type', () => {
    queueManager.lowQueue.enqueue({
      id: 'click_a',
      type: 'CLICK',
      priority: 'LOW',
      payload: {},
      createdAt: Date.now(),
      queuedAt: Date.now(),
      status: 'QUEUED',
    });
    queueManager.lowQueue.enqueue({
      id: 'log_b',
      type: 'LOG',
      priority: 'LOW',
      payload: {},
      createdAt: Date.now(),
      queuedAt: Date.now(),
      status: 'QUEUED',
    });

    sheddingPolicy.executeShedding(2, 'Queue full');
    expect(sheddingPolicy.totalShedCount).toBe(2);
    expect(sheddingPolicy.clickShedCount).toBe(1);
    expect(sheddingPolicy.logShedCount).toBe(1);
    expect(sheddingPolicy.criticalShedCount).toBe(0);
  });

  it('10. populates all structured TelemetrySnapshot fields for Socket.IO', () => {
    const snapshot = metricsCollector.getSnapshot();

    // Queues telemetry
    expect(snapshot.queues).toBeDefined();
    expect(snapshot.queues.critical.name).toBe('CRITICAL');
    expect(snapshot.queues.critical.status).toBe('PROTECTED');
    expect(snapshot.queues.high.name).toBe('HIGH');
    expect(snapshot.queues.high.status).toBe('ACTIVE');
    expect(snapshot.queues.low.name).toBe('LOW');
    expect(snapshot.queues.low.status).toBe('ADAPTIVE');
    expect(snapshot.queues.low.accepted).toBeDefined();
    expect(snapshot.queues.low.batched).toBeDefined();
    expect(snapshot.queues.low.deferredCycles).toBeDefined();
    expect(snapshot.queues.low.shed).toBeDefined();

    // Strategies telemetry
    expect(snapshot.strategies).toBeDefined();
    expect(snapshot.strategies.critical).toBe('STREAM');
    expect(snapshot.strategies.high).toBe('STREAM');
    expect(snapshot.strategies.low).toBeDefined();

    // Shedding telemetry
    expect(snapshot.shedding).toBeDefined();
    expect(snapshot.shedding.total).toBe(0);
    expect(snapshot.shedding.critical).toBe(0);

    // Batching telemetry
    expect(snapshot.batching).toBeDefined();
    expect(snapshot.batching.currentBatchSize).toBeGreaterThan(0);
    expect(Array.isArray(snapshot.batching.history)).toBe(true);

    // Adaptive telemetry
    expect(snapshot.adaptive).toBeDefined();
    expect(snapshot.adaptive.systemState).toBe('NORMAL');
    expect(snapshot.adaptive.reason).toBeDefined();
  });

  it('11. verifies exact event accounting reconciliation', () => {
    // 10 critical events
    for (let i = 0; i < 10; i++) {
      const ev: PipelineEvent = {
        id: `order_${i}`,
        type: 'ORDER',
        priority: 'CRITICAL',
        payload: {},
        createdAt: Date.now(),
        queuedAt: Date.now(),
        status: 'QUEUED',
      };
      metricsCollector.recordIncomingEvent(ev);
      queueManager.criticalQueue.enqueue(ev);
    }

    // 20 low events
    for (let i = 0; i < 20; i++) {
      const ev: PipelineEvent = {
        id: `click_${i}`,
        type: 'CLICK',
        priority: 'LOW',
        payload: {},
        createdAt: Date.now(),
        queuedAt: Date.now(),
        status: 'QUEUED',
      };
      metricsCollector.recordIncomingEvent(ev);
      queueManager.lowQueue.enqueue(ev);
    }

    // Process 5 critical events
    for (let i = 0; i < 5; i++) {
      const ev = queueManager.criticalQueue.dequeue()!;
      metricsCollector.recordProcessedEvent(ev, 10);
    }

    // Process 8 low events
    const batchedEvents: PipelineEvent[] = [];
    for (let i = 0; i < 8; i++) {
      batchedEvents.push(queueManager.lowQueue.dequeue()!);
    }
    metricsCollector.recordBatchProcessed(batchedEvents, 25);

    // Shed 5 low events
    sheddingPolicy.executeShedding(5, 'Test shed');

    const snapshot = metricsCollector.getSnapshot();

    const received = snapshot.totalReceived;
    const processed = snapshot.totalProcessed;
    const queued = snapshot.criticalQueueSize + snapshot.highQueueSize + snapshot.lowQueueSize;
    const shed = snapshot.shedCount;
    const inFlight = snapshot.criticalInFlight;

    // Total Accounting Check: Received = Processed + Queued + Shed + InFlight
    expect(received).toBe(30);
    expect(processed).toBe(13); // 5 critical + 8 low
    expect(queued).toBe(12); // (10 - 5) critical + (20 - 8 - 5) low = 5 + 7 = 12
    expect(shed).toBe(5);
    expect(inFlight).toBe(0);
    expect(received).toBe(processed + queued + shed + inFlight);

    // Critical Loss Invariant: Critical Lost must be 0
    expect(snapshot.criticalLost).toBe(0);
    expect(snapshot.criticalShed).toBe(0);
    expect(snapshot.safetyViolations).toBe(0);
  });

  it('12. performs controlled admission shedding when low queue reaches capacity, preventing event loss', () => {
    // Fill low queue to maximum capacity (3000)
    for (let i = 0; i < 3000; i++) {
      const ev: PipelineEvent = {
        id: `fill_${i}`,
        type: 'LOG',
        priority: 'LOW',
        payload: {},
        createdAt: Date.now(),
        queuedAt: Date.now(),
        status: 'QUEUED',
      };
      metricsCollector.recordIncomingEvent(ev);
      priorityRouter.route(ev);
    }

    expect(queueManager.lowQueue.size()).toBe(3000);
    expect(metricsCollector.lowAccepted).toBe(3000);

    // Now send 10 excess LOW events
    for (let i = 0; i < 10; i++) {
      const excessEv: PipelineEvent = {
        id: `excess_${i}`,
        type: 'CLICK',
        priority: 'LOW',
        payload: {},
        createdAt: Date.now(),
        queuedAt: Date.now(),
        status: 'QUEUED',
      };
      metricsCollector.recordIncomingEvent(excessEv);
      const res = priorityRouter.route(excessEv);
      expect(res.dropped).toBe(true);
    }

    // All 10 excess events must be recorded in shed count
    expect(sheddingPolicy.totalShedCount).toBe(10);
    expect(sheddingPolicy.clickShedCount).toBe(10);

    const snapshot = metricsCollector.getSnapshot();
    // Accounting MUST strictly hold with 0 discrepancy!
    expect(snapshot.totalReceived).toBe(3010);
    expect(snapshot.totalProcessed).toBe(0);
    expect(snapshot.criticalQueueSize + snapshot.highQueueSize + snapshot.lowQueueSize).toBe(3000);
    expect(snapshot.shedCount).toBe(10);
    expect(snapshot.totalReceived).toBe(
      snapshot.totalProcessed +
      (snapshot.criticalQueueSize + snapshot.highQueueSize + snapshot.lowQueueSize) +
      snapshot.shedCount +
      snapshot.criticalInFlight
    );
  });

  it('13. keeps BATCH processing active while in DEFER + SHED mode', async () => {
    const workerPool = new WorkerPool(
      DEFAULT_CONFIG,
      queueManager,
      batchProcessor,
      sheddingPolicy,
      adaptiveEngine
    );
    workerPool.registerMetricsCollector(metricsCollector);

    let lowBatchedCount = 0;
    workerPool.setListeners(
      () => {},
      (events, durationMs) => {
        metricsCollector.recordBatchProcessed(events, durationMs);
        lowBatchedCount += events.length;
      }
    );

    // Fill low queue past 95%
    for (let i = 0; i < 2900; i++) {
      queueManager.lowQueue.enqueue({
        id: `low_${i}`,
        type: 'CLICK',
        priority: 'LOW',
        payload: {},
        createdAt: Date.now(),
        queuedAt: Date.now(),
        status: 'QUEUED',
      });
    }

    workerPool.setStrategy('DEFER + SHED');
    workerPool.start();

    // Allow worker loop ticks
    await new Promise((r) => setTimeout(r, 120));
    workerPool.stop();

    // Verifies LOW is still being processed in batches, NOT disabled!
    expect(lowBatchedCount).toBeGreaterThan(0);
    expect(metricsCollector.lowBatched).toBeGreaterThan(0);
    expect(sheddingPolicy.totalShedCount).toBeGreaterThan(0);
  });

  it('14. demonstrates hysteresis deadband preventing strategy oscillation', async () => {
    // Fill to 35% (enters BATCH)
    for (let i = 0; i < 1050; i++) {
      queueManager.lowQueue.enqueue({
        id: `low_${i}`,
        type: 'LOG',
        priority: 'LOW',
        payload: {},
        createdAt: Date.now(),
        queuedAt: Date.now(),
        status: 'QUEUED',
      });
    }

    const eval1 = adaptiveEngine.evaluate(100, 50);
    expect(eval1.strategy).toBe('BATCH');

    // Drain slightly to 25% (between exit threshold 20% and entry threshold 30%)
    for (let i = 0; i < 300; i++) {
      queueManager.lowQueue.dequeue();
    }
    expect(queueManager.lowQueue.getPressure()).toBe(0.25);

    // Hysteresis deadband: should REMAIN in BATCH mode!
    const eval2 = adaptiveEngine.evaluate(20, 50);
    expect(eval2.strategy).toBe('BATCH');

    // Drain below 20% exit threshold and wait dwell time
    for (let i = 0; i < 200; i++) {
      queueManager.lowQueue.dequeue();
    }
    expect(queueManager.lowQueue.getPressure()).toBeLessThan(0.20);
    await new Promise((r) => setTimeout(r, 1050));

    const eval3 = adaptiveEngine.evaluate(10, 50);
    expect(eval3.strategy).toBe('STREAM');
  });

  it('15. verifies the full extreme load lifecycle: 100% capacity, concurrent batching + shedding, Diff = 0', async () => {
    metricsCollector.reset();
    sheddingPolicy.totalShedCount = 0;
    sheddingPolicy.clickShedCount = 0;
    sheddingPolicy.logShedCount = 0;

    const workerPool = new WorkerPool(
      DEFAULT_CONFIG,
      queueManager,
      batchProcessor,
      sheddingPolicy,
      adaptiveEngine
    );
    workerPool.registerMetricsCollector(metricsCollector);
    workerPool.setListeners(
      () => {},
      (events, durationMs) => {
        metricsCollector.recordBatchProcessed(events, durationMs);
      }
    );

    // 1. Send LOW events until queue reaches 100% (3000 / 3000)
    for (let i = 0; i < 3000; i++) {
      const ev: PipelineEvent = {
        id: `low_${i}`,
        type: i % 2 === 0 ? 'CLICK' : 'LOG',
        priority: 'LOW',
        payload: {},
        createdAt: Date.now(),
        queuedAt: Date.now(),
        status: 'QUEUED',
      };
      metricsCollector.recordIncomingEvent(ev);
      priorityRouter.route(ev);
    }

    expect(queueManager.lowQueue.size()).toBe(3000);
    expect(metricsCollector.lowAccepted).toBe(3000);

    // 2. Evaluate state: LOW queue at 100% must trigger DEFER + SHED
    const evalRes = adaptiveEngine.evaluate(500, 100);
    expect(evalRes.strategy).toBe('DEFER + SHED');
    expect(evalRes.lowStrategy).toBe('DEFER + SHED');
    expect(evalRes.sheddingStatus).toBe('ENABLED');

    // 3. Send 30 excess LOW events while queue is at 3,000 capacity -> triggers admission shedding
    for (let i = 3000; i < 3030; i++) {
      const excessEv: PipelineEvent = {
        id: `excess_${i}`,
        type: i % 2 === 0 ? 'CLICK' : 'LOG',
        priority: 'LOW',
        payload: {},
        createdAt: Date.now(),
        queuedAt: Date.now(),
        status: 'QUEUED',
      };
      metricsCollector.recordIncomingEvent(excessEv);
      const res = priorityRouter.route(excessEv);
      expect(res.dropped).toBe(true);
    }

    // 4. Start worker in DEFER + SHED mode - verify it is STILL actively batching and draining!
    workerPool.setStrategy('DEFER + SHED');
    workerPool.start();

    // Allow worker loop ticks to process batches
    await new Promise((r) => setTimeout(r, 200));
    workerPool.stop();

    // 5. Verify outcomes:
    // - Some events got shed
    expect(sheddingPolicy.totalShedCount).toBeGreaterThan(0);
    expect(metricsCollector.lowShed).toBeGreaterThan(0);

    // - LOW worker was STILL actively batching and draining the queue
    expect(metricsCollector.lowBatched).toBeGreaterThan(0);
    expect(metricsCollector.totalProcessed).toBeGreaterThan(0);

    // - Queue was drained from 3000
    expect(queueManager.lowQueue.size()).toBeLessThan(3000);

    // 6. Verify instantaneous event accounting: Received = Processed + Queued + Shed + InFlight
    const snapshot = metricsCollector.getSnapshot();
    const queued = snapshot.criticalQueueSize + snapshot.highQueueSize + snapshot.lowQueueSize;
    const accounted = snapshot.totalProcessed + queued + snapshot.shedCount + snapshot.criticalInFlight;
    const diff = snapshot.totalReceived - accounted;

    expect(snapshot.totalReceived).toBe(3030);
    expect(diff).toBe(0);

    // 7. Critical safety invariant: zero critical loss or shedding
    expect(snapshot.criticalLost).toBe(0);
    expect(snapshot.criticalShed).toBe(0);
    expect(snapshot.safetyViolations).toBe(0);
  });
});
