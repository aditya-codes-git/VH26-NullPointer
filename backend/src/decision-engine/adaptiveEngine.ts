import { ProcessingStrategy } from '../models/event.js';
import { PipelineConfig } from '../config/pipelineConfig.js';
import { QueueManager } from '../queues/queueManager.js';

export type SystemPressureState = 'NORMAL' | 'PRESSURED' | 'OVERLOADED' | 'EXTREME';

export interface DecisionEvaluation {
  strategy: ProcessingStrategy;
  state: SystemPressureState;
  lowQueuePressure: number;
  criticalQueuePressure: number;
  rateImbalanceRatio: number;
  backlogGrowthRate: number;
  reason: string;
}

export class AdaptiveDecisionEngine {
  private config: PipelineConfig;
  private queueManager: QueueManager;
  
  private lastQueueDepth = 0;
  private lastEvaluationTime = Date.now();
  private smoothedGrowthRate = 0;

  constructor(config: PipelineConfig, queueManager: QueueManager) {
    this.config = config;
    this.queueManager = queueManager;
    this.lastEvaluationTime = Date.now();
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

    let state: SystemPressureState = 'NORMAL';
    let strategy: ProcessingStrategy = 'STREAM';
    let reason = 'System nominal: queue pressure low, throughput matching arrival.';

    // Tier 4: EXTREME OVERLOAD -> SHED
    if (lowQueuePressure >= this.config.SHED_PRESSURE_THRESHOLD) {
      state = 'EXTREME';
      strategy = 'SHED';
      reason = `Extreme backlog: Low-priority queue pressure (${(lowQueuePressure * 100).toFixed(1)}%) reached safety limit. Controlled shedding active.`;
    }
    // Tier 3: HIGH LOAD / OVERLOADED -> DEFER
    else if (lowQueuePressure >= this.config.DEFER_PRESSURE_THRESHOLD || (lowQueuePressure >= 0.40 && rateImbalanceRatio > 1.8 && this.smoothedGrowthRate > 50)) {
      state = 'OVERLOADED';
      strategy = 'DEFER';
      reason = `System overloaded: Low queue pressure ${(lowQueuePressure * 100).toFixed(1)}% with severe rate deficit (${rateImbalanceRatio.toFixed(1)}x). Deferring non-critical processing.`;
    }
    // Tier 2: MODERATE PRESSURE / GROWING BACKLOG -> BATCH
    else if (lowQueuePressure >= this.config.BATCH_PRESSURE_THRESHOLD || (lowQueueSize > 50 && this.smoothedGrowthRate > 20) || rateImbalanceRatio > 1.3) {
      state = 'PRESSURED';
      strategy = 'BATCH';
      reason = `Pressure detected: Ingestion (${incomingRatePerSec.toFixed(0)}/s) outpaces single-event processing. Micro-batching engaged to amortize overhead.`;
    }
    // Tier 1: NORMAL -> STREAM
    else {
      state = 'NORMAL';
      strategy = 'STREAM';
      reason = 'Nominal load: direct individual stream processing active.';
    }

    return {
      strategy,
      state,
      lowQueuePressure,
      criticalQueuePressure,
      rateImbalanceRatio,
      backlogGrowthRate: this.smoothedGrowthRate,
      reason,
    };
  }
}
