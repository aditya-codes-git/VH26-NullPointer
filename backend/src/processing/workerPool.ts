import { PipelineEvent, ProcessingStrategy, WorkerInstanceStatus } from '../models/event.js';
import { PipelineConfig } from '../config/pipelineConfig.js';
import { QueueManager } from '../queues/queueManager.js';
import { BatchProcessor } from './batchProcessor.js';
import { SheddingPolicy } from '../backpressure/sheddingPolicy.js';
import { AdaptiveDecisionEngine } from '../decision-engine/adaptiveEngine.js';
import { RetryController } from '../resilience/retryController.js';

export interface WorkerEventResult {
  event: PipelineEvent;
  latencyMs: number;
}

export type OnEventProcessedListener = (result: WorkerEventResult) => void;
export type OnBatchProcessedListener = (events: PipelineEvent[], durationMs: number) => void;

interface WorkerInternalState {
  id: string;
  status: 'ACTIVE' | 'BUSY' | 'RETIRING';
  processedCount: number;
  currentJob?: string;
  startedAt: number;
  shouldStop: boolean;
  totalBusyTimeMs: number;
  currentBusyStartTime: number;
}

export class WorkerPool {
  private config: PipelineConfig;
  private queueManager: QueueManager;
  private batchProcessor: BatchProcessor;
  private sheddingPolicy: SheddingPolicy;
  private adaptiveEngine?: AdaptiveDecisionEngine;
  private retryController?: RetryController;
  
  private isRunning = false;
  private activeStrategy: ProcessingStrategy = 'STREAM';

  private onEventProcessed: OnEventProcessedListener | null = null;
  private onBatchProcessed: OnBatchProcessedListener | null = null;
  private metricsCollector: any = null;
  private activeCriticalWorkers = 0;
  private lastDeferLog = 0;

  // Single Source of Truth for workers
  private workers = new Map<string, WorkerInternalState>();
  private nextWorkerIndex = 1;

  // Rolling utilization measurement window (last 2 seconds)
  private utilizationHistory: Array<{ timestamp: number; busyWorkers: number; totalWorkers: number }> = [];

  constructor(
    config: PipelineConfig,
    queueManager: QueueManager,
    batchProcessor: BatchProcessor,
    sheddingPolicy: SheddingPolicy,
    adaptiveEngine?: AdaptiveDecisionEngine,
    retryController?: RetryController
  ) {
    this.config = config;
    this.queueManager = queueManager;
    this.batchProcessor = batchProcessor;
    this.sheddingPolicy = sheddingPolicy;
    this.adaptiveEngine = adaptiveEngine;
    this.retryController = retryController;
  }

  public registerRetryController(controller: RetryController): void {
    this.retryController = controller;
  }

  public registerAdaptiveEngine(engine: AdaptiveDecisionEngine): void {
    this.adaptiveEngine = engine;
  }

  public registerMetricsCollector(collector: any): void {
    this.metricsCollector = collector;
  }

  public setStrategy(strategy: ProcessingStrategy): void {
    this.activeStrategy = strategy;
  }

  public getStrategy(): ProcessingStrategy {
    return this.activeStrategy;
  }

  public setListeners(
    onEvent: OnEventProcessedListener,
    onBatch: OnBatchProcessedListener
  ): void {
    this.onEventProcessed = onEvent;
    this.onBatchProcessed = onBatch;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const initialWorkers = Math.max(
      this.config.MIN_WORKERS || 2,
      this.config.WORKER_CONCURRENCY || 2
    );

    for (let i = 0; i < initialWorkers; i++) {
      this.spawnWorker();
    }
  }

  public stop(): void {
    this.isRunning = false;
    for (const worker of this.workers.values()) {
      worker.shouldStop = true;
    }
  }

  /**
   * Spawns a new active worker loop and adds it to the registry.
   */
  private spawnWorker(): string {
    const workerId = `worker-${this.nextWorkerIndex++}`;
    const state: WorkerInternalState = {
      id: workerId,
      status: 'ACTIVE',
      processedCount: 0,
      startedAt: Date.now(),
      shouldStop: false,
      totalBusyTimeMs: 0,
      currentBusyStartTime: 0,
    };
    this.workers.set(workerId, state);
    this.runWorkerLoop(workerId);
    return workerId;
  }

  /**
   * Scales the worker pool to the target count (bounded by minWorkers and maxWorkers).
   * Returns the new actual target count.
   */
  public async scaleTo(targetCount: number, _reason = ''): Promise<number> {
    const min = this.config.MIN_WORKERS || 2;
    const max = this.config.MAX_WORKERS || 8;
    const boundedTarget = Math.max(min, Math.min(max, targetCount));

    const activeList = Array.from(this.workers.values()).filter(w => !w.shouldStop);
    const currentActiveCount = activeList.length;

    if (boundedTarget > currentActiveCount) {
      // Scale UP
      const toAdd = boundedTarget - currentActiveCount;
      for (let i = 0; i < toAdd; i++) {
        this.spawnWorker();
      }
    } else if (boundedTarget < currentActiveCount) {
      // Scale DOWN: Retire excess workers gracefully
      const toRemove = currentActiveCount - boundedTarget;
      // Mark the newest workers for graceful retirement first
      const candidates = activeList.slice(-toRemove);
      for (const worker of candidates) {
        worker.shouldStop = true;
        worker.status = 'RETIRING';
      }
    }

    return this.getActiveWorkerCount();
  }

  public getActiveWorkerCount(): number {
    return Array.from(this.workers.values()).filter(w => !w.shouldStop).length;
  }

  public getTotalWorkerCount(): number {
    return this.workers.size;
  }

  public getWorkerStatuses(): WorkerInstanceStatus[] {
    const now = Date.now();
    return Array.from(this.workers.values()).map(w => ({
      id: w.id,
      status: w.status,
      processedCount: w.processedCount,
      currentJob: w.currentJob,
      activeDurationMs: now - w.startedAt,
    }));
  }

  /**
   * Computes real worker utilization based on actual busy/idle execution state.
   */
  public getRealUtilization(): number {
    const total = this.workers.size;
    if (total === 0) return 0;
    
    // Sample current state
    const busyCount = Array.from(this.workers.values()).filter(w => w.status === 'BUSY').length;
    const now = Date.now();
    this.utilizationHistory.push({ timestamp: now, busyWorkers: busyCount, totalWorkers: total });

    // Prune history older than 2 seconds
    const cutoff = now - 2000;
    this.utilizationHistory = this.utilizationHistory.filter(h => h.timestamp >= cutoff);

    if (this.utilizationHistory.length === 0) {
      return Number(((busyCount / total) * 100).toFixed(1));
    }

    const avgBusy = this.utilizationHistory.reduce((acc, h) => acc + (h.busyWorkers / h.totalWorkers), 0) / this.utilizationHistory.length;
    return Number((avgBusy * 100).toFixed(1));
  }

  private markBusy(workerState: WorkerInternalState, jobName: string): void {
    if (workerState.status !== 'RETIRING') {
      workerState.status = 'BUSY';
    }
    workerState.currentJob = jobName;
    workerState.currentBusyStartTime = Date.now();
  }

  private markActive(workerState: WorkerInternalState): void {
    if (workerState.currentBusyStartTime > 0) {
      workerState.totalBusyTimeMs += Date.now() - workerState.currentBusyStartTime;
      workerState.currentBusyStartTime = 0;
    }
    workerState.currentJob = undefined;
    if (workerState.shouldStop) {
      workerState.status = 'RETIRING';
    } else {
      workerState.status = 'ACTIVE';
    }
  }

  private async runWorkerLoop(workerId: string): Promise<void> {
    const workerState = this.workers.get(workerId);
    if (!workerState) return;

    while (this.isRunning && !workerState.shouldStop) {
      let didWork = false;

      // STEP 1: Always check Critical Queue first (Highest Priority)
      const criticalEvent = this.queueManager.criticalQueue.dequeue();
      if (criticalEvent) {
        this.activeCriticalWorkers++;
        if (this.metricsCollector) {
          this.metricsCollector.setCriticalInFlight(this.activeCriticalWorkers);
        }
        this.markBusy(workerState, `CRITICAL: ${criticalEvent.type} (${criticalEvent.id})`);
        try {
          await this.processSingleEvent(criticalEvent, 'STREAM', workerId);
          workerState.processedCount++;
        } finally {
          this.activeCriticalWorkers--;
          if (this.metricsCollector) {
            this.metricsCollector.setCriticalInFlight(this.activeCriticalWorkers);
          }
          this.markActive(workerState);
        }
        didWork = true;
        continue; // Immediately loop back to check critical queue again
      }

      // STEP 2: Check High Queue (Inventory business state)
      const highEvent = this.queueManager.highQueue.dequeue();
      if (highEvent) {
        this.markBusy(workerState, `HIGH: ${highEvent.type} (${highEvent.id})`);
        try {
          await this.processSingleEvent(highEvent, 'STREAM', workerId);
          workerState.processedCount++;
        } finally {
          this.markActive(workerState);
        }
        didWork = true;
        continue;
      }

      // STEP 3: Handle Low Priority Queue based on active adaptive strategy
      switch (this.activeStrategy) {
        case 'STREAM': {
          const lowEvent = this.queueManager.lowQueue.dequeue();
          if (lowEvent) {
            this.markBusy(workerState, `LOW: ${lowEvent.type} (${lowEvent.id})`);
            try {
              await this.processSingleEvent(lowEvent, 'STREAM', workerId);
              workerState.processedCount++;
            } finally {
              this.markActive(workerState);
            }
            didWork = true;
          }
          break;
        }

        case 'BATCH': {
          const targetBatchSize = this.adaptiveEngine ? this.adaptiveEngine.getCurrentBatchSize() : this.config.BATCH_SIZE;
          const batchSize = Math.min(targetBatchSize, this.queueManager.lowQueue.size());
          if (batchSize > 0) {
            const batch = this.queueManager.lowQueue.dequeueBatch(batchSize);
            this.markBusy(workerState, `BATCH: ${batch.length} events`);
            try {
              const result = await this.batchProcessor.processBatch(batch, workerId);
              if (this.onBatchProcessed && result.events.length > 0) {
                this.onBatchProcessed(result.events, result.durationMs);
              }
              workerState.processedCount += batch.length;
            } finally {
              this.markActive(workerState);
            }
            didWork = true;
          }
          break;
        }

        case 'DEFER': {
          if (Date.now() - this.lastDeferLog > 1000) {
            this.lastDeferLog = Date.now();
            if (this.metricsCollector) {
              this.metricsCollector.recordDeferred('Queue pressure elevated: paced low-priority batching to prioritize critical path');
            }
          }

          const targetBatchSize = this.adaptiveEngine ? this.adaptiveEngine.getCurrentBatchSize() : this.config.BATCH_SIZE;
          const batchSize = Math.min(targetBatchSize, this.queueManager.lowQueue.size());
          if (batchSize > 0) {
            const batch = this.queueManager.lowQueue.dequeueBatch(batchSize);
            this.markBusy(workerState, `DEFER-BATCH: ${batch.length} events`);
            try {
              const result = await this.batchProcessor.processBatch(batch, workerId);
              if (this.onBatchProcessed && result.events.length > 0) {
                this.onBatchProcessed(result.events, result.durationMs);
              }
              workerState.processedCount += batch.length;
            } finally {
              this.markActive(workerState);
            }
            didWork = true;
          }
          break;
        }

        case 'DEFER + SHED':
        case 'SHED': {
          const targetBatchSize = this.adaptiveEngine ? this.adaptiveEngine.getCurrentBatchSize() : 250;
          const batchSize = Math.min(targetBatchSize, this.queueManager.lowQueue.size());
          if (batchSize > 0) {
            const batch = this.queueManager.lowQueue.dequeueBatch(batchSize);
            this.markBusy(workerState, `SHED-DRAIN: ${batch.length} events`);
            try {
              const result = await this.batchProcessor.processBatch(batch, workerId);
              if (this.onBatchProcessed && result.events.length > 0) {
                this.onBatchProcessed(result.events, result.durationMs);
              }
              workerState.processedCount += batch.length;
            } finally {
              this.markActive(workerState);
            }
            didWork = true;
          }

          const maxSafeCapacity = Math.round(this.config.LOW_QUEUE_CAPACITY * 0.95);
          const excess = this.queueManager.lowQueue.size() - maxSafeCapacity;
          if (excess > 0) {
            const countToShed = Math.min(excess, 50);
            const result = this.sheddingPolicy.executeShedding(countToShed, 'Controlled shedding due to queue saturation');
            if (result.entries.length > 0 && this.metricsCollector) {
              for (const entry of result.entries) {
                const now = entry.timestamp;
                const d = new Date(now);
                const timeStr = `${d.toTimeString().split(' ')[0]}.${String(now % 1000).padStart(3, '0')}`;
                this.metricsCollector.addActivityLog({
                  id: entry.id,
                  type: entry.type,
                  priority: entry.priority,
                  strategy: 'SHED',
                  status: 'SHED',
                  reason: entry.reason,
                  timestamp: timeStr,
                  timestampMs: now,
                });
              }
            }
          }
          break;
        }
      }

      if (!didWork) {
        // Sleep briefly to prevent event-loop spin when queues are empty
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    }

    // Graceful exit: in-flight work has completed, safely unregister worker
    this.workers.delete(workerId);
  }

  public async processSingleEvent(
    event: PipelineEvent,
    strategy: ProcessingStrategy,
    workerId = 'worker-1'
  ): Promise<void> {
    // Calibrated simulated service time (e.g. 7ms per event)
    await new Promise((resolve) => setTimeout(resolve, this.config.BASE_PROCESSING_DELAY_MS));

    // Check for simulated worker processing failure
    if (this.retryController && this.retryController.shouldSimulateFailure(event)) {
      this.retryController.handleFailedEvent(
        event,
        workerId,
        `Worker ${workerId} simulated failure during processing`
      );
      return;
    }

    // Idempotent business side effect simulation
    if (this.retryController) {
      this.retryController.applySideEffect(event, workerId);
      if ((event.retryCount || 0) > 0) {
        this.retryController.recordRecoverySuccess(event, workerId);
      }
    }

    const now = Date.now();
    event.processedAt = now;
    event.status = 'PROCESSED';
    event.strategy = strategy;

    const latencyMs = now - event.createdAt;
    if (this.onEventProcessed) {
      this.onEventProcessed({ event, latencyMs });
    }
  }
}
