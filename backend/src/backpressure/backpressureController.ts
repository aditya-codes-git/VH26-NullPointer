import { QueueManager } from '../queues/queueManager.js';
import { PipelineConfig } from '../config/pipelineConfig.js';
import { EventSimulator } from '../simulator/eventSimulator.js';

export class BackpressureController {
  private config: PipelineConfig;
  private queueManager: QueueManager;
  private simulator: EventSimulator | null = null;
  private isBackpressureActive = false;

  constructor(config: PipelineConfig, queueManager: QueueManager) {
    this.config = config;
    this.queueManager = queueManager;
  }

  public registerSimulator(simulator: EventSimulator): void {
    this.simulator = simulator;
  }

  public checkAndApply(): boolean {
    const criticalPressure = this.queueManager.criticalQueue.getPressure();

    // If critical queue exceeds safe threshold (e.g. 85% capacity),
    // propagate backpressure to slow or pause ingestion admission
    if (criticalPressure >= this.config.CRITICAL_BACKPRESSURE_THRESHOLD) {
      if (!this.isBackpressureActive) {
        this.isBackpressureActive = true;
        if (this.simulator) {
          this.simulator.setBackpressurePause(true);
        }
      }
    } else if (criticalPressure < this.config.CRITICAL_BACKPRESSURE_THRESHOLD * 0.7) {
      // Hysteresis: resume admission once critical pressure drops below 60%
      if (this.isBackpressureActive) {
        this.isBackpressureActive = false;
        if (this.simulator) {
          this.simulator.setBackpressurePause(false);
        }
      }
    }

    return this.isBackpressureActive;
  }

  public isActive(): boolean {
    return this.isBackpressureActive;
  }
}
