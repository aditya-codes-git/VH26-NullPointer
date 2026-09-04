import { PipelineEvent, TelemetrySnapshot, ActivityLogEntry, BatchSizeObservation } from '../models/event.js';
import { QueueManager } from '../queues/queueManager.js';
import { SheddingPolicy } from '../backpressure/sheddingPolicy.js';
import { BackpressureController } from '../backpressure/backpressureController.js';
import { AdaptiveDecisionEngine, SystemPressureState } from '../decision-engine/adaptiveEngine.js';
import { EventSimulator } from '../simulator/eventSimulator.js';
import { RetryController } from '../resilience/retryController.js';
import { WorkerScaler } from '../workers/workerScaler.js';

export class MetricsCollector {
  private queueManager: QueueManager;
  private sheddingPolicy: SheddingPolicy;
  private backpressureController: BackpressureController;
  private adaptiveEngine: AdaptiveDecisionEngine;
  private retryController?: RetryController;
  private workerScaler?: WorkerScaler;
  private simulator: EventSimulator | null = null;

  // Counters
  public totalReceived = 0;
  public totalProcessed = 0;

  public criticalReceived = 0;
  public criticalProcessed = 0;
  public criticalShed = 0; // Invariant check
  public criticalInFlight = 0;

  public highReceived = 0;
  public highProcessed = 0;

  public lowReceived = 0;
  public lowProcessed = 0;
  public lowAccepted = 0;
  public lowBatched = 0;
  public lowDeferredCycles = 0;

  public get lowShed(): number {
    return this.sheddingPolicy.totalShedCount;
  }

  public batchedCount = 0;
  public deferredCount = 0;

  // Rolling rate tracking (1-second sliding windows)
  private incomingTimestamps: number[] = [];
  private processedTimestamps: number[] = [];

  // Latency samples (last 500 samples each)
  private criticalLatencies: number[] = [];
  private nonCriticalLatencies: number[] = [];
  private readonly maxLatencySamples = 500;

  // Ring buffer for real-time activity and decision logs
  private recentActivityLogs: ActivityLogEntry[] = [];
  private readonly maxActivityLogs = 50;

  // Ring buffer for batch size history (max 50 observations)
  private batchSizeHistory: BatchSizeObservation[] = [];
  private readonly maxBatchObservations = 50;

  constructor(
    queueManager: QueueManager,
    sheddingPolicy: SheddingPolicy,
    backpressureController: BackpressureController,
    adaptiveEngine: AdaptiveDecisionEngine,
    retryController?: RetryController
  ) {
    this.queueManager = queueManager;
    this.sheddingPolicy = sheddingPolicy;
    this.backpressureController = backpressureController;
    this.adaptiveEngine = adaptiveEngine;
    this.retryController = retryController;
  }

  public registerRetryController(controller: RetryController): void {
    this.retryController = controller;
  }

  public registerWorkerScaler(scaler: WorkerScaler): void {
    this.workerScaler = scaler;
  }

  public registerSimulator(simulator: EventSimulator): void {
    this.simulator = simulator;
  }

  public setCriticalInFlight(count: number): void {
    this.criticalInFlight = Math.max(0, count);
  }

  public addActivityLog(entry: ActivityLogEntry): void {
    this.recentActivityLogs.unshift(entry);
    if (this.recentActivityLogs.length > this.maxActivityLogs) {
      this.recentActivityLogs.pop();
    }
  }

  private formatTime(timestamp: number): string {
    const d = new Date(timestamp);
    const timeStr = d.toTimeString().split(' ')[0];
    const ms = String(timestamp % 1000).padStart(3, '0');
    return `${timeStr}.${ms}`;
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
      this.addActivityLog({
        id: event.id,
        type: event.type,
        priority: 'CRITICAL',
        strategy: 'STREAM',
        status: 'PROCESSED',
        reason: 'Protected single-event transaction path',
        timestamp: this.formatTime(now),
        timestampMs: now,
      });
    } else {
      if (event.priority === 'HIGH') {
        this.highProcessed++;
        this.addActivityLog({
          id: event.id,
          type: event.type,
          priority: 'HIGH',
          strategy: 'STREAM',
          status: 'PROCESSED',
          reason: 'High-priority business event stream',
          timestamp: this.formatTime(now),
          timestampMs: now,
        });
      } else {
        this.lowProcessed++;
        this.addActivityLog({
          id: event.id,
          type: event.type,
          priority: 'LOW',
          strategy: 'STREAM',
          status: 'PROCESSED',
          reason: 'Standard low-priority individual execution',
          timestamp: this.formatTime(now),
          timestampMs: now,
        });
      }
      this.nonCriticalLatencies.push(latencyMs);
      if (this.nonCriticalLatencies.length > this.maxLatencySamples) {
        this.nonCriticalLatencies.shift();
      }
    }
  }

  public recordLowAccepted(): void {
    this.lowAccepted++;
  }

  public recordBatchProcessed(events: PipelineEvent[], durationMs: number): void {
    if (events.length === 0) return;
    const now = Date.now();
    this.batchedCount += events.length;
    this.lowBatched += events.length;
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

    this.addActivityLog({
      id: events[0].id,
      type: events[0].type,
      priority: 'LOW',
      strategy: 'BATCH',
      status: 'PROCESSED',
      reason: `Micro-batched ${events.length} events (processed in ${durationMs}ms)`,
      timestamp: this.formatTime(now),
      timestampMs: now,
    });
  }

  public recordDeferred(reason = 'Queue pressure elevated: deferring non-critical execution to prioritize critical pipeline'): void {
    const now = Date.now();
    this.deferredCount++;
    this.lowDeferredCycles++;
    this.addActivityLog({
      id: `def_${Date.now().toString().slice(-6)}`,
      type: 'CLICK',
      priority: 'LOW',
      strategy: 'DEFER',
      status: 'DEFERRED',
      reason,
      timestamp: this.formatTime(now),
      timestampMs: now,
    });
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
    // Critical Lost = Received - (Processed + InQueue + InFlight)
    const criticalInQueue = this.queueManager.criticalQueue.size();
    const criticalAccountedFor = this.criticalProcessed + criticalInQueue + this.criticalInFlight;
    const calculatedCriticalLost = Math.max(0, this.criticalReceived - criticalAccountedFor);

    const lowQueuePressure = Number(this.queueManager.lowQueue.getPressure().toFixed(3));
    const highQueuePressure = Number(this.queueManager.highQueue.getPressure().toFixed(3));
    const criticalQueuePressure = Number(this.queueManager.criticalQueue.getPressure().toFixed(3));

    // Record batch size observation (when batch size changes, or on interval, max 50 observations)
    const lastObs = this.batchSizeHistory[this.batchSizeHistory.length - 1];
    const shouldRecordObs = !lastObs || 
      lastObs.batchSize !== evaluation.batchSize ||
      lastObs.strategy !== evaluation.strategy ||
      (now - lastObs.timestamp >= 1000);

    if (shouldRecordObs) {
      this.batchSizeHistory.push({
        timestamp: now,
        lowQueuePressure: Number((lowQueuePressure * 100).toFixed(1)),
        batchSize: evaluation.batchSize,
        systemPressureState: evaluation.state,
        strategy: evaluation.strategy,
      });
      if (this.batchSizeHistory.length > this.maxBatchObservations) {
        this.batchSizeHistory.shift();
      }
    }

    const criticalQueueSize = this.queueManager.criticalQueue.size();
    const criticalQueueCapacity = this.queueManager.criticalQueue.capacity;
    const highQueueSize = this.queueManager.highQueue.size();
    const highQueueCapacity = this.queueManager.highQueue.capacity;
    const lowQueueSize = this.queueManager.lowQueue.size();
    const lowQueueCapacity = this.queueManager.lowQueue.capacity;

    const queueTelemetry = {
      critical: {
        name: 'CRITICAL',
        size: criticalQueueSize,
        capacity: criticalQueueCapacity,
        pressure: criticalQueuePressure,
        pressurePercent: Number((criticalQueuePressure * 100).toFixed(1)),
        processedCount: this.criticalProcessed,
        queuedCount: criticalQueueSize,
        strategy: evaluation.criticalStrategy,
        status: 'PROTECTED' as const,
      },
      high: {
        name: 'HIGH',
        size: highQueueSize,
        capacity: highQueueCapacity,
        pressure: highQueuePressure,
        pressurePercent: Number((highQueuePressure * 100).toFixed(1)),
        processedCount: this.highProcessed,
        queuedCount: highQueueSize,
        strategy: evaluation.highStrategy,
        status: 'ACTIVE' as const,
      },
      low: {
        name: 'LOW',
        size: lowQueueSize,
        capacity: lowQueueCapacity,
        pressure: lowQueuePressure,
        pressurePercent: Number((lowQueuePressure * 100).toFixed(1)),
        processedCount: this.lowProcessed,
        queuedCount: lowQueueSize,
        strategy: evaluation.lowStrategy,
        status: 'ADAPTIVE' as const,
        accepted: this.lowAccepted,
        batched: this.lowBatched,
        deferredCycles: this.lowDeferredCycles,
        shed: this.sheddingPolicy.totalShedCount,
      },
    };

    const strategiesTelemetry = {
      critical: evaluation.criticalStrategy,
      high: evaluation.highStrategy,
      low: evaluation.lowStrategy,
    };

    const sheddingTelemetry = {
      total: this.sheddingPolicy.totalShedCount,
      click: this.sheddingPolicy.clickShedCount,
      log: this.sheddingPolicy.logShedCount,
      critical: this.criticalShed,
      lastShedEvent: this.sheddingPolicy.lastShedEvent,
      lastShedReason: this.sheddingPolicy.lastShedReason,
    };

    const batchingTelemetry = {
      currentBatchSize: evaluation.batchSize,
      batchSizeReason: evaluation.batchSizeReason,
      history: [...this.batchSizeHistory],
    };

    const adaptiveTelemetry = {
      systemState: evaluation.state,
      strategy: evaluation.strategy,
      criticalStrategy: evaluation.criticalStrategy,
      highStrategy: evaluation.highStrategy,
      lowStrategy: evaluation.lowStrategy,
      reason: evaluation.reason,
      queuePressure: Number((lowQueuePressure * 100).toFixed(1)),
      backlogGrowth: evaluation.backlogGrowthRate,
      workerLoad: evaluation.workerLoadPercent,
      sheddingStatus: evaluation.sheddingStatus,
    };

    return {
      timestamp: now,
      systemStatus: this.simulator?.getMode() !== 'STOPPED' ? 'RUNNING' : 'IDLE',
      simulatorMode: this.simulator?.getMode() || 'STOPPED',
      activeStrategy: evaluation.strategy,
      systemPressureState: evaluation.state,
      adaptiveReason: evaluation.reason,

      criticalStrategy: evaluation.criticalStrategy,
      highStrategy: evaluation.highStrategy,
      lowStrategy: evaluation.lowStrategy,

      incomingRatePerSec: incomingPerSec,
      incomingRatePerMin: incomingPerSec * 60,
      throughputPerSec: processedPerSec,
      throughputPerMin: processedPerSec * 60,

      criticalQueueSize,
      criticalQueueCapacity,
      criticalQueuePressure,

      highQueueSize,
      highQueueCapacity,
      highQueuePressure,

      lowQueueSize,
      lowQueueCapacity,
      lowQueuePressure,

      currentBatchSize: evaluation.batchSize,
      batchSizeReason: evaluation.batchSizeReason,
      workerLoadPercent: evaluation.workerLoadPercent,
      backlogGrowthRate: evaluation.backlogGrowthRate,
      batchSizeHistory: [...this.batchSizeHistory],

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
      criticalInFlight: this.criticalInFlight,

      highReceived: this.highReceived,
      highProcessed: this.highProcessed,

      lowReceived: this.lowReceived,
      lowProcessed: this.lowProcessed,
      lowAccepted: this.lowAccepted,
      lowBatched: this.lowBatched,
      lowDeferredCycles: this.lowDeferredCycles,
      lowShed: this.sheddingPolicy.totalShedCount,

      batchedCount: this.batchedCount,
      deferredCount: this.deferredCount,
      shedCount: this.sheddingPolicy.totalShedCount,
      clickShedCount: this.sheddingPolicy.clickShedCount,
      logShedCount: this.sheddingPolicy.logShedCount,
      lastShedEvent: this.sheddingPolicy.lastShedEvent,
      lastShedReason: this.sheddingPolicy.lastShedReason,
      safetyViolations: this.sheddingPolicy.totalSafetyViolations,

      backpressureActive: this.backpressureController.isActive(),

      queues: queueTelemetry,
      strategies: strategiesTelemetry,
      shedding: sheddingTelemetry,
      batching: batchingTelemetry,
      adaptive: adaptiveTelemetry,
      faultTolerance: this.retryController
        ? this.retryController.getTelemetry()
        : {
            retryAttempts: 0,
            retrySuccesses: 0,
            retryFailures: 0,
            permanentFailures: 0,
            duplicatesPrevented: 0,
            failureArmed: false,
            lastFailure: null,
            lastRetry: null,
            lastRecovery: null,
            recentRecoveries: [],
            recoveryEvents: [],
          },
      workerScaling: this.workerScaler
        ? this.workerScaler.getTelemetry()
        : {
            currentWorkers: 2,
            minWorkers: 2,
            maxWorkers: 8,
            workerUtilization: 0,
            queuePressure: 0,
            backlog: 0,
            scaleUpCount: 0,
            scaleDownCount: 0,
            lastScalingAction: null,
            lastScalingReason: 'System initialized at baseline concurrency.',
            scalingHistory: [],
            workers: [],
          },

      recentShedEvents: this.sheddingPolicy.getRecentLogs(),
      recentActivityLogs: [...this.recentActivityLogs],
    };
  }

  public reset(): void {
    this.totalReceived = 0;
    this.totalProcessed = 0;
    this.criticalReceived = 0;
    this.criticalProcessed = 0;
    this.criticalShed = 0;
    this.criticalInFlight = 0;
    this.highReceived = 0;
    this.highProcessed = 0;
    this.lowReceived = 0;
    this.lowProcessed = 0;
    this.lowAccepted = 0;
    this.lowBatched = 0;
    this.lowDeferredCycles = 0;
    this.batchedCount = 0;
    this.deferredCount = 0;
    this.incomingTimestamps = [];
    this.processedTimestamps = [];
    this.criticalLatencies = [];
    this.nonCriticalLatencies = [];
    this.recentActivityLogs = [];
    this.batchSizeHistory = [];
    this.sheddingPolicy.clear();
    this.queueManager.clearAll();
    if (this.retryController) {
      this.retryController.reset();
    }
    if (this.workerScaler) {
      this.workerScaler.reset();
    }
  }
}
