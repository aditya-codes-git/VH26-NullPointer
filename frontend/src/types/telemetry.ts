export type EventType = 'ORDER' | 'PAYMENT' | 'INVENTORY' | 'CLICK' | 'LOG';
export type EventPriority = 'CRITICAL' | 'HIGH' | 'LOW';
export type ProcessingStrategy = 'STREAM' | 'BATCH' | 'DEFER' | 'SHED';
export type SystemPressureState = 'NORMAL' | 'PRESSURED' | 'OVERLOADED' | 'EXTREME';

export interface ShedLogEntry {
  id: string;
  eventId: string;
  type: EventType;
  priority: EventPriority;
  reason: string;
  timestamp: number;
}

export interface ActivityLogEntry {
  id: string;
  type: EventType;
  priority: EventPriority;
  strategy: ProcessingStrategy;
  status: 'QUEUED' | 'PROCESSING' | 'PROCESSED' | 'DEFERRED' | 'SHED';
  reason: string;
  timestamp: string; // HH:mm:ss.SSS
  timestampMs: number;
}

export interface QueueTelemetry {
  name: string;
  size: number;
  capacity: number;
  pressure: number;
  pressurePercent: number;
  strategy: ProcessingStrategy;
  status: 'PROTECTED' | 'ACTIVE' | 'ADAPTIVE';
  processedCount: number;
  queuedCount: number;
}

export interface BatchSizeObservation {
  timestamp: number;
  lowQueuePressure: number;
  batchSize: number;
  systemPressureState: SystemPressureState;
  strategy: ProcessingStrategy;
}

export interface SheddingTelemetry {
  total: number;
  click: number;
  log: number;
  critical: number;
  lastShedEvent: ShedLogEntry | null;
  lastShedReason: string;
}

export interface BatchingTelemetry {
  currentBatchSize: number;
  batchSizeReason: string;
  history: BatchSizeObservation[];
}

export interface AdaptiveTelemetry {
  systemState: SystemPressureState;
  strategy: ProcessingStrategy;
  criticalStrategy: ProcessingStrategy;
  highStrategy: ProcessingStrategy;
  lowStrategy: ProcessingStrategy;
  reason: string;
  queuePressure: number;
  backlogGrowth: number;
  workerLoad: number;
  sheddingStatus: 'ENABLED' | 'DISABLED';
}

export interface TelemetrySnapshot {
  timestamp: number;
  systemStatus: 'IDLE' | 'RUNNING';
  simulatorMode: 'STOPPED' | 'NORMAL' | 'SPIKE' | 'CUSTOM';
  activeStrategy: ProcessingStrategy;
  systemPressureState: SystemPressureState;
  adaptiveReason: string;

  // Per-tier strategies
  criticalStrategy?: ProcessingStrategy;
  highStrategy?: ProcessingStrategy;
  lowStrategy?: ProcessingStrategy;

  // Rates
  incomingRatePerSec: number;
  incomingRatePerMin: number;
  throughputPerSec: number;
  throughputPerMin: number;

  // Queues
  criticalQueueSize: number;
  criticalQueueCapacity: number;
  criticalQueuePressure: number;

  highQueueSize: number;
  highQueueCapacity: number;
  highQueuePressure?: number;

  lowQueueSize: number;
  lowQueueCapacity: number;
  lowQueuePressure: number;

  // Adaptive Dynamics
  currentBatchSize?: number;
  batchSizeReason?: string;
  workerLoadPercent?: number;
  backlogGrowthRate?: number;
  batchSizeHistory?: BatchSizeObservation[];

  // Latency (ms)
  criticalLatencyP50: number;
  criticalLatencyP95: number;
  criticalLatencyAvg: number;

  nonCriticalLatencyP50: number;
  nonCriticalLatencyP95: number;
  nonCriticalLatencyAvg: number;

  // Counters
  totalReceived: number;
  totalProcessed: number;
  criticalReceived: number;
  criticalProcessed: number;
  criticalShed: number;
  criticalLost: number;
  criticalInFlight: number;

  highReceived: number;
  highProcessed: number;

  lowReceived: number;
  lowProcessed: number;

  batchedCount: number;
  deferredCount: number;
  shedCount: number;
  clickShedCount?: number;
  logShedCount?: number;
  lastShedEvent?: ShedLogEntry | null;
  lastShedReason?: string;
  safetyViolations: number;

  // Admission Backpressure
  backpressureActive: boolean;

  // Grouped Telemetry
  queues?: {
    critical: QueueTelemetry;
    high: QueueTelemetry;
    low: QueueTelemetry;
  };
  strategies?: {
    critical: ProcessingStrategy;
    high: ProcessingStrategy;
    low: ProcessingStrategy;
  };
  shedding?: SheddingTelemetry;
  batching?: BatchingTelemetry;
  adaptive?: AdaptiveTelemetry;

  // Logs
  recentShedEvents: ShedLogEntry[];
  recentActivityLogs: ActivityLogEntry[];
}

export interface BenchmarkMetrics {
  totalProcessed: number;
  criticalProcessed: number;
  nonCriticalProcessed: number;
  criticalLatencyAvg: number;
  criticalLatencyP95: number;
  nonCriticalLatencyAvg: number;
  nonCriticalLatencyP95: number;
  maxQueueDepth: number;
  criticalLost: number;
  durationMs: number;
  throughputPerSec: number;
}

export interface BenchmarkComparison {
  naive: BenchmarkMetrics;
  adaptive: BenchmarkMetrics;
}
