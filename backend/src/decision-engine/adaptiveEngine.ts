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

  // Hysteresis & State Tracking
  private currentStrategy: ProcessingStrategy = 'STREAM';
  private currentState: SystemPressureState = 'NORMAL';
  private lastTransitionTime = Date.now();
  private readonly minDwellTimeMs = 1000;

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

  private getStrategyRank(strategy: ProcessingStrategy): number {
    switch (strategy) {
      case 'STREAM': return 0;
      case 'BATCH': return 1;
      case 'DEFER': return 2;
      case 'SHED':
      case 'DEFER + SHED': return 3;
      default: return 0;
    }
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
   * 4. Asymmetric Hysteresis (Immediate attack on load, 10% deadband + dwell time on recovery)
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

    const maxWorkerCapacity = this.config.WORKER_CONCURRENCY * 140;
    const workerLoadPercent = Math.min(100, Math.round((processingRatePerSec / Math.max(1, maxWorkerCapacity)) * 100));

    // Dynamic Hysteresis State Machine
    let targetStrategy: ProcessingStrategy = this.currentStrategy;
    let targetState: SystemPressureState = this.currentState;

    // Asymmetric entry/exit thresholds (10% deadband)
    const isExtreme = lowQueuePressure >= 0.92;
    const exitExtreme = lowQueuePressure < 0.85;

    const isOverloaded = lowQueuePressure >= 0.70 || (lowQueuePressure >= 0.40 && rateImbalanceRatio > 1.8 && this.smoothedGrowthRate > 50);
    const exitOverloaded = lowQueuePressure < 0.60;

    const isPressured = lowQueuePressure >= 0.30 || (lowQueueSize > 50 && this.smoothedGrowthRate > 20) || rateImbalanceRatio > 1.3;
    const exitPressured = lowQueuePressure < 0.20 && rateImbalanceRatio <= 1.1;

    // State machine with clean hysteresis:
    // When in a state, check for upgrades (immediate) or downgrades (via exit threshold + dwell time)
    if (this.currentStrategy === 'DEFER + SHED' || this.currentStrategy === 'SHED') {
      if (exitExtreme) {
        targetStrategy = isOverloaded ? 'DEFER' : (isPressured ? 'BATCH' : 'STREAM');
        targetState = isOverloaded ? 'OVERLOADED' : (isPressured ? 'PRESSURED' : 'NORMAL');
      }
    } else if (this.currentStrategy === 'DEFER') {
      if (isExtreme) {
        targetStrategy = 'DEFER + SHED';
        targetState = 'EXTREME';
      } else if (exitOverloaded) {
        targetStrategy = isPressured ? 'BATCH' : 'STREAM';
        targetState = isPressured ? 'PRESSURED' : 'NORMAL';
      }
    } else if (this.currentStrategy === 'BATCH') {
      if (isExtreme) {
        targetStrategy = 'DEFER + SHED';
        targetState = 'EXTREME';
      } else if (isOverloaded) {
        targetStrategy = 'DEFER';
        targetState = 'OVERLOADED';
      } else if (exitPressured) {
        targetStrategy = 'STREAM';
        targetState = 'NORMAL';
      }
    } else {
      // Current state: STREAM
      if (isExtreme) {
        targetStrategy = 'DEFER + SHED';
        targetState = 'EXTREME';
      } else if (isOverloaded) {
        targetStrategy = 'DEFER';
        targetState = 'OVERLOADED';
      } else if (isPressured) {
        targetStrategy = 'BATCH';
        targetState = 'PRESSURED';
      }
    }

    // Apply minimum dwell time on downgrade (prevents flapping around thresholds)
    const isDowngrade = this.getStrategyRank(targetStrategy) < this.getStrategyRank(this.currentStrategy);
    if (!isDowngrade || (now - this.lastTransitionTime >= this.minDwellTimeMs)) {
      if (this.currentStrategy !== targetStrategy) {
        this.currentStrategy = targetStrategy;
        this.currentState = targetState;
        this.lastTransitionTime = now;
      }
    }

    // Dynamic batch size computation
    const { batchSize, reason: batchSizeReason } = this.calculateBatchSize(
      lowQueuePressure,
      this.smoothedGrowthRate,
      workerLoadPercent
    );
    this.currentBatchSize = batchSize;
    this.currentBatchSizeReason = batchSizeReason;

    // Formulate descriptive, plain-English explanation
    let reason = '';
    if (this.currentStrategy === 'DEFER + SHED' || this.currentStrategy === 'SHED') {
      reason = `Capacity saturated: Low queue pressure is ${(lowQueuePressure * 100).toFixed(1)}%. BATCH processing remains active (size ${batchSize}) to drain admitted backlog while shedding excess ingress to protect memory.`;
    } else if (this.currentStrategy === 'DEFER') {
      reason = `Elevated load: Low queue pressure is ${(lowQueuePressure * 100).toFixed(1)}%. Paced batch processing active; reserving priority for critical and high streams while continuing to drain low backlog.`;
    } else if (this.currentStrategy === 'BATCH') {
      reason = `Pressure detected: Ingestion (${incomingRatePerSec.toFixed(0)}/s) outpaces single-event processing. Micro-batching engaged (${batchSize} ev/batch) to amortize execution overhead.`;
    } else {
      reason = 'Nominal load: direct individual stream processing active across all priority tiers.';
    }

    // Per-tier strategies:
    // CRITICAL and HIGH remain STREAM while LOW dynamically adapts
    const criticalStrategy: ProcessingStrategy = 'STREAM';
    const highStrategy: ProcessingStrategy = 'STREAM';
    const lowStrategy: ProcessingStrategy = this.currentStrategy;

    return {
      strategy: this.currentStrategy,
      criticalStrategy,
      highStrategy,
      lowStrategy,
      state: this.currentState,
      lowQueuePressure,
      highQueuePressure,
      criticalQueuePressure,
      rateImbalanceRatio,
      backlogGrowthRate: Math.round(this.smoothedGrowthRate),
      workerLoadPercent,
      batchSize,
      batchSizeReason,
      reason,
      sheddingStatus: (this.currentStrategy === 'DEFER + SHED' || this.currentStrategy === 'SHED') ? 'ENABLED' : 'DISABLED',
    };
  }
}
