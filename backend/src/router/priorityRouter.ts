import { PipelineEvent } from '../models/event.js';
import { QueueManager } from '../queues/queueManager.js';
import { SheddingPolicy } from '../backpressure/sheddingPolicy.js';
import { MetricsCollector } from '../metrics/metricsCollector.js';

export interface RouteResult {
  success: boolean;
  queueName: string;
  dropped: boolean;
  reason?: string;
}

export class PriorityRouter {
  private queueManager: QueueManager;
  private sheddingPolicy?: SheddingPolicy;
  private metricsCollector?: MetricsCollector;

  constructor(
    queueManager: QueueManager,
    sheddingPolicy?: SheddingPolicy,
    metricsCollector?: MetricsCollector
  ) {
    this.queueManager = queueManager;
    this.sheddingPolicy = sheddingPolicy;
    this.metricsCollector = metricsCollector;
  }

  public setSheddingPolicy(sheddingPolicy: SheddingPolicy): void {
    this.sheddingPolicy = sheddingPolicy;
  }

  public setMetricsCollector(metricsCollector: MetricsCollector): void {
    this.metricsCollector = metricsCollector;
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
          // LOW queue capacity (3,000) reached: Admission Shedding
          // Invariant: If event.priority !== 'LOW', NEVER admission-shed
          if (event.priority === 'LOW' && this.sheddingPolicy) {
            const entry = this.sheddingPolicy.shedSingleEvent(
              event,
              'Low-priority queue capacity saturated: excess event shed at admission'
            );
            if (entry && this.metricsCollector) {
              const now = entry.timestamp;
              const d = new Date(now);
              const timeStr = `${d.toTimeString().split(' ')[0]}.${String(now % 1000).padStart(3, '0')}`;
              this.metricsCollector.addActivityLog({
                id: entry.id,
                type: entry.type,
                priority: entry.priority,
                strategy: 'SHED',
                status: 'SHED',
                reason: entry.reason,
                timestamp: timeStr,
                timestampMs: now,
              });
            }
          }
          return {
            success: false,
            queueName: 'LOW_QUEUE',
            dropped: true,
            reason: 'LOW_QUEUE_CAPACITY_EXCEEDED',
          };
        }
        if (this.metricsCollector) {
          this.metricsCollector.recordLowAccepted();
        }
        return { success: true, queueName: 'LOW_QUEUE', dropped: false };
      }
    }
  }
}
