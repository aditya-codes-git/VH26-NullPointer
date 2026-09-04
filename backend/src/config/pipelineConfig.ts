export interface PipelineConfig {
  // Rates (events per minute)
  NORMAL_RATE_PER_MIN: number;
  SPIKE_RATE_PER_MIN: number;
  
  // Capacities
  CRITICAL_QUEUE_CAPACITY: number;
  HIGH_QUEUE_CAPACITY: number;
  LOW_QUEUE_CAPACITY: number;
  
  // Pressure Thresholds for Low Priority Queue (0.0 to 1.0)
  BATCH_PRESSURE_THRESHOLD: number; // e.g., 0.25 (25% capacity)
  DEFER_PRESSURE_THRESHOLD: number; // e.g., 0.55 (55% capacity)
  SHED_PRESSURE_THRESHOLD: number;  // e.g., 0.80 (80% capacity)
  
  // Backpressure on Ingestion (Critical Queue Pressure Threshold)
  CRITICAL_BACKPRESSURE_THRESHOLD: number; // 0.85
  
  // Micro-batching configuration
  BATCH_SIZE: number;
  BATCH_MAX_WAIT_MS: number;
  DYNAMIC_BATCH_TIERS: Array<{ minPressure: number; batchSize: number }>;
  
  // Simulated processing service time (ms)
  // Calibrated so 1 event takes ~7ms single-threaded (~140 events/sec capacity).
  // Under normal load (16.7/sec), capacity > input.
  // Under spike (333.3/sec), input >> capacity, reliably building queue backpressure!
  BASE_PROCESSING_DELAY_MS: number;
  BATCH_PROCESSING_DELAY_MS: number; // Amortized cost for batch of 25 (e.g., 15ms total -> ~0.6ms/event)
  
  // Worker concurrency
  WORKER_CONCURRENCY: number;
  
  // Fair scheduling ratio: under normal/moderate pressure, worker picks critical vs non-critical
  CRITICAL_WORKER_RATIO: number; // 0.80 (80% critical if available, 20% non-critical to avoid starvation)

  // Fault Tolerance & Retry Configuration
  MAX_RETRIES: number;
  RETRY_BACKOFF_BASE_MS: number;

  // Dynamic Worker Scaling Configuration
  MIN_WORKERS: number;
  MAX_WORKERS: number;
  SCALE_UP_PRESSURE_THRESHOLD: number;
  SCALE_UP_UTILIZATION_THRESHOLD: number;
  SCALE_DOWN_PRESSURE_THRESHOLD: number;
  SCALE_DOWN_UTILIZATION_THRESHOLD: number;
  SCALE_UP_COOLDOWN_MS: number;
  SCALE_DOWN_COOLDOWN_MS: number;
  SCALE_SUSTAINED_WINDOW_MS: number;
}

export const DEFAULT_CONFIG: PipelineConfig = {
  NORMAL_RATE_PER_MIN: 1000,
  SPIKE_RATE_PER_MIN: 20000,
  
  CRITICAL_QUEUE_CAPACITY: 2000,
  HIGH_QUEUE_CAPACITY: 2000,
  LOW_QUEUE_CAPACITY: 3000,
  
  BATCH_PRESSURE_THRESHOLD: 0.25, // At ~750 low queue items or rate deficit
  DEFER_PRESSURE_THRESHOLD: 0.55, // At ~1650 low queue items
  SHED_PRESSURE_THRESHOLD: 0.80,  // At ~2400 low queue items
  
  CRITICAL_BACKPRESSURE_THRESHOLD: 0.85,
  
  BATCH_SIZE: 25,
  BATCH_MAX_WAIT_MS: 150,
  DYNAMIC_BATCH_TIERS: [
    { minPressure: 0.95, batchSize: 250 },
    { minPressure: 0.85, batchSize: 200 },
    { minPressure: 0.70, batchSize: 100 },
    { minPressure: 0.50, batchSize: 50 },
    { minPressure: 0.30, batchSize: 25 },
    { minPressure: 0.0, batchSize: 10 },
  ],
  
  BASE_PROCESSING_DELAY_MS: 7, // 7ms per event -> ~140/sec max per worker
  BATCH_PROCESSING_DELAY_MS: 15, // 15ms for an entire batch of 25 events (~0.6ms/event!)
  
  WORKER_CONCURRENCY: 2, // Default 2 active worker loops (~280 events/sec max stream capacity)
  CRITICAL_WORKER_RATIO: 0.80,

  MAX_RETRIES: 3,
  RETRY_BACKOFF_BASE_MS: 100,

  // Dynamic Worker Scaling Configuration
  MIN_WORKERS: 2,
  MAX_WORKERS: 8,
  SCALE_UP_PRESSURE_THRESHOLD: 0.40,      // Sustained queue pressure >= 40%
  SCALE_UP_UTILIZATION_THRESHOLD: 0.75,   // Sustained worker utilization >= 75%
  SCALE_DOWN_PRESSURE_THRESHOLD: 0.15,    // Queue pressure < 15%
  SCALE_DOWN_UTILIZATION_THRESHOLD: 0.35, // Worker utilization < 35%
  SCALE_UP_COOLDOWN_MS: 3000,             // 3 seconds cooldown between scale ups
  SCALE_DOWN_COOLDOWN_MS: 6000,           // 6 seconds cooldown between scale downs
  SCALE_SUSTAINED_WINDOW_MS: 1500,        // 1.5 seconds sustained condition dwell time
};
