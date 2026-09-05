import {
  ProcessingStrategy,
  EventPriority,
  DecisionWeights,
  DecisionInputs,
  DecisionContributions,
  DecisionSnapshotEntry,
  DecisionFunctionTelemetry,
} from '../models/event.js';
import { PipelineConfig } from '../config/pipelineConfig.js';
import { QueueManager } from '../queues/queueManager.js';
import { WorkerPool } from '../processing/workerPool.js';
import { WorkerScaler } from '../workers/workerScaler.js';
import { MetricsCollector } from '../metrics/metricsCollector.js';
import { AdaptiveDecisionEngine } from './adaptiveEngine.js';

export const DEFAULT_DECISION_WEIGHTS: DecisionWeights = {
  queuePressure: 0.30,
  workerUtilization: 0.25,
  latency: 0.15,
  dataSize: 0.10,
  costPressure: 0.10,
  priority: 0.10,
};

export interface RawDecisionInputs {
  queuePressure?: number;
  workerUtilization?: number;
  latencyMs?: number;
  dataSizeBytes?: number;
  costPressure?: number;
  priority?: EventPriority | number;
}

export interface DecisionResult {
  decision: ProcessingStrategy;
  score: number;
  confidence: number;
  inputs: DecisionInputs;
  contributions: DecisionContributions;
  weights: DecisionWeights;
  reasons: string[];
  explanation: string;
  timestamp: string;
  timestampMs: number;
}

export class FormalizedDecisionEngine {
  private config: PipelineConfig;
  private queueManager: QueueManager;
  private adaptiveEngine?: AdaptiveDecisionEngine;
  private workerPool?: WorkerPool;
  private workerScaler?: WorkerScaler;
  private metricsCollector?: MetricsCollector;

  private weights: DecisionWeights = { ...DEFAULT_DECISION_WEIGHTS };
  private decisionHistory: DecisionSnapshotEntry[] = [];
  private readonly maxHistoryLength = 50;

  private lastResult: DecisionResult | null = null;
  public onDecision?: (entry: DecisionSnapshotEntry) => void;

  constructor(
    config: PipelineConfig,
    queueManager: QueueManager,
    adaptiveEngine?: AdaptiveDecisionEngine,
    workerPool?: WorkerPool,
    workerScaler?: WorkerScaler,
    metricsCollector?: MetricsCollector
  ) {
    this.config = config;
    this.queueManager = queueManager;
    this.adaptiveEngine = adaptiveEngine;
    this.workerPool = workerPool;
    this.workerScaler = workerScaler;
    this.metricsCollector = metricsCollector;

    // Run baseline initial evaluation
    this.evaluateFromSystemState('LOW');
  }

  public registerComponents(
    workerPool?: WorkerPool,
    workerScaler?: WorkerScaler,
    metricsCollector?: MetricsCollector,
    adaptiveEngine?: AdaptiveDecisionEngine
  ): void {
    if (workerPool) this.workerPool = workerPool;
    if (workerScaler) this.workerScaler = workerScaler;
    if (metricsCollector) this.metricsCollector = metricsCollector;
    if (adaptiveEngine) this.adaptiveEngine = adaptiveEngine;
  }

  public getWeights(): DecisionWeights {
    return { ...this.weights };
  }

  public setWeights(newWeights: Partial<DecisionWeights>): void {
    const updated = { ...this.weights, ...newWeights };
    const total =
      updated.queuePressure +
      updated.workerUtilization +
      updated.latency +
      updated.dataSize +
      updated.costPressure +
      updated.priority;

    if (Math.abs(total - 1.0) > 0.001) {
      throw new Error(`Decision weights must sum to exactly 1.0 (received ${total.toFixed(4)})`);
    }

    this.weights = updated;
  }

  /**
   * Normalizes arbitrary raw inputs into comparable [0.0, 1.0] domain.
   */
  public normalizeInputs(raw: RawDecisionInputs): DecisionInputs {
    // 1. Queue Pressure: [0, 1]
    const rawQ = raw.queuePressure ?? 0;
    const queuePressure = Math.min(1.0, Math.max(0.0, rawQ > 1 ? rawQ / 100 : rawQ));

    // 2. Worker Utilization: [0, 1]
    const rawU = raw.workerUtilization ?? 0;
    const workerUtilization = Math.min(1.0, Math.max(0.0, rawU > 1 ? rawU / 100 : rawU));

    // 3. Latency: baseline 10ms (0.0) to 500ms (1.0)
    const latencyMs = Math.max(0, raw.latencyMs ?? 15);
    const latency = Math.min(1.0, Math.max(0.0, (latencyMs - 10) / 490));

    // 4. Data Size: baseline 100B (0.0) to 2500B (1.0)
    const dataSizeBytes = Math.max(0, raw.dataSizeBytes ?? 320);
    const dataSize = Math.min(1.0, Math.max(0.0, (dataSizeBytes - 100) / 2400));

    // 5. Cost Pressure: [0, 1]
    const rawC = raw.costPressure ?? 0;
    const costPressure = Math.min(1.0, Math.max(0.0, rawC > 1 ? rawC / 100 : rawC));

    // 6. Priority: CRITICAL -> 0.00 (strongly favors STREAM), HIGH -> 0.35, LOW -> 1.00
    let priorityNormalized = 1.0;
    let priorityName: EventPriority = 'LOW';

    if (typeof raw.priority === 'number') {
      priorityNormalized = Math.min(1.0, Math.max(0.0, raw.priority));
      if (priorityNormalized < 0.2) priorityName = 'CRITICAL';
      else if (priorityNormalized < 0.7) priorityName = 'HIGH';
      else priorityName = 'LOW';
    } else if (raw.priority === 'CRITICAL') {
      priorityNormalized = 0.0;
      priorityName = 'CRITICAL';
    } else if (raw.priority === 'HIGH') {
      priorityNormalized = 0.35;
      priorityName = 'HIGH';
    } else {
      priorityNormalized = 1.0;
      priorityName = 'LOW';
    }

    return {
      queuePressure: Number(queuePressure.toFixed(3)),
      workerUtilization: Number(workerUtilization.toFixed(3)),
      latency: Number(latency.toFixed(3)),
      latencyMs: Math.round(latencyMs),
      dataSize: Number(dataSize.toFixed(3)),
      dataSizeBytes: Math.round(dataSizeBytes),
      costPressure: Number(costPressure.toFixed(3)),
      priority: Number(priorityNormalized.toFixed(3)),
      priorityName,
    };
  }

  /**
   * Deterministic decision calculation from normalized inputs and weights.
   */
  public calculateDecision(
    rawInputs: RawDecisionInputs,
    customWeights?: DecisionWeights
  ): DecisionResult {
    const weights = customWeights || this.weights;
    const inputs = this.normalizeInputs(rawInputs);

    // Compute contribution breakdown
    const contributions: DecisionContributions = {
      queuePressure: Number((weights.queuePressure * inputs.queuePressure).toFixed(3)),
      workerUtilization: Number((weights.workerUtilization * inputs.workerUtilization).toFixed(3)),
      latency: Number((weights.latency * inputs.latency).toFixed(3)),
      dataSize: Number((weights.dataSize * inputs.dataSize).toFixed(3)),
      costPressure: Number((weights.costPressure * inputs.costPressure).toFixed(3)),
      priority: Number((weights.priority * inputs.priority).toFixed(3)),
    };

    // Composite score is the exact sum of contributions
    const rawScore =
      contributions.queuePressure +
      contributions.workerUtilization +
      contributions.latency +
      contributions.dataSize +
      contributions.costPressure +
      contributions.priority;
    const score = Number(rawScore.toFixed(3));

    // Decision Strategy Mapping with Priority Invariants
    let decision: ProcessingStrategy = 'STREAM';

    if (inputs.priorityName === 'CRITICAL') {
      // Invariant: CRITICAL events are ALWAYS STREAM (zero-drop, protected)
      decision = 'STREAM';
    } else if (inputs.priorityName === 'HIGH') {
      // Invariant: HIGH events are protected; they may BATCH under load, but NEVER DEFER or SHED
      if (score >= 0.50) {
        decision = 'BATCH';
      } else {
        decision = 'STREAM';
      }
    } else {
      // LOW Priority: Fully adaptive across all 4 tiers
      if (score >= 0.85) {
        decision = 'SHED';
      } else if (score >= 0.65) {
        decision = 'DEFER';
      } else if (score >= 0.35) {
        decision = 'BATCH';
      } else {
        decision = 'STREAM';
      }
    }

    // Generate factor reasons
    const reasons: string[] = [];

    // 1. Queue reason
    if (inputs.queuePressure >= 0.85) {
      reasons.push(`Queue pressure is critical (${Math.round(inputs.queuePressure * 100)}%)`);
    } else if (inputs.queuePressure >= 0.65) {
      reasons.push(`Queue pressure is high (${Math.round(inputs.queuePressure * 100)}%)`);
    } else if (inputs.queuePressure >= 0.35) {
      reasons.push(`Queue pressure is moderate (${Math.round(inputs.queuePressure * 100)}%)`);
    } else {
      reasons.push(`Queue pressure is healthy (${Math.round(inputs.queuePressure * 100)}%)`);
    }

    // 2. Worker reason
    if (inputs.workerUtilization >= 0.80) {
      reasons.push(`Worker pool heavily utilized (${Math.round(inputs.workerUtilization * 100)}%)`);
    } else if (inputs.workerUtilization >= 0.50) {
      reasons.push(`Worker utilization is moderate (${Math.round(inputs.workerUtilization * 100)}%)`);
    } else {
      reasons.push(`Worker pool capacity is ample (${Math.round(inputs.workerUtilization * 100)}%)`);
    }

    // 3. Latency reason
    if (inputs.latency >= 0.70) {
      reasons.push(`Processing latency is high (${inputs.latencyMs} ms)`);
    } else if (inputs.latency >= 0.35) {
      reasons.push(`Processing latency is elevated (${inputs.latencyMs} ms)`);
    } else {
      reasons.push(`Processing latency is optimal (${inputs.latencyMs} ms)`);
    }

    // 4. Data size reason
    if (inputs.dataSize >= 0.60) {
      reasons.push(`Event payload volume is heavy (${inputs.dataSizeBytes} B)`);
    } else {
      reasons.push(`Standard event payload volume (${inputs.dataSizeBytes} B)`);
    }

    // 5. Cost pressure reason
    if (inputs.costPressure >= 0.60) {
      reasons.push(`Infrastructure resource cost pressure is high (${Math.round(inputs.costPressure * 100)}%)`);
    } else {
      reasons.push(`Resource cost pressure is manageable (${Math.round(inputs.costPressure * 100)}%)`);
    }

    // 6. Priority reason
    if (inputs.priorityName === 'CRITICAL') {
      reasons.push('Event is CRITICAL priority (requires guaranteed zero-drop real-time streaming)');
    } else if (inputs.priorityName === 'HIGH') {
      reasons.push('Event is HIGH priority (protected pipeline lane; no shedding allowed)');
    } else {
      reasons.push('Event is LOW priority (eligible for batching, deferral, and shedding under strain)');
    }

    // Synthesize human-readable final explanation
    let explanation = '';
    const qPct = Math.round(inputs.queuePressure * 100);
    const uPct = Math.round(inputs.workerUtilization * 100);

    if (inputs.priorityName === 'CRITICAL') {
      explanation = `STREAM enforced because event is CRITICAL priority ($0 score penalty). Critical workloads bypass deferral and shedding to guarantee zero data loss.`;
    } else if (inputs.priorityName === 'HIGH' && decision === 'BATCH') {
      explanation = `BATCH selected for HIGH-priority event to aggregate throughput under ${qPct}% queue pressure and ${uPct}% worker load while preserving zero-drop protection.`;
    } else if (inputs.priorityName === 'HIGH') {
      explanation = `STREAM selected for HIGH-priority event under manageable ${qPct}% queue pressure, ensuring rapid individual processing.`;
    } else if (decision === 'STREAM') {
      explanation = `STREAM selected because system pressure is nominal (${qPct}% queue, ${uPct}% workers) with healthy ${inputs.latencyMs}ms latency, allowing immediate individual event processing.`;
    } else if (decision === 'BATCH') {
      explanation = `BATCH selected because moderate load (${qPct}% queue, ${uPct}% workers) warrants micro-batch aggregation to optimize worker throughput and amortize execution overhead.`;
    } else if (decision === 'DEFER') {
      explanation = `DEFER selected because elevated queue pressure (${qPct}%) and worker utilization (${uPct}%) require pacing intake of low-priority events to preserve headroom for higher-priority streams.`;
    } else {
      explanation = `SHED selected because extreme queue saturation (${qPct}%) and worker exhaustion (${uPct}%) threaten memory safety; dropping non-critical low-priority ingress prevents cascading system failure.`;
    }

    // Confidence indicator: distance from threshold boundaries (clamped 75% to 99%)
    const dist = Math.min(
      Math.abs(score - 0.35),
      Math.abs(score - 0.65),
      Math.abs(score - 0.85)
    );
    const confidence = Number(Math.min(0.99, Math.max(0.75, 0.75 + dist * 1.2)).toFixed(2));

    const now = Date.now();
    const d = new Date(now);
    const timestamp = `${d.toTimeString().split(' ')[0]}.${String(now % 1000).padStart(3, '0')}`;

    return {
      decision,
      score,
      confidence,
      inputs,
      contributions,
      weights,
      reasons,
      explanation,
      timestamp,
      timestampMs: now,
    };
  }

  public recordDecision(result: DecisionResult): void {
    this.lastResult = result;

    // Record into bounded decision history
    const historyEntry: DecisionSnapshotEntry = {
      id: `dec_${result.timestampMs.toString().slice(-6)}_${Math.floor(Math.random() * 1000)}`,
      timestamp: result.timestamp,
      timestampMs: result.timestampMs,
      decision: result.decision,
      score: result.score,
      queuePressurePercent: Math.round(result.inputs.queuePressure * 100),
      workerUtilizationPercent: Math.round(result.inputs.workerUtilization * 100),
      latencyMs: result.inputs.latencyMs,
      dataSizeBytes: result.inputs.dataSizeBytes,
      costPressurePercent: Math.round(result.inputs.costPressure * 100),
      priority: result.inputs.priorityName,
      topReasons: result.reasons.slice(0, 4),
      explanation: result.explanation,
      confidence: result.confidence,
    };

    this.decisionHistory.unshift(historyEntry);
    if (this.decisionHistory.length > this.maxHistoryLength) {
      this.decisionHistory.pop();
    }

    if (this.onDecision) {
      this.onDecision(historyEntry);
    }
  }

  /**
   * Evaluates custom inputs and records result in state and history.
   */
  public evaluateWithInputs(rawInputs: RawDecisionInputs): DecisionResult {
    const result = this.calculateDecision(rawInputs);
    this.recordDecision(result);
    return result;
  }

  /**
   * Reads real measurements from the live system state and executes evaluation.
   */
  public evaluateFromSystemState(priorityOverride?: EventPriority): DecisionResult {
    // 1. Live Queue Pressure
    const lowQueuePressure = this.queueManager?.lowQueue ? this.queueManager.lowQueue.getPressure() : 0.0;

    // 2. Live Worker Utilization
    let workerUtilization = 0.0;
    if (this.workerScaler) {
      workerUtilization = this.workerScaler.getTelemetry().workerUtilization;
    } else if (this.workerPool) {
      workerUtilization = this.workerPool.getRealUtilization();
    }

    // 3. Live Processing Latency
    let latencyMs = 15;
    if (this.metricsCollector) {
      latencyMs = this.metricsCollector.getAverageNonCriticalLatency();
    }

    // 4. Data Size baseline
    const dataSizeBytes = 350;

    // 5. Cost Pressure: worker scaling ratio + queue memory ratio
    let currentWorkers = 2;
    let maxWorkers = 8;
    if (this.workerScaler) {
      const t = this.workerScaler.getTelemetry();
      currentWorkers = t.currentWorkers;
      maxWorkers = t.maxWorkers;
    }
    const workerRatio = maxWorkers > 2 ? (currentWorkers - 2) / (maxWorkers - 2) : 0;
    const costPressure = Math.min(1.0, 0.6 * workerRatio + 0.4 * lowQueuePressure);

    // 6. Priority: default to 'LOW' for adaptive system explanation
    const priority = priorityOverride || 'LOW';

    const result = this.calculateDecision({
      queuePressure: lowQueuePressure,
      workerUtilization,
      latencyMs,
      dataSizeBytes,
      costPressure,
      priority,
    });

    this.recordDecision(result);
    return result;
  }

  public getTelemetry(): DecisionFunctionTelemetry {
    if (!this.lastResult) {
      this.evaluateFromSystemState('LOW');
    }

    const current = this.lastResult!;

    return {
      currentDecision: current.decision,
      currentScore: current.score,
      confidence: current.confidence,
      weights: { ...this.weights },
      currentInputs: { ...current.inputs },
      currentContributions: { ...current.contributions },
      currentReasons: [...current.reasons],
      explanation: current.explanation,
      lastUpdated: current.timestamp,
      lastUpdatedMs: current.timestampMs,
      decisionHistory: [...this.decisionHistory],
    };
  }

  public reset(): void {
    this.decisionHistory = [];
    this.lastResult = null;
    this.evaluateFromSystemState('LOW');
  }
}
