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
  public totalSafetyViolations = 0;

  constructor(queueManager: QueueManager) {
    this.queueManager = queueManager;
  }

  /**
   * Drops non-critical items that exceed the target safe size.
   * CRITICAL INVARIANT: Critical events must NEVER be shed.
   * If a critical event is detected here due to an unexpected bug, we intercept it safely.
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

      // Fail-safe protection: if a critical event is somehow in the low queue, DO NOT SHED
      if (candidate.priority === 'CRITICAL') {
        safetyViolations++;
        this.totalSafetyViolations++;
        // Re-enqueue into the protected critical queue immediately!
        this.queueManager.criticalQueue.enqueue(candidate);
        continue;
      }

      candidate.status = 'SHED';
      candidate.dropReason = reason;
      candidate.strategy = 'SHED';

      const entry: ShedLogEntry = {
        id: nanoid(8),
        eventId: candidate.id,
        type: candidate.type,
        priority: candidate.priority,
        reason,
        timestamp: Date.now(),
      };

      shedCount++;
      this.totalShedCount++;
      entries.push(entry);

      this.recentShedLogs.unshift(entry);
      if (this.recentShedLogs.length > this.maxLogHistory) {
        this.recentShedLogs.pop();
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
    this.totalSafetyViolations = 0;
  }
}
