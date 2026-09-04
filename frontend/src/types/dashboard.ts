export type SystemState = 'NORMAL' | 'PRESSURED' | 'OVERLOADED' | 'EXTREME' | 'RECOVERING';
export type ProcessingStrategy = 'STREAM' | 'BATCH' | 'DEFER' | 'SHED';
export type EventPriority = 'CRITICAL' | 'HIGH' | 'LOW';
export type EventType = 'ORDER' | 'PAYMENT' | 'INVENTORY' | 'CLICK' | 'LOG';

export interface TrafficMetrics {
  incomingTraffic: string; // e.g. "1,000 events/min"
  incomingEventsPerSec: number;
  workerThroughput: string; // e.g. "950 events/min"
  workerEventsPerSec: number;
  queuePressurePercent: number; // e.g. 12
}

export interface CriticalProtectionMetrics {
  received: number;
  processed: number;
  queued: number;
  lost: number;
  sheddingStatus: 'DISABLED' | 'ACTIVE';
  isProtected: boolean;
}

export interface PriorityLaneData {
  tier: string;
  name: string;
  description: string;
  processingMode: string;
  queueCount: number;
  capacity: number;
  pressurePercent: number;
  status: 'PROTECTED' | 'ADAPTIVE' | 'HIGH';
  statusColor: 'green' | 'blue' | 'purple';
}

export interface LatencyDataPoint {
  time: string;
  criticalLatency: number;
  nonCriticalLatency: number;
}

export interface PipelineDecisionEntry {
  id: string;
  time: string;
  type: EventType;
  priority: EventPriority;
  decision: ProcessingStrategy;
  status: string;
  reason: string;
}

export interface DashboardData {
  systemState: SystemState;
  processingMode: ProcessingStrategy;
  reason: string;
  traffic: TrafficMetrics;
  criticalProtection: CriticalProtectionMetrics;
  lanes: PriorityLaneData[];
  counters: {
    totalProcessed: number;
    criticalProcessed: number;
    nonCriticalProcessed: number;
    batchedCount: number;
    deferredCount: number;
    shedCount: number;
  };
  latencyHistory: LatencyDataPoint[];
  recentDecisions: PipelineDecisionEntry[];
}
