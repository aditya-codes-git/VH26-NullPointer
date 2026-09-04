import { PipelineEvent } from '../models/event.js';
import { PipelineConfig } from '../config/pipelineConfig.js';
import { RetryController } from '../resilience/retryController.js';

export interface BatchProcessingResult {
  processedCount: number;
  events: PipelineEvent[];
  durationMs: number;
  failedEvents: PipelineEvent[];
}

export class BatchProcessor {
  private config: PipelineConfig;
  private retryController?: RetryController;

  constructor(config: PipelineConfig, retryController?: RetryController) {
    this.config = config;
    this.retryController = retryController;
  }

  public registerRetryController(controller: RetryController): void {
    this.retryController = controller;
  }

  /**
   * Processes a micro-batch of events together.
   * Amortizes execution overhead while isolating individual event failures:
   * If an event fails (e.g. simulated failure), ONLY that event is isolated for targeted retry.
   * Surviving events in the batch are successfully processed.
   */
  public async processBatch(batch: PipelineEvent[], workerId = 'worker-batch'): Promise<BatchProcessingResult> {
    const startTime = Date.now();
    
    // Simulate batch processing delay (e.g. 15ms total)
    await new Promise((resolve) => setTimeout(resolve, this.config.BATCH_PROCESSING_DELAY_MS));

    const now = Date.now();
    const successfulEvents: PipelineEvent[] = [];
    const failedEvents: PipelineEvent[] = [];

    for (const event of batch) {
      // Check if this individual event fails in worker processing
      if (this.retryController && this.retryController.shouldSimulateFailure(event)) {
        // Individual event failure isolated!
        failedEvents.push(event);
        this.retryController.handleFailedEvent(event, workerId, 'Simulated worker crash during batch processing');
        continue;
      }

      // Idempotent business side effect simulation
      if (this.retryController) {
        this.retryController.applySideEffect(event, workerId);
        if ((event.retryCount || 0) > 0) {
          this.retryController.recordRecoverySuccess(event, workerId);
        }
      }

      event.processedAt = now;
      event.status = 'PROCESSED';
      event.strategy = 'BATCH';
      successfulEvents.push(event);
    }

    return {
      processedCount: successfulEvents.length,
      events: successfulEvents,
      durationMs: Date.now() - startTime,
      failedEvents,
    };
  }
}

