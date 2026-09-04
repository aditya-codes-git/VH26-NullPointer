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

export interface TelemetrySnapshot {
  timestamp: number;
  systemStatus: 'IDLE' | 'RUNNING';
  simulatorMode: 'STOPPED' | 'NORMAL' | 'SPIKE';
  activeStrategy: ProcessingStrategy;
  systemPressureState: SystemPressureState;
  adaptiveReason: string;

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

  lowQueueSize: number;
  lowQueueCapacity: number;
  lowQueuePressure: number;

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
  safetyViolations: number;

  // Admission Backpressure
  backpressureActive: boolean;

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
