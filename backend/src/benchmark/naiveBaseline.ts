import { PipelineEvent, EventType } from '../models/event.js';
import { classifyEvent } from '../classifier/eventClassifier.js';
import { nanoid } from 'nanoid';

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

/**
 * Runs an empirical discrete-event queue simulation comparing:
 * 1. Naive Baseline: Single FIFO queue, uniform 6ms processing per event.
 * 2. Adaptive Pipeline: Priority isolation, micro-batching under load, non-critical shedding under capacity exhaustion.
 */
export async function runBenchmarkComparison(
  eventCount = 2000,
  spikeArrivalIntervalMs = 3 // ~333 events/sec (20,000/min)
): Promise<BenchmarkComparison> {
  // Generate identical workload
  const events: { id: string; type: EventType; priority: 'CRITICAL' | 'HIGH' | 'LOW'; arrivalTime: number }[] = [];
  
  for (let i = 0; i < eventCount; i++) {
    const roll = Math.random();
    let type: EventType;
    if (roll < 0.10) type = 'PAYMENT';
    else if (roll < 0.20) type = 'ORDER';
    else if (roll < 0.40) type = 'INVENTORY';
    else if (roll < 0.75) type = 'CLICK';
    else type = 'LOG';

    events.push({
      id: nanoid(8),
      type,
      priority: classifyEvent(type),
      arrivalTime: i * spikeArrivalIntervalMs, // Discrete event arrival timeline
    });
  }

  // ==========================================
  // RUN 1: NAIVE BASELINE (Single FIFO Queue)
  // ==========================================
  // Single queue buffer with max capacity 400
  // Service time: 6ms per event
  const naiveCapacity = 400;
  const naiveQueue: { priority: 'CRITICAL' | 'HIGH' | 'LOW'; arrivalTime: number }[] = [];
  const naiveCriticalLatencies: number[] = [];
  const naiveNonCriticalLatencies: number[] = [];
  let naiveMaxQueue = 0;
  let naiveCriticalLost = 0;
  let naiveWorkerFreeTime = 0;

  for (const ev of events) {
    // Check if worker freed up before this event arrived
    // In discrete-event simulation, process queue items up to ev.arrivalTime
    while (naiveQueue.length > 0 && naiveWorkerFreeTime <= ev.arrivalTime) {
      const item = naiveQueue.shift()!;
      const startTime = Math.max(item.arrivalTime, naiveWorkerFreeTime);
      naiveWorkerFreeTime = startTime + 6; // 6ms service time
      const latency = naiveWorkerFreeTime - item.arrivalTime;
      if (item.priority === 'CRITICAL') {
        naiveCriticalLatencies.push(latency);
      } else {
        naiveNonCriticalLatencies.push(latency);
      }
    }

    if (naiveQueue.length >= naiveCapacity) {
      // Buffer full: Naive system silently drops incoming event!
      if (ev.priority === 'CRITICAL') {
        naiveCriticalLost++;
      }
      continue;
    }

    naiveQueue.push(ev);
    naiveMaxQueue = Math.max(naiveMaxQueue, naiveQueue.length);
  }

  // Drain remaining naive queue
  while (naiveQueue.length > 0) {
    const item = naiveQueue.shift()!;
    const startTime = Math.max(item.arrivalTime, naiveWorkerFreeTime);
    naiveWorkerFreeTime = startTime + 6;
    const latency = naiveWorkerFreeTime - item.arrivalTime;
    if (item.priority === 'CRITICAL') {
      naiveCriticalLatencies.push(latency);
    } else {
      naiveNonCriticalLatencies.push(latency);
    }
  }

  const naiveCritSorted = [...naiveCriticalLatencies].sort((a, b) => a - b);
  const naiveNonCritSorted = [...naiveNonCriticalLatencies].sort((a, b) => a - b);

  const naiveResult: BenchmarkMetrics = {
    totalProcessed: naiveCriticalLatencies.length + naiveNonCriticalLatencies.length,
    criticalProcessed: naiveCriticalLatencies.length,
    nonCriticalProcessed: naiveNonCriticalLatencies.length,
    criticalLatencyAvg: Math.round(
      naiveCriticalLatencies.reduce((a, b) => a + b, 0) / (naiveCriticalLatencies.length || 1)
    ),
    criticalLatencyP95: Math.round(
      naiveCritSorted[Math.floor(naiveCritSorted.length * 0.95)] || 0
    ),
    nonCriticalLatencyAvg: Math.round(
      naiveNonCriticalLatencies.reduce((a, b) => a + b, 0) / (naiveNonCriticalLatencies.length || 1)
    ),
    nonCriticalLatencyP95: Math.round(
      naiveNonCritSorted[Math.floor(naiveNonCritSorted.length * 0.95)] || 0
    ),
    maxQueueDepth: naiveMaxQueue,
    criticalLost: naiveCriticalLost,
    durationMs: Math.round(naiveWorkerFreeTime),
    throughputPerSec: Math.round(
      (naiveCriticalLatencies.length + naiveNonCriticalLatencies.length) /
        (Math.max(1, naiveWorkerFreeTime) / 1000)
    ),
  };

  // ==========================================
  // RUN 2: ADAPTIVE PIPELINE
  // ==========================================
  // Critical queue: individual stream (6ms service time), prioritized first!
  // Low queue: micro-batches under pressure (25 events in 15ms -> 0.6ms/event!)
  // Shedding: drops only non-critical events when low queue > 400
  const adaptCriticalQueue: { priority: 'CRITICAL'; arrivalTime: number }[] = [];
  const adaptLowQueue: { priority: 'HIGH' | 'LOW'; arrivalTime: number }[] = [];
  const adaptCriticalLatencies: number[] = [];
  const adaptNonCriticalLatencies: number[] = [];
  let adaptWorkerFreeTime = 0;
  let adaptMaxQueue = 0;

  for (const ev of events) {
    // Worker processes events while free time <= ev.arrivalTime
    while ((adaptCriticalQueue.length > 0 || adaptLowQueue.length > 0) && adaptWorkerFreeTime <= ev.arrivalTime) {
      if (adaptCriticalQueue.length > 0) {
        const item = adaptCriticalQueue.shift()!;
        const startTime = Math.max(item.arrivalTime, adaptWorkerFreeTime);
        adaptWorkerFreeTime = startTime + 6; // 6ms dedicated critical stream
        adaptCriticalLatencies.push(adaptWorkerFreeTime - item.arrivalTime);
      } else if (adaptLowQueue.length > 0) {
        // Micro-batch non-critical events
        const batch = adaptLowQueue.splice(0, 25);
        const startTime = Math.max(batch[0].arrivalTime, adaptWorkerFreeTime);
        adaptWorkerFreeTime = startTime + 15; // 15ms amortized for batch of 25
        for (const item of batch) {
          adaptNonCriticalLatencies.push(adaptWorkerFreeTime - item.arrivalTime);
        }
      }
    }

    if (ev.priority === 'CRITICAL') {
      adaptCriticalQueue.push(ev as any);
    } else {
      if (adaptLowQueue.length >= 400) {
        // Controlled non-critical shedding
        continue;
      }
      adaptLowQueue.push(ev as any);
    }

    adaptMaxQueue = Math.max(adaptMaxQueue, adaptCriticalQueue.length + adaptLowQueue.length);
  }

  // Drain remaining adaptive queues
  while (adaptCriticalQueue.length > 0 || adaptLowQueue.length > 0) {
    if (adaptCriticalQueue.length > 0) {
      const item = adaptCriticalQueue.shift()!;
      const startTime = Math.max(item.arrivalTime, adaptWorkerFreeTime);
      adaptWorkerFreeTime = startTime + 6;
      adaptCriticalLatencies.push(adaptWorkerFreeTime - item.arrivalTime);
    } else if (adaptLowQueue.length > 0) {
      const batch = adaptLowQueue.splice(0, 25);
      const startTime = Math.max(batch[0].arrivalTime, adaptWorkerFreeTime);
      adaptWorkerFreeTime = startTime + 15;
      for (const item of batch) {
        adaptNonCriticalLatencies.push(adaptWorkerFreeTime - item.arrivalTime);
      }
    }
  }

  const adaptCritSorted = [...adaptCriticalLatencies].sort((a, b) => a - b);
  const adaptNonCritSorted = [...adaptNonCriticalLatencies].sort((a, b) => a - b);

  const adaptiveResult: BenchmarkMetrics = {
    totalProcessed: adaptCriticalLatencies.length + adaptNonCriticalLatencies.length,
    criticalProcessed: adaptCriticalLatencies.length,
    nonCriticalProcessed: adaptNonCriticalLatencies.length,
    criticalLatencyAvg: Math.round(
      adaptCriticalLatencies.reduce((a, b) => a + b, 0) / (adaptCriticalLatencies.length || 1)
    ),
    criticalLatencyP95: Math.round(
      adaptCritSorted[Math.floor(adaptCritSorted.length * 0.95)] || 0
    ),
    nonCriticalLatencyAvg: Math.round(
      adaptNonCriticalLatencies.reduce((a, b) => a + b, 0) / (adaptNonCriticalLatencies.length || 1)
    ),
    nonCriticalLatencyP95: Math.round(
      adaptNonCritSorted[Math.floor(adaptNonCritSorted.length * 0.95)] || 0
    ),
    maxQueueDepth: adaptMaxQueue,
    criticalLost: 0, // Invariant: Zero critical events lost
    durationMs: Math.round(adaptWorkerFreeTime),
    throughputPerSec: Math.round(
      (adaptCriticalLatencies.length + adaptNonCriticalLatencies.length) /
        (Math.max(1, adaptWorkerFreeTime) / 1000)
    ),
  };

  return {
    naive: naiveResult,
    adaptive: adaptiveResult,
  };
}
