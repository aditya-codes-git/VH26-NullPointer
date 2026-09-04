import { WorkerScalingAction, WorkerScalingTelemetry } from '../models/event.js';
import { PipelineConfig } from '../config/pipelineConfig.js';
import { WorkerPool } from '../processing/workerPool.js';
import { QueueManager } from '../queues/queueManager.js';
import { MetricsCollector } from '../metrics/metricsCollector.js';

export class WorkerScaler {
  private config: PipelineConfig;
  private workerPool: WorkerPool;
  private queueManager: QueueManager;
  private metricsCollector: MetricsCollector;
  private onScaleCallback?: () => void;

  private isRunning = false;
  private evaluationInterval: NodeJS.Timeout | null = null;

  // Cooldown timers
  private lastScaleUpTime = 0;
  private lastScaleDownTime = 0;

  // Sustained condition tracking (Hysteresis)
  private scaleUpConditionStart: number | null = null;
  private scaleDownConditionStart: number | null = null;

  // Counters
  public scaleUpCount = 0;
  public scaleDownCount = 0;
  public lastScalingAction: WorkerScalingAction | null = null;
  public lastScalingReason = 'System initialized at baseline concurrency.';

  // Bounded history (last 50 actions) - records ONLY actual worker count transitions
  private scalingHistory: WorkerScalingAction[] = [];
  private readonly maxHistory = 50;

  // Track previous queue depth to measure backlog growth rate
  private lastTotalQueueSize = 0;
  private lastQueueMeasureTime = Date.now();
  private smoothedBacklogGrowth = 0;

  constructor(
    config: PipelineConfig,
    workerPool: WorkerPool,
    queueManager: QueueManager,
    metricsCollector: MetricsCollector,
    onScaleCallback?: () => void
  ) {
    this.config = config;
    this.workerPool = workerPool;
    this.queueManager = queueManager;
    this.metricsCollector = metricsCollector;
    this.onScaleCallback = onScaleCallback;
  }

  public setScaleCallback(callback: () => void): void {
    this.onScaleCallback = callback;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTotalQueueSize = this.getTotalQueueSize();
    this.lastQueueMeasureTime = Date.now();

    // Evaluate every 500ms
    this.evaluationInterval = setInterval(() => {
      this.evaluate();
    }, 500);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
    }
  }

  public getTotalQueueSize(): number {
    return (
      this.queueManager.criticalQueue.size() +
      this.queueManager.highQueue.size() +
      this.queueManager.lowQueue.size()
    );
  }

  /**
   * Returns the maximum pressure across all three isolated queues (CRITICAL, HIGH, LOW).
   */
  public getMaxQueuePressure(): number {
    const crit = this.queueManager.criticalQueue.getPressure();
    const high = this.queueManager.highQueue.getPressure();
    const low = this.queueManager.lowQueue.getPressure();
    return Math.max(crit, high, low);
  }

  /**
   * Main evaluation loop.
   */
  public async evaluate(): Promise<void> {
    const now = Date.now();
    const currentWorkers = this.workerPool.getActiveWorkerCount();
    const minWorkers = this.config.MIN_WORKERS || 2;
    const maxWorkers = this.config.MAX_WORKERS || 8;

    // 1. Calculate Backlog Growth Rate (events/sec)
    const currentQueueSize = this.getTotalQueueSize();
    const elapsedSec = Math.max(0.1, (now - this.lastQueueMeasureTime) / 1000);
    const instantGrowth = (currentQueueSize - this.lastTotalQueueSize) / elapsedSec;
    this.smoothedBacklogGrowth = Number((0.7 * this.smoothedBacklogGrowth + 0.3 * instantGrowth).toFixed(1));
    this.lastTotalQueueSize = currentQueueSize;
    this.lastQueueMeasureTime = now;

    // 2. Obtain Real Worker Utilization from WorkerPool
    const workerUtilization = this.workerPool.getRealUtilization();

    // 3. Obtain Maximum Queue Pressure
    const maxPressure = Number(this.getMaxQueuePressure().toFixed(3));
    const pressurePercent = Number((maxPressure * 100).toFixed(1));

    // 4. Evaluate Scale-UP condition:
    // Sustained queue pressure >= 40% AND (backlog is growing OR worker utilization >= 75%)
    const isScaleUpConditionMet =
      maxPressure >= (this.config.SCALE_UP_PRESSURE_THRESHOLD ?? 0.40) &&
      (this.smoothedBacklogGrowth > 0 || workerUtilization >= (this.config.SCALE_UP_UTILIZATION_THRESHOLD * 100 || 75));

    if (isScaleUpConditionMet) {
      if (this.scaleUpConditionStart === null) {
        this.scaleUpConditionStart = now;
      }
    } else {
      this.scaleUpConditionStart = null;
    }

    // 5. Evaluate Scale-DOWN condition:
    // Sustained queue pressure < 15% AND backlog ~= 0 AND worker utilization < 35%
    const isScaleDownConditionMet =
      maxPressure < (this.config.SCALE_DOWN_PRESSURE_THRESHOLD ?? 0.15) &&
      currentQueueSize <= 10 &&
      workerUtilization < (this.config.SCALE_DOWN_UTILIZATION_THRESHOLD * 100 || 35);

    if (isScaleDownConditionMet) {
      if (this.scaleDownConditionStart === null) {
        this.scaleDownConditionStart = now;
      }
    } else {
      this.scaleDownConditionStart = null;
    }

    const sustainedWindowMs = this.config.SCALE_SUSTAINED_WINDOW_MS || 1500;
    const scaleUpCooldownMs = this.config.SCALE_UP_COOLDOWN_MS || 3000;
    const scaleDownCooldownMs = this.config.SCALE_DOWN_COOLDOWN_MS || 6000;

    // 6. Check Scale UP Execution
    if (
      currentWorkers < maxWorkers &&
      this.scaleUpConditionStart !== null &&
      now - this.scaleUpConditionStart >= sustainedWindowMs &&
      now - this.lastScaleUpTime >= scaleUpCooldownMs
    ) {
      // Calculate target increment (step by 2, or 1 if close to max)
      const targetWorkers = Math.min(maxWorkers, currentWorkers + 2);
      const reason = `Sustained high load: max queue pressure is ${pressurePercent}% (≥40%), worker utilization is ${workerUtilization}%, backlog is ${currentQueueSize} (${this.smoothedBacklogGrowth >= 0 ? '+' : ''}${this.smoothedBacklogGrowth}/s)`;

      await this.executeScale('UP', currentWorkers, targetWorkers, reason, maxPressure, currentQueueSize, workerUtilization);
      this.lastScaleUpTime = now;
      this.scaleUpConditionStart = null; // Reset sustained tracker
      return;
    }

    // 7. Check Scale DOWN Execution
    if (
      currentWorkers > minWorkers &&
      this.scaleDownConditionStart !== null &&
      now - this.scaleDownConditionStart >= (sustainedWindowMs * 2) && // 3s sustained for scale down
      now - this.lastScaleDownTime >= scaleDownCooldownMs
    ) {
      // Step down by 2 or to minWorkers
      const targetWorkers = Math.max(minWorkers, currentWorkers - 2);
      const reason = `Sustained nominal load: queue pressure is ${pressurePercent}% (<15%), worker utilization is ${workerUtilization}% (<35%), backlog is drained (${currentQueueSize})`;

      await this.executeScale('DOWN', currentWorkers, targetWorkers, reason, maxPressure, currentQueueSize, workerUtilization);
      this.lastScaleDownTime = now;
      this.scaleDownConditionStart = null; // Reset sustained tracker
      return;
    }
  }

  /**
   * Executes scaling on WorkerPool and records the actual transition in history.
   */
  private async executeScale(
    direction: 'UP' | 'DOWN',
    previousWorkers: number,
    targetWorkers: number,
    reason: string,
    queuePressure: number,
    backlog: number,
    workerUtilization: number
  ): Promise<void> {
    // 1. WorkerPool is the Single Source of Truth
    const actualWorkers = await this.workerPool.scaleTo(targetWorkers, reason);

    // If no change occurred, do NOT record a fake history entry
    if (actualWorkers === previousWorkers) return;

    if (direction === 'UP') {
      this.scaleUpCount++;
    } else {
      this.scaleDownCount++;
    }

    const now = Date.now();
    const d = new Date(now);
    const timeStr = `${d.toTimeString().split(' ')[0]}.${String(now % 1000).padStart(3, '0')}`;

    const action: WorkerScalingAction = {
      id: `scale_${now}_${Math.floor(Math.random() * 1000)}`,
      timestamp: timeStr,
      timestampMs: now,
      direction,
      previousWorkers,
      newWorkers: actualWorkers,
      reason,
      queuePressure: Number((queuePressure * 100).toFixed(1)),
      backlog,
      workerUtilization: Number(workerUtilization.toFixed(1)),
    };

    this.lastScalingAction = action;
    this.lastScalingReason = reason;

    this.scalingHistory.unshift(action);
    if (this.scalingHistory.length > this.maxHistory) {
      this.scalingHistory.pop();
    }

    // Trigger immediate Socket.IO telemetry broadcast
    if (this.onScaleCallback) {
      this.onScaleCallback();
    }
  }

  public getTelemetry(): WorkerScalingTelemetry {
    const currentWorkers = this.workerPool.getActiveWorkerCount();
    const minWorkers = this.config.MIN_WORKERS || 2;
    const maxWorkers = this.config.MAX_WORKERS || 8;
    const workerUtilization = this.workerPool.getRealUtilization();
    const maxPressure = Number((this.getMaxQueuePressure() * 100).toFixed(1));
    const backlog = this.getTotalQueueSize();

    return {
      currentWorkers,
      minWorkers,
      maxWorkers,
      workerUtilization,
      queuePressure: maxPressure,
      backlog,
      scaleUpCount: this.scaleUpCount,
      scaleDownCount: this.scaleDownCount,
      lastScalingAction: this.lastScalingAction,
      lastScalingReason: this.lastScalingReason,
      scalingHistory: [...this.scalingHistory],
      workers: this.workerPool.getWorkerStatuses(),
    };
  }

  public reset(): void {
    this.scaleUpCount = 0;
    this.scaleDownCount = 0;
    this.lastScalingAction = null;
    this.lastScalingReason = 'System reset to baseline concurrency.';
    this.scalingHistory = [];
    this.scaleUpConditionStart = null;
    this.scaleDownConditionStart = null;
    this.lastScaleUpTime = 0;
    this.lastScaleDownTime = 0;
    this.smoothedBacklogGrowth = 0;
  }
}
