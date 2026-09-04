import { PipelineEvent, ProcessingStrategy } from '../models/event.js';
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

    for (let i = 0; i < this.config.WORKER_CONCURRENCY; i++) {
      const workerId = `worker-${i + 1}`;
      this.runWorkerLoop(workerId);
    }
  }

  public stop(): void {
    this.isRunning = false;
  }

  private async runWorkerLoop(workerId = 'worker-1'): Promise<void> {
    while (this.isRunning) {
      let didWork = false;

      // STEP 1: Always check Critical Queue first (Highest Priority)
      const criticalEvent = this.queueManager.criticalQueue.dequeue();
      if (criticalEvent) {
        this.activeCriticalWorkers++;
        if (this.metricsCollector) {
          this.metricsCollector.setCriticalInFlight(this.activeCriticalWorkers);
        }
        try {
          await this.processSingleEvent(criticalEvent, 'STREAM', workerId);
        } finally {
          this.activeCriticalWorkers--;
          if (this.metricsCollector) {
            this.metricsCollector.setCriticalInFlight(this.activeCriticalWorkers);
          }
        }
        didWork = true;
        continue; // Immediately loop back to check critical queue again
      }

      // STEP 2: Check High Queue (Inventory business state)
      const highEvent = this.queueManager.highQueue.dequeue();
      if (highEvent) {
        await this.processSingleEvent(highEvent, 'STREAM', workerId);
        didWork = true;
        continue;
      }

      // STEP 3: Handle Low Priority Queue based on active adaptive strategy
      switch (this.activeStrategy) {
        case 'STREAM': {
          const lowEvent = this.queueManager.lowQueue.dequeue();
          if (lowEvent) {
            await this.processSingleEvent(lowEvent, 'STREAM', workerId);
            didWork = true;
          }
          break;
        }

        case 'BATCH': {
          const targetBatchSize = this.adaptiveEngine ? this.adaptiveEngine.getCurrentBatchSize() : this.config.BATCH_SIZE;
          const batchSize = Math.min(targetBatchSize, this.queueManager.lowQueue.size());
          if (batchSize > 0) {
            const batch = this.queueManager.lowQueue.dequeueBatch(batchSize);
            const result = await this.batchProcessor.processBatch(batch, workerId);
            if (this.onBatchProcessed && result.events.length > 0) {
              this.onBatchProcessed(result.events, result.durationMs);
            }
            didWork = true;
          }
          break;
        }

        case 'DEFER': {
          // Low-priority execution is paced: CRITICAL and HIGH have absolute priority,
          // but admitted LOW events continue to be processed through micro-batches!
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
            const result = await this.batchProcessor.processBatch(batch, workerId);
            if (this.onBatchProcessed && result.events.length > 0) {
              this.onBatchProcessed(result.events, result.durationMs);
            }
            didWork = true;
          }
          break;
        }

        case 'DEFER + SHED':
        case 'SHED': {
          // BATCH PROCESSING REMAINS ACTIVE: Admitted LOW events are continuously drained in large batches!
          const targetBatchSize = this.adaptiveEngine ? this.adaptiveEngine.getCurrentBatchSize() : 250;
          const batchSize = Math.min(targetBatchSize, this.queueManager.lowQueue.size());
          if (batchSize > 0) {
            const batch = this.queueManager.lowQueue.dequeueBatch(batchSize);
            const result = await this.batchProcessor.processBatch(batch, workerId);
            if (this.onBatchProcessed && result.events.length > 0) {
              this.onBatchProcessed(result.events, result.durationMs);
            }
            didWork = true;
          }

          // Shed excess only if queue pressure remains beyond the 95% safety ceiling
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

