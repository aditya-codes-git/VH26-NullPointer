import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config/pipelineConfig.js';
import { QueueManager } from '../src/queues/queueManager.js';
import { WorkerPool } from '../src/processing/workerPool.js';
import { WorkerScaler } from '../src/workers/workerScaler.js';
import { MetricsCollector } from '../src/metrics/metricsCollector.js';
import { BatchProcessor } from '../src/processing/batchProcessor.js';
import { SheddingPolicy } from '../src/backpressure/sheddingPolicy.js';
import { BackpressureController } from '../src/backpressure/backpressureController.js';
import { AdaptiveDecisionEngine } from '../src/decision-engine/adaptiveEngine.js';
import { PipelineEvent } from '../src/models/event.js';

describe('Dynamic Worker Scaling - Full Ladder Progression & Hysteresis', () => {
  let config: typeof DEFAULT_CONFIG;
  let queueManager: QueueManager;
  let sheddingPolicy: SheddingPolicy;
  let backpressureController: BackpressureController;
  let adaptiveEngine: AdaptiveDecisionEngine;
  let metricsCollector: MetricsCollector;
  let batchProcessor: BatchProcessor;
  let workerPool: WorkerPool;
  let scaler: WorkerScaler;

  beforeEach(() => {
    config = {
      ...DEFAULT_CONFIG,
      MIN_WORKERS: 2,
      MAX_WORKERS: 8,
      SCALE_UP_PRESSURE_THRESHOLD: 0.40,
      SCALE_UP_UTILIZATION_THRESHOLD: 0.75,
      SCALE_DOWN_PRESSURE_THRESHOLD: 0.15,
      SCALE_DOWN_UTILIZATION_THRESHOLD: 0.35,
      SCALE_UP_COOLDOWN_MS: 100, // Reduced for deterministic test execution
      SCALE_DOWN_COOLDOWN_MS: 100,
      SCALE_SUSTAINED_WINDOW_MS: 50,
    };

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
    batchProcessor = new BatchProcessor(config);
    workerPool = new WorkerPool(config, queueManager, batchProcessor, sheddingPolicy, adaptiveEngine);
    workerPool.registerMetricsCollector(metricsCollector);
    scaler = new WorkerScaler(config, workerPool, queueManager, metricsCollector);
  });

  function fillLowQueue(count: number): void {
    for (let i = 1; i <= count; i++) {
      const ev: PipelineEvent = {
        id: `scale_ev_${i}`,
        type: 'CLICK',
        priority: 'LOW',
        payload: {},
        createdAt: Date.now(),
        status: 'QUEUED',
      };
      queueManager.lowQueue.enqueue(ev);
    }
  }

  it('steps through the complete scale-up ladder: 2 -> 4 -> 6 -> 8 and enforces the maximum cap', async () => {
    workerPool.start();
    expect(workerPool.getActiveWorkerCount()).toBe(2);

    // Apply high queue pressure (1500 / 3000 = 50% >= 40%)
    fillLowQueue(1500);

    // Pass 1: trigger sustained condition
    await scaler.evaluate();
    await new Promise((r) => setTimeout(r, 60)); // sustained window elapsed

    // Step 1: 2 -> 4 workers
    await scaler.evaluate();
    expect(workerPool.getActiveWorkerCount()).toBe(4);
    expect(scaler.scaleUpCount).toBe(1);

    // Cooldown
    await new Promise((r) => setTimeout(r, 110));

    // Step 2: 4 -> 6 workers
    await scaler.evaluate(); // start sustained
    await new Promise((r) => setTimeout(r, 60));
    await scaler.evaluate(); // trigger
    expect(workerPool.getActiveWorkerCount()).toBe(6);
    expect(scaler.scaleUpCount).toBe(2);

    // Cooldown
    await new Promise((r) => setTimeout(r, 110));

    // Step 3: 6 -> 8 workers (MAX_WORKERS)
    await scaler.evaluate(); // start sustained
    await new Promise((r) => setTimeout(r, 60));
    await scaler.evaluate(); // trigger
    expect(workerPool.getActiveWorkerCount()).toBe(8);
    expect(scaler.scaleUpCount).toBe(3);

    // Cap enforcement: another evaluation must NOT exceed 8
    await new Promise((r) => setTimeout(r, 110));
    await scaler.evaluate();
    await new Promise((r) => setTimeout(r, 60));
    await scaler.evaluate();
    expect(workerPool.getActiveWorkerCount()).toBe(8);
    expect(scaler.scaleUpCount).toBe(3);

    workerPool.stop();
  });

  it('steps through the complete scale-down ladder: 8 -> 6 -> 4 -> 2 and enforces the minimum floor', async () => {
    workerPool.start();
    await workerPool.scaleTo(8);
    expect(workerPool.getActiveWorkerCount()).toBe(8);

    // Clear queue so pressure is 0 (< 15%) and backlog <= 10
    queueManager.lowQueue.clear();
    expect(queueManager.getTotalQueued()).toBe(0);

    // Step down 1: 8 -> 6 workers
    await scaler.evaluate(); // condition met
    await new Promise((r) => setTimeout(r, 120)); // sustained window (2x for scale down = 100ms)
    await scaler.evaluate();
    expect(workerPool.getActiveWorkerCount()).toBe(6);
    expect(scaler.scaleDownCount).toBe(1);

    // Cooldown
    await new Promise((r) => setTimeout(r, 110));

    // Step down 2: 6 -> 4 workers
    await scaler.evaluate();
    await new Promise((r) => setTimeout(r, 120));
    await scaler.evaluate();
    expect(workerPool.getActiveWorkerCount()).toBe(4);
    expect(scaler.scaleDownCount).toBe(2);

    // Cooldown
    await new Promise((r) => setTimeout(r, 110));

    // Step down 3: 4 -> 2 workers (MIN_WORKERS)
    await scaler.evaluate();
    await new Promise((r) => setTimeout(r, 120));
    await scaler.evaluate();
    expect(workerPool.getActiveWorkerCount()).toBe(2);
    expect(scaler.scaleDownCount).toBe(3);

    // Floor enforcement: does NOT drop below 2
    await new Promise((r) => setTimeout(r, 110));
    await scaler.evaluate();
    await new Promise((r) => setTimeout(r, 120));
    await scaler.evaluate();
    expect(workerPool.getActiveWorkerCount()).toBe(2);
    expect(scaler.scaleDownCount).toBe(3);

    workerPool.stop();
  });
});
