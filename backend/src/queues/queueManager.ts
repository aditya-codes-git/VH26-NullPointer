import { BoundedQueue } from './boundedQueue.js';
import { PipelineConfig } from '../config/pipelineConfig.js';

export class QueueManager {
  public readonly criticalQueue: BoundedQueue;
  public readonly highQueue: BoundedQueue;
  public readonly lowQueue: BoundedQueue;

  constructor(config: PipelineConfig) {
    this.criticalQueue = new BoundedQueue('CRITICAL_QUEUE', config.CRITICAL_QUEUE_CAPACITY);
    this.highQueue = new BoundedQueue('HIGH_QUEUE', config.HIGH_QUEUE_CAPACITY);
    this.lowQueue = new BoundedQueue('LOW_QUEUE', config.LOW_QUEUE_CAPACITY);
  }

  public getTotalQueued(): number {
    return this.criticalQueue.size() + this.highQueue.size() + this.lowQueue.size();
  }

  public clearAll(): void {
    this.criticalQueue.clear();
    this.highQueue.clear();
    this.lowQueue.clear();
  }
}
