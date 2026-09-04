import { PipelineEvent } from '../models/event.js';
import { PipelineConfig } from '../config/pipelineConfig.js';

export interface BatchProcessingResult {
  processedCount: number;
  events: PipelineEvent[];
  durationMs: number;
}

export class BatchProcessor {
  private config: PipelineConfig;

  constructor(config: PipelineConfig) {
    this.config = config;
  }

  /**
   * Processes a micro-batch of events together.
   * Amortizes execution overhead so processing 25 items takes ~15ms total instead of 25 * 7ms = 175ms.
   */
  public async processBatch(batch: PipelineEvent[]): Promise<BatchProcessingResult> {
    const startTime = Date.now();
    
    // Simulate batch processing delay (e.g. 15ms total)
    await new Promise((resolve) => setTimeout(resolve, this.config.BATCH_PROCESSING_DELAY_MS));

    const now = Date.now();
    for (const event of batch) {
      event.processedAt = now;
      event.status = 'PROCESSED';
      event.strategy = 'BATCH';
    }

    return {
      processedCount: batch.length,
      events: batch,
      durationMs: Date.now() - startTime,
    };
  }
}
