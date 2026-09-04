import { PipelineEvent, ProcessingStrategy } from '../models/event.js';
import { PipelineConfig } from '../config/pipelineConfig.js';
import { QueueManager } from '../queues/queueManager.js';
import { BatchProcessor } from './batchProcessor.js';
import { SheddingPolicy } from '../backpressure/sheddingPolicy.js';

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
    sheddingPolicy: SheddingPolicy
  ) {
    this.config = config;
    this.queueManager = queueManager;
    this.batchProcessor = batchProcessor;
    this.sheddingPolicy = sheddingPolicy;
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
      this.runWorkerLoop();
    }
  }

  public stop(): void {
    this.isRunning = false;
  }

  private async runWorkerLoop(): Promise<void> {
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
          await this.processSingleEvent(criticalEvent, 'STREAM');
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
        await this.processSingleEvent(highEvent, 'STREAM');
        didWork = true;
        continue;
      }

      // STEP 3: Handle Low Priority Queue based on active adaptive strategy
      switch (this.activeStrategy) {
        case 'STREAM': {
          const lowEvent = this.queueManager.lowQueue.dequeue();
          if (lowEvent) {
            await this.processSingleEvent(lowEvent, 'STREAM');
            didWork = true;
          }
          break;
        }

        case 'BATCH': {
          const batchSize = Math.min(this.config.BATCH_SIZE, this.queueManager.lowQueue.size());
          if (batchSize > 0) {
            const batch = this.queueManager.lowQueue.dequeueBatch(batchSize);
            const result = await this.batchProcessor.processBatch(batch);
            if (this.onBatchProcessed) {
              this.onBatchProcessed(result.events, result.durationMs);
            }
            didWork = true;
          }
          break;
        }

        case 'DEFER': {
          // Low-priority execution is held back to save CPU for critical work.
          if (this.queueManager.lowQueue.size() > 0 && Date.now() - this.lastDeferLog > 1200) {
            this.lastDeferLog = Date.now();
            if (this.metricsCollector) {
              this.metricsCollector.recordDeferred('Queue pressure elevated: deferring non-critical execution to protect critical path');
            }
          }
          break;
        }

        case 'SHED': {
          // Shed excess low priority items down to safe threshold
          const excess = this.queueManager.lowQueue.size() - Math.round(this.config.LOW_QUEUE_CAPACITY * this.config.DEFER_PRESSURE_THRESHOLD);
          if (excess > 0) {
            const countToShed = Math.min(excess, 50);
            const result = this.sheddingPolicy.executeShedding(countToShed, 'LOW_QUEUE_PRESSURE_CRITICAL_OVERLOAD');
            if (result.entries.length > 0 && this.metricsCollector) {
              const top = result.entries[0];
              const now = Date.now();
              const d = new Date(now);
              const timeStr = `${d.toTimeString().split(' ')[0]}.${String(now % 1000).padStart(3, '0')}`;
              this.metricsCollector.addActivityLog({
                id: top.eventId,
                type: top.type,
                priority: top.priority,
                strategy: 'SHED',
                status: 'SHED',
                reason: `Controlled shed: Dropped ${result.shedCount} low-priority logs to preserve capacity`,
                timestamp: timeStr,
                timestampMs: now,
              });
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

  private async processSingleEvent(event: PipelineEvent, strategy: ProcessingStrategy): Promise<void> {
    // Calibrated simulated service time (e.g. 7ms per event)
    await new Promise((resolve) => setTimeout(resolve, this.config.BASE_PROCESSING_DELAY_MS));

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
