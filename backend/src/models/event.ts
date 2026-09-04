export type EventType = 'ORDER' | 'PAYMENT' | 'INVENTORY' | 'CLICK' | 'LOG';

export type EventPriority = 'CRITICAL' | 'HIGH' | 'LOW';

export type ProcessingStrategy = 'STREAM' | 'BATCH' | 'DEFER' | 'SHED' | 'DEFER + SHED';

export type EventStatus = 'QUEUED' | 'PROCESSING' | 'PROCESSED' | 'DEFERRED' | 'SHED';

export interface PipelineEvent {
  id: string;
  type: EventType;
  priority: EventPriority;
  payload: Record<string, any>;
  createdAt: number;
  queuedAt: number;
  processedAt?: number;
  strategy?: ProcessingStrategy;
  status: EventStatus;
  dropReason?: string;
}

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
  status: EventStatus;
  reason: string;
  timestamp: string; // HH:mm:ss.SSS
  timestampMs: number;
}

export interface QueueTelemetry {
  name?: string;
  size: number;
  capacity: number;
  pressure: number;
  pressurePercent: number;
  strategy: ProcessingStrategy;
  status: string;
  processedCount: number;
  queuedCount: number;
  accepted?: number;
  batched?: number;
  deferredCycles?: number;
  shed?: number;
}

export interface BatchSizeObservation {
  timestamp: number;
  lowQueuePressure: number;
  batchSize: number;
  systemPressureState: 'NORMAL' | 'PRESSURED' | 'OVERLOADED' | 'EXTREME';
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
  systemState: 'NORMAL' | 'PRESSURED' | 'OVERLOADED' | 'EXTREME';
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
  systemPressureState: 'NORMAL' | 'PRESSURED' | 'OVERLOADED' | 'EXTREME';
  adaptiveReason: string;

  // Per-tier strategies
  criticalStrategy: ProcessingStrategy;
  highStrategy: ProcessingStrategy;
  lowStrategy: ProcessingStrategy;

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
  highQueuePressure: number;

  lowQueueSize: number;
  lowQueueCapacity: number;
  lowQueuePressure: number;

  // Adaptive Dynamics
  currentBatchSize: number;
  batchSizeReason: string;
  workerLoadPercent: number;
  backlogGrowthRate: number;
  batchSizeHistory: BatchSizeObservation[];

  // Latency (ms)
  criticalLatencyP50: number;
  criticalLatencyP95: number;
  criticalLatencyAvg: number;

  nonCriticalLatencyP50: number;
  nonCriticalLatencyP95: number;
  nonCriticalLatencyAvg: number;

  // Counters & Event Accounting
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
  lowAccepted: number;
  lowBatched: number;
  lowDeferredCycles: number;
  lowShed: number;

  batchedCount: number;
  deferredCount: number;
  shedCount: number;
  clickShedCount: number;
  logShedCount: number;
  lastShedEvent: ShedLogEntry | null;
  lastShedReason: string;
  safetyViolations: number;

  // Admission Backpressure
  backpressureActive: boolean;

  // Grouped Telemetry for Explainability
  queues: {
    critical: QueueTelemetry;
    high: QueueTelemetry;
    low: QueueTelemetry;
  };
  strategies: {
    critical: ProcessingStrategy;
    high: ProcessingStrategy;
    low: ProcessingStrategy;
  };
  shedding: SheddingTelemetry;
  batching: BatchingTelemetry;
  adaptive: AdaptiveTelemetry;

  // Logs
  recentShedEvents: ShedLogEntry[];
  recentActivityLogs: ActivityLogEntry[];
}

