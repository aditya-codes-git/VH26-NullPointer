export type EventType = 'ORDER' | 'PAYMENT' | 'INVENTORY' | 'CLICK' | 'LOG';

export type EventPriority = 'CRITICAL' | 'HIGH' | 'LOW';

export type ProcessingStrategy = 'STREAM' | 'BATCH' | 'DEFER' | 'SHED';

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

export interface TelemetrySnapshot {
  timestamp: number;
  systemStatus: 'IDLE' | 'RUNNING';
  simulatorMode: 'STOPPED' | 'NORMAL' | 'SPIKE';
  activeStrategy: ProcessingStrategy;
  systemPressureState: 'NORMAL' | 'PRESSURED' | 'OVERLOADED' | 'EXTREME';
  
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
  criticalLost: number; // Calculated mathematically!
  
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
  
  // Recent Shed Log
  recentShedEvents: ShedLogEntry[];
}
