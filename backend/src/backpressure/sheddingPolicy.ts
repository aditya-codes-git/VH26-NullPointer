import { PipelineEvent, ShedLogEntry } from '../models/event.js';
import { QueueManager } from '../queues/queueManager.js';
import { nanoid } from 'nanoid';

export interface SheddingResult {
  shedCount: number;
  safetyViolations: number;
  entries: ShedLogEntry[];
}

export class SheddingPolicy {
  private queueManager: QueueManager;
  private recentShedLogs: ShedLogEntry[] = [];
  private readonly maxLogHistory = 100;
  public totalShedCount = 0;
  public clickShedCount = 0;
  public logShedCount = 0;
  public criticalShedCount = 0; // Invariant: must stay 0
  public lastShedEvent: ShedLogEntry | null = null;
  public lastShedReason = '';
  public totalSafetyViolations = 0;
  public onShed?: (event: PipelineEvent) => void;

  constructor(queueManager: QueueManager) {
    this.queueManager = queueManager;
  }

  /**
   * Directly sheds a single non-critical event (e.g. on queue admission rejection).
   * Invariant: Critical & High events must NEVER be admission-shed.
   */
  public shedSingleEvent(event: PipelineEvent, reason: string): ShedLogEntry | null {
    if (event.priority !== 'LOW') {
      this.totalSafetyViolations++;
      if (event.priority === 'CRITICAL') {
        this.queueManager.criticalQueue.enqueue(event);
      } else if (event.priority === 'HIGH') {
        this.queueManager.highQueue.enqueue(event);
      }
      return null;
    }

    event.status = 'SHED';
    event.dropReason = reason;
    event.strategy = 'SHED';

    if (this.onShed) {
      try {
        this.onShed(event);
      } catch {}
    }

    const entry: ShedLogEntry = {
      id: event.id,
      eventId: event.id,
      type: event.type,
      priority: event.priority,
      reason,
      timestamp: Date.now(),
    };

    this.totalShedCount++;
    if (event.type === 'CLICK') {
      this.clickShedCount++;
    } else if (event.type === 'LOG') {
      this.logShedCount++;
    }

    this.lastShedEvent = entry;
    this.lastShedReason = reason;

    this.recentShedLogs.unshift(entry);
    if (this.recentShedLogs.length > this.maxLogHistory) {
      this.recentShedLogs.pop();
    }

    return entry;
  }

  /**
   * Drops non-critical items that exceed the target safe size from the queue.
   * CRITICAL INVARIANT: Critical events must NEVER be shed.
   */
  public executeShedding(countToShed: number, reason: string): SheddingResult {
    let shedCount = 0;
    let safetyViolations = 0;
    const entries: ShedLogEntry[] = [];

    for (let i = 0; i < countToShed; i++) {
      if (this.queueManager.lowQueue.isEmpty()) {
        break;
      }

      const candidate = this.queueManager.lowQueue.dequeue();
      if (!candidate) break;

      const entry = this.shedSingleEvent(candidate, reason);
      if (entry) {
        shedCount++;
        entries.push(entry);
      } else {
        safetyViolations++;
      }
    }

    return { shedCount, safetyViolations, entries };
  }

  public getRecentLogs(): ShedLogEntry[] {
    return [...this.recentShedLogs];
  }

  public clear(): void {
    this.recentShedLogs = [];
    this.totalShedCount = 0;
    this.clickShedCount = 0;
    this.logShedCount = 0;
    this.criticalShedCount = 0;
    this.lastShedEvent = null;
    this.lastShedReason = '';
    this.totalSafetyViolations = 0;
  }
}

