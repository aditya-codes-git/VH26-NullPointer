import { PipelineEvent, TelemetrySnapshot } from '../models/event.js';
import { QueueManager } from '../queues/queueManager.js';
import { SheddingPolicy } from '../backpressure/sheddingPolicy.js';
import { BackpressureController } from '../backpressure/backpressureController.js';
import { AdaptiveDecisionEngine, SystemPressureState } from '../decision-engine/adaptiveEngine.js';
import { EventSimulator } from '../simulator/eventSimulator.js';

export class MetricsCollector {
  private queueManager: QueueManager;
  private sheddingPolicy: SheddingPolicy;
  private backpressureController: BackpressureController;
  private adaptiveEngine: AdaptiveDecisionEngine;
  private simulator: EventSimulator | null = null;

  // Counters
  public totalReceived = 0;
  public totalProcessed = 0;

  public criticalReceived = 0;
  public criticalProcessed = 0;
  public criticalShed = 0; // Invariant check

  public highReceived = 0;
  public highProcessed = 0;

  public lowReceived = 0;
  public lowProcessed = 0;

  public batchedCount = 0;
  public deferredCount = 0;

  // Rolling rate tracking (1-second sliding windows)
  private incomingTimestamps: number[] = [];
  private processedTimestamps: number[] = [];

  // Latency samples (last 500 samples each)
  private criticalLatencies: number[] = [];
  private nonCriticalLatencies: number[] = [];
  private readonly maxLatencySamples = 500;

  constructor(
    queueManager: QueueManager,
    sheddingPolicy: SheddingPolicy,
    backpressureController: BackpressureController,
    adaptiveEngine: AdaptiveDecisionEngine
  ) {
    this.queueManager = queueManager;
    this.sheddingPolicy = sheddingPolicy;
    this.backpressureController = backpressureController;
    this.adaptiveEngine = adaptiveEngine;
  }

  public registerSimulator(simulator: EventSimulator): void {
    this.simulator = simulator;
  }

  public recordIncomingEvent(event: PipelineEvent): void {
    const now = Date.now();
    this.totalReceived++;
    this.incomingTimestamps.push(now);

    switch (event.priority) {
      case 'CRITICAL':
        this.criticalReceived++;
        break;
      case 'HIGH':
        this.highReceived++;
        break;
      case 'LOW':
        this.lowReceived++;
        break;
    }
  }

  public recordProcessedEvent(event: PipelineEvent, latencyMs: number): void {
    const now = Date.now();
    this.totalProcessed++;
    this.processedTimestamps.push(now);

    if (event.priority === 'CRITICAL') {
      this.criticalProcessed++;
      this.criticalLatencies.push(latencyMs);
      if (this.criticalLatencies.length > this.maxLatencySamples) {
        this.criticalLatencies.shift();
      }
    } else {
      if (event.priority === 'HIGH') {
        this.highProcessed++;
      } else {
        this.lowProcessed++;
      }
      this.nonCriticalLatencies.push(latencyMs);
      if (this.nonCriticalLatencies.length > this.maxLatencySamples) {
        this.nonCriticalLatencies.shift();
      }
    }
  }

  public recordBatchProcessed(events: PipelineEvent[], durationMs: number): void {
    const now = Date.now();
    this.batchedCount += events.length;
    this.totalProcessed += events.length;

    for (const event of events) {
      this.processedTimestamps.push(now);
      this.lowProcessed++;
      const latencyMs = now - event.createdAt;
      this.nonCriticalLatencies.push(latencyMs);
      if (this.nonCriticalLatencies.length > this.maxLatencySamples) {
        this.nonCriticalLatencies.shift();
      }
    }
  }

  public recordDeferred(): void {
    this.deferredCount++;
  }

  public getRates(): { incomingPerSec: number; processedPerSec: number } {
    const now = Date.now();
    const windowStart = now - 1000;

    // Filter rolling window
    this.incomingTimestamps = this.incomingTimestamps.filter((t) => t >= windowStart);
    this.processedTimestamps = this.processedTimestamps.filter((t) => t >= windowStart);

    return {
      incomingPerSec: this.incomingTimestamps.length,
      processedPerSec: this.processedTimestamps.length,
    };
  }

  private calculatePercentiles(latencies: number[]): { p50: number; p95: number; avg: number } {
    if (latencies.length === 0) {
      return { p50: 0, p95: 0, avg: 0 };
    }

    const sorted = [...latencies].sort((a, b) => a - b);
    const p50Idx = Math.floor(sorted.length * 0.50);
    const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    const sum = sorted.reduce((acc, v) => acc + v, 0);

    return {
      p50: Math.round(sorted[p50Idx]),
      p95: Math.round(sorted[p95Idx]),
      avg: Math.round(sum / sorted.length),
    };
  }

  public getSnapshot(): TelemetrySnapshot {
    const now = Date.now();
    const { incomingPerSec, processedPerSec } = this.getRates();

    // Evaluate adaptive decision engine
    const evaluation = this.adaptiveEngine.evaluate(incomingPerSec, processedPerSec);
    this.backpressureController.checkAndApply();

    const critLat = this.calculatePercentiles(this.criticalLatencies);
    const nonCritLat = this.calculatePercentiles(this.nonCriticalLatencies);

    // Calculated Critical Lost dynamically:
    // Critical Lost = Received - (Processed + Currently in Queue)
    const criticalInQueue = this.queueManager.criticalQueue.size();
    const calculatedCriticalLost = Math.max(0, this.criticalReceived - (this.criticalProcessed + criticalInQueue));

    return {
      timestamp: now,
      systemStatus: this.simulator?.getMode() !== 'STOPPED' ? 'RUNNING' : 'IDLE',
      simulatorMode: this.simulator?.getMode() || 'STOPPED',
      activeStrategy: evaluation.strategy,
      systemPressureState: evaluation.state,

      incomingRatePerSec: incomingPerSec,
      incomingRatePerMin: incomingPerSec * 60,
      throughputPerSec: processedPerSec,
      throughputPerMin: processedPerSec * 60,

      criticalQueueSize: this.queueManager.criticalQueue.size(),
      criticalQueueCapacity: this.queueManager.criticalQueue.capacity,
      criticalQueuePressure: Number(this.queueManager.criticalQueue.getPressure().toFixed(3)),

      highQueueSize: this.queueManager.highQueue.size(),
      highQueueCapacity: this.queueManager.highQueue.capacity,

      lowQueueSize: this.queueManager.lowQueue.size(),
      lowQueueCapacity: this.queueManager.lowQueue.capacity,
      lowQueuePressure: Number(this.queueManager.lowQueue.getPressure().toFixed(3)),

      criticalLatencyP50: critLat.p50,
      criticalLatencyP95: critLat.p95,
      criticalLatencyAvg: critLat.avg,

      nonCriticalLatencyP50: nonCritLat.p50,
      nonCriticalLatencyP95: nonCritLat.p95,
      nonCriticalLatencyAvg: nonCritLat.avg,

      totalReceived: this.totalReceived,
      totalProcessed: this.totalProcessed,
      criticalReceived: this.criticalReceived,
      criticalProcessed: this.criticalProcessed,
      criticalShed: this.criticalShed,
      criticalLost: calculatedCriticalLost,

      highReceived: this.highReceived,
      highProcessed: this.highProcessed,

      lowReceived: this.lowReceived,
      lowProcessed: this.lowProcessed,

      batchedCount: this.batchedCount,
      deferredCount: this.deferredCount,
      shedCount: this.sheddingPolicy.totalShedCount,
      safetyViolations: this.sheddingPolicy.totalSafetyViolations,

      backpressureActive: this.backpressureController.isActive(),
      recentShedEvents: this.sheddingPolicy.getRecentLogs(),
    };
  }

  public reset(): void {
    this.totalReceived = 0;
    this.totalProcessed = 0;
    this.criticalReceived = 0;
    this.criticalProcessed = 0;
    this.criticalShed = 0;
    this.highReceived = 0;
    this.highProcessed = 0;
    this.lowReceived = 0;
    this.lowProcessed = 0;
    this.batchedCount = 0;
    this.deferredCount = 0;
    this.incomingTimestamps = [];
    this.processedTimestamps = [];
    this.criticalLatencies = [];
    this.nonCriticalLatencies = [];
    this.sheddingPolicy.clear();
    this.queueManager.clearAll();
  }
}
