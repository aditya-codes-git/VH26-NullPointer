import { ProcessingStrategy } from '../models/event.js';
import { PipelineConfig } from '../config/pipelineConfig.js';
import { QueueManager } from '../queues/queueManager.js';

export type SystemPressureState = 'NORMAL' | 'PRESSURED' | 'OVERLOADED' | 'EXTREME';

export interface DecisionEvaluation {
  strategy: ProcessingStrategy;
  criticalStrategy: ProcessingStrategy;
  highStrategy: ProcessingStrategy;
  lowStrategy: ProcessingStrategy;
  state: SystemPressureState;
  lowQueuePressure: number;
  highQueuePressure: number;
  criticalQueuePressure: number;
  rateImbalanceRatio: number;
  backlogGrowthRate: number;
  workerLoadPercent: number;
  batchSize: number;
  batchSizeReason: string;
  reason: string;
  sheddingStatus: 'ENABLED' | 'DISABLED';
}

export class AdaptiveDecisionEngine {
  private config: PipelineConfig;
  private queueManager: QueueManager;
  
  private lastQueueDepth = 0;
  private lastEvaluationTime = Date.now();
  private smoothedGrowthRate = 0;
  private currentBatchSize = 10;
  private currentBatchSizeReason = 'Nominal queue depth: minimum batch size active.';

  constructor(config: PipelineConfig, queueManager: QueueManager) {
    this.config = config;
    this.queueManager = queueManager;
    this.lastEvaluationTime = Date.now();
  }

  public getCurrentBatchSize(): number {
    return this.currentBatchSize;
  }

  public getCurrentBatchSizeReason(): string {
    return this.currentBatchSizeReason;
  }

  /**
   * Computes dynamic batch size based on low-queue pressure, backlog growth rate, and worker load.
   * Follows configurable tiered thresholds in PipelineConfig.
   */
  public calculateBatchSize(
    lowQueuePressure: number,
    backlogGrowth: number,
    workerLoad: number
  ): { batchSize: number; reason: string } {
    let baseBatchSize = 10;
    for (const tier of this.config.DYNAMIC_BATCH_TIERS) {
      if (lowQueuePressure >= tier.minPressure) {
        baseBatchSize = tier.batchSize;
        break;
      }
    }

    let batchSize = baseBatchSize;
    let modifierReason = '';
    // Boost batch size under high backlog growth rate to amortize overhead faster
    if (backlogGrowth > 60 && workerLoad > 70 && batchSize < 250) {
      batchSize = Math.min(250, Math.max(batchSize, Math.round(batchSize * 1.5)));
      modifierReason = ` (accelerated due to +${Math.round(backlogGrowth)}/s backlog growth and ${workerLoad}% worker load)`;
    }

    const pressurePercent = Math.round(lowQueuePressure * 100);
    const reason = `Low queue pressure is ${pressurePercent}%; dynamic batch size set to ${batchSize} to improve processing efficiency${modifierReason}.`;

    return { batchSize, reason };
  }

  /**
   * Evaluates current system state based on:
   * 1. Queue Pressure (current non-critical queue size vs. capacity)
   * 2. Rate Imbalance (incoming arrival rate vs. worker processing throughput)
   * 3. Backlog Growth Rate (change in queue depth over time)
   */
  public evaluate(incomingRatePerSec: number, processingRatePerSec: number): DecisionEvaluation {
    const now = Date.now();
    const dtSeconds = Math.max(0.1, (now - this.lastEvaluationTime) / 1000);
    
    const lowQueueSize = this.queueManager.lowQueue.size();
    const lowQueuePressure = this.queueManager.lowQueue.getPressure();
    const highQueuePressure = this.queueManager.highQueue.getPressure();
    const criticalQueuePressure = this.queueManager.criticalQueue.getPressure();

    // Calculate backlog growth rate (events per second)
    const deltaQueue = lowQueueSize - this.lastQueueDepth;
    const currentGrowthRate = deltaQueue / dtSeconds;
    this.smoothedGrowthRate = 0.7 * this.smoothedGrowthRate + 0.3 * currentGrowthRate;

    this.lastQueueDepth = lowQueueSize;
    this.lastEvaluationTime = now;

    const rateImbalanceRatio = processingRatePerSec > 0 
      ? incomingRatePerSec / processingRatePerSec 
      : (incomingRatePerSec > 0 ? 2.0 : 1.0);

    // Theoretical maximum throughput of worker pool (~140/s per concurrency)
    const maxWorkerCapacity = this.config.WORKER_CONCURRENCY * 140;
    const workerLoadPercent = Math.min(100, Math.round((processingRatePerSec / Math.max(1, maxWorkerCapacity)) * 100));

    let state: SystemPressureState = 'NORMAL';
    let strategy: ProcessingStrategy = 'STREAM';
    let reason = 'System nominal: queue pressure low, throughput matching arrival.';

    // Tier 4: EXTREME OVERLOAD -> SHED
    if (lowQueuePressure >= this.config.SHED_PRESSURE_THRESHOLD) {
      state = 'EXTREME';
      strategy = 'SHED';
      reason = `Extreme backlog: Low-priority queue pressure (${(lowQueuePressure * 100).toFixed(1)}%) reached safety limit. Controlled shedding active for non-critical logs while business-critical stream is protected.`;
    }
    // Tier 3: HIGH LOAD / OVERLOADED -> DEFER
    else if (lowQueuePressure >= this.config.DEFER_PRESSURE_THRESHOLD || (lowQueuePressure >= 0.40 && rateImbalanceRatio > 1.8 && this.smoothedGrowthRate > 50)) {
      state = 'OVERLOADED';
      strategy = 'DEFER';
      reason = `System overloaded: Low queue pressure ${(lowQueuePressure * 100).toFixed(1)}% with rate deficit (${rateImbalanceRatio.toFixed(1)}x). Deferring non-critical processing to dedicate CPU to critical path.`;
    }
    // Tier 2: MODERATE PRESSURE / GROWING BACKLOG -> BATCH
    else if (lowQueuePressure >= this.config.BATCH_PRESSURE_THRESHOLD || (lowQueueSize > 50 && this.smoothedGrowthRate > 20) || rateImbalanceRatio > 1.3) {
      state = 'PRESSURED';
      strategy = 'BATCH';
      reason = `Pressure detected: Ingestion (${incomingRatePerSec.toFixed(0)}/s) outpaces single-event processing. Micro-batching engaged to amortize execution overhead.`;
    }
    // Tier 1: NORMAL -> STREAM
    else {
      state = 'NORMAL';
      strategy = 'STREAM';
      reason = 'Nominal load: direct individual stream processing active across all priority tiers.';
    }

    // Dynamic batch size computation
    const { batchSize, reason: batchSizeReason } = this.calculateBatchSize(
      lowQueuePressure,
      this.smoothedGrowthRate,
      workerLoadPercent
    );
    this.currentBatchSize = batchSize;
    this.currentBatchSizeReason = batchSizeReason;

    // Per-tier strategies:
    // CRITICAL and HIGH remain STREAM while LOW dynamically adapts
    const criticalStrategy: ProcessingStrategy = 'STREAM';
    const highStrategy: ProcessingStrategy = 'STREAM';
    const lowStrategy: ProcessingStrategy = strategy;

    return {
      strategy,
      criticalStrategy,
      highStrategy,
      lowStrategy,
      state,
      lowQueuePressure,
      highQueuePressure,
      criticalQueuePressure,
      rateImbalanceRatio,
      backlogGrowthRate: Math.round(this.smoothedGrowthRate),
      workerLoadPercent,
      batchSize,
      batchSizeReason,
      reason,
      sheddingStatus: strategy === 'SHED' ? 'ENABLED' : 'DISABLED',
    };
  }
}

