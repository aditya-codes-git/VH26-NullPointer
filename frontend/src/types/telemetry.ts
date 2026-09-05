export type EventType = 'ORDER' | 'PAYMENT' | 'INVENTORY' | 'CLICK' | 'LOG';
export type EventPriority = 'CRITICAL' | 'HIGH' | 'LOW';
export type ProcessingStrategy = 'STREAM' | 'BATCH' | 'DEFER' | 'SHED' | 'DEFER + SHED';
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
  status: 'PROCESSED' | 'SHED' | 'DEFERRED';
  reason?: string;
  timestamp: string; // HH:mm:ss.SSS
  timestampMs?: number;
}

export interface RecoveryAuditEntry {
  id: string;
  eventId: string;
  type: EventType;
  priority: EventPriority;
  workerId: string;
  attempt: number;
  retryNumber?: number;
  status: 'FAILED' | 'ISOLATED' | 'RETRYING' | 'SUCCESS' | 'PERMANENT_FAILURE';
  failureReason: string;
  timestamp: string; // HH:mm:ss.SSS
  timestampMs: number;
}

export interface RecoveryEventSummary {
  eventId: string;
  type: EventType;
  priority: EventPriority;
  lastWorkerId: string;
  totalAttempts: number;
  retriesCount: number;
  outcome: 'RECOVERED' | 'PERMANENT_FAILURE' | 'RECOVERING' | 'FAILED';
  lastStatus: 'FAILED' | 'ISOLATED' | 'RETRYING' | 'SUCCESS' | 'PERMANENT_FAILURE';
  lastUpdated: string;
  lastUpdatedMs: number;
  lifecycle: RecoveryAuditEntry[];
}

export interface WorkerScalingAction {
  id: string;
  timestamp: string; // HH:mm:ss.SSS
  timestampMs: number;
  direction: 'UP' | 'DOWN';
  previousWorkers: number;
  newWorkers: number;
  reason: string;
  queuePressure: number;
  backlog: number;
  workerUtilization: number;
}

export interface WorkerInstanceStatus {
  id: string;
  status: 'ACTIVE' | 'BUSY' | 'RETIRING';
  processedCount: number;
  currentJob?: string;
  activeDurationMs: number;
}

export interface WorkerScalingTelemetry {
  currentWorkers: number;
  minWorkers: number;
  maxWorkers: number;
  workerUtilization: number;
  queuePressure: number;
  backlog: number;
  scaleUpCount: number;
  scaleDownCount: number;
  lastScalingAction: WorkerScalingAction | null;
  lastScalingReason: string;
  scalingHistory: WorkerScalingAction[];
  workers: WorkerInstanceStatus[];
}

export interface FaultToleranceTelemetry {
  retryAttempts: number;
  retrySuccesses: number;
  retryFailures: number;
  permanentFailures: number;
  duplicatesPrevented: number;
  failureArmed: boolean;
  lastFailure: RecoveryAuditEntry | null;
  lastRetry: RecoveryAuditEntry | null;
  lastRecovery: RecoveryAuditEntry | null;
  recentRecoveries: RecoveryAuditEntry[];
  recoveryEvents: RecoveryEventSummary[];
}

export interface DuplicateLogEntry {
  id: string;
  eventId: string;
  type: EventType;
  priority: EventPriority;
  timestamp: string; // HH:mm:ss.SSS
  timestampMs: number;
  reason: string;
  originalEventTimestamp?: number;
}

export interface DuplicateDetectionTelemetry {
  duplicatesDetected: number;
  duplicatesPrevented: number;
  activeRegistryEntries: number;
  maxRegistryCapacity: number;
  windowTtlSeconds: number;
  recentDuplicates: DuplicateLogEntry[];
}

export interface QueueTelemetry {
  name?: string;
  size: number;
  capacity: number;
  pressure: number;
  pressurePercent: number;
  strategy: ProcessingStrategy;
  status: 'PROTECTED' | 'ACTIVE' | 'ADAPTIVE';
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
  lowAccepted?: number;
  lowBatched?: number;
  lowDeferredCycles?: number;
  lowShed?: number;

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
  faultTolerance?: FaultToleranceTelemetry;
  workerScaling?: WorkerScalingTelemetry;
  duplicateDetection?: DuplicateDetectionTelemetry;

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
