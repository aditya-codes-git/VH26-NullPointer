import { PipelineEvent } from '../models/event.js';
import { QueueManager } from '../queues/queueManager.js';

export interface RouteResult {
  success: boolean;
  queueName: string;
  dropped: boolean;
  reason?: string;
}

export class PriorityRouter {
  private queueManager: QueueManager;

  constructor(queueManager: QueueManager) {
    this.queueManager = queueManager;
  }

  public route(event: PipelineEvent): RouteResult {
    switch (event.priority) {
      case 'CRITICAL': {
        const enqueued = this.queueManager.criticalQueue.enqueue(event);
        if (!enqueued) {
          // Critical queue is at full capacity. We return dropped: false but trigger admission backpressure
          return {
            success: false,
            queueName: 'CRITICAL_QUEUE',
            dropped: false,
            reason: 'CRITICAL_QUEUE_SATURATED',
          };
        }
        return { success: true, queueName: 'CRITICAL_QUEUE', dropped: false };
      }

      case 'HIGH': {
        const enqueued = this.queueManager.highQueue.enqueue(event);
        if (!enqueued) {
          return {
            success: false,
            queueName: 'HIGH_QUEUE',
            dropped: true,
            reason: 'HIGH_QUEUE_CAPACITY_EXCEEDED',
          };
        }
        return { success: true, queueName: 'HIGH_QUEUE', dropped: false };
      }

      case 'LOW':
      default: {
        const enqueued = this.queueManager.lowQueue.enqueue(event);
        if (!enqueued) {
          return {
            success: false,
            queueName: 'LOW_QUEUE',
            dropped: true,
            reason: 'LOW_QUEUE_CAPACITY_EXCEEDED',
          };
        }
        return { success: true, queueName: 'LOW_QUEUE', dropped: false };
      }
    }
  }
}
