import { PipelineEvent, RecoveryAuditEntry, FaultToleranceTelemetry, RecoveryEventSummary } from '../models/event.js';
import { PipelineConfig } from '../config/pipelineConfig.js';
import { QueueManager } from '../queues/queueManager.js';

export interface BusinessSideEffect {
  eventId: string;
  type: string;
  executedAt: number;
  workerId: string;
  executionCount: number;
}

export class RetryController {
  private config: PipelineConfig;
  private queueManager: QueueManager;

  // Idempotency registry: tracks completed event IDs to prevent duplicate side effects
  private completedEventIds = new Set<string>();

  // Business side-effect ledger: records simulated business outcome per eventId
  private sideEffectLedger = new Map<string, BusinessSideEffect>();

  // Failure simulation arming
  private isFailureArmed = false;
  private armedTargetType?: string;
  private targetFailureCount = 1;
  private currentFailureCount = 0;
  private simulatedEventId?: string;

  // Metrics counters
  public retryAttempts = 0;
  public retrySuccesses = 0;
  public retryFailures = 0;
  public permanentFailures = 0;
  public duplicatesPrevented = 0;

  // Audit history
  private recentRecoveries: RecoveryAuditEntry[] = [];
  private readonly maxRecoveryLogs = 60;

  // Per-event recovery history tracking
  private eventLifecycleMap = new Map<string, RecoveryAuditEntry[]>();

  private lastFailure: RecoveryAuditEntry | null = null;
  private lastRetry: RecoveryAuditEntry | null = null;
  private lastRecovery: RecoveryAuditEntry | null = null;

  constructor(config: PipelineConfig, queueManager: QueueManager) {
    this.config = config;
    this.queueManager = queueManager;
  }

  /**
   * Arms a simulated worker failure for incoming events.
   * mode:
   *   'single' (default): Fails once on attempt 1, recovers on retry 1 (Attempt #2).
   *   'multi': Fails on attempt 1 and retry 1 (Attempt #2), then recovers on retry 2 (Attempt #3).
   *   'permanent': Fails repeatedly through max retries (3) -> PERMANENT_FAILURE.
   */
  public armFailure(
    targetType?: string,
    mode: 'single' | 'multi' | 'permanent' = 'single'
  ): void {
    this.isFailureArmed = true;
    this.armedTargetType = targetType;
    this.simulatedEventId = undefined;
    this.currentFailureCount = 0;

    if (mode === 'multi') {
      this.targetFailureCount = 2; // Fails on initial attempt + 1st retry
    } else if (mode === 'permanent') {
      this.targetFailureCount = (this.config.MAX_RETRIES || 3) + 1; // Exhausts all retries
    } else {
      this.targetFailureCount = 1;
    }
  }

  public isArmed(): boolean {
    return this.isFailureArmed;
  }

  /**
   * Checks if a simulated failure should trigger on this event.
   * Locks onto a single event if multi-failure simulation is armed.
   */
  public shouldSimulateFailure(event: PipelineEvent): boolean {
    if (!this.isFailureArmed) return false;

    // If locked to a specific event for multi-attempt failure, only fail that event
    if (this.simulatedEventId) {
      if (event.id === this.simulatedEventId) {
        if (this.currentFailureCount < this.targetFailureCount) {
          this.currentFailureCount++;
          if (this.currentFailureCount >= this.targetFailureCount) {
            this.isFailureArmed = false;
          }
          return true;
        }
      }
      return false;
    }

    // Match type if specified
    if (this.armedTargetType && event.type !== this.armedTargetType) {
      return false;
    }

    // Lock onto this event ID
    this.simulatedEventId = event.id;
    this.currentFailureCount = 1;
    if (this.targetFailureCount <= 1) {
      this.isFailureArmed = false;
    }
    return true;
  }

  /**
   * Checks if an event has already successfully completed its business side effect.
   */
  public isCompleted(eventId: string): boolean {
    return this.completedEventIds.has(eventId);
  }

  /**
   * Applies the simulated business side effect idempotently.
   * Returns true if newly executed, false if duplicate was prevented.
   */
  public applySideEffect(event: PipelineEvent, workerId: string): boolean {
    if (this.completedEventIds.has(event.id)) {
      this.duplicatesPrevented++;
      const existing = this.sideEffectLedger.get(event.id);
      if (existing) {
        existing.executionCount++;
      }
      return false;
    }

    const now = Date.now();
    this.completedEventIds.add(event.id);
    this.sideEffectLedger.set(event.id, {
      eventId: event.id,
      type: event.type,
      executedAt: now,
      workerId,
      executionCount: 1,
    });
    return true;
  }

  public getSideEffect(eventId: string): BusinessSideEffect | undefined {
    return this.sideEffectLedger.get(eventId);
  }

  /**
   * Handles a worker failure for an individual event.
   * Manages per-event retry attempts, exponential backoff, and requeueing.
   * Returns true if scheduled for retry, false if permanent failure.
   */
  public handleFailedEvent(
    event: PipelineEvent,
    workerId: string,
    error: Error | string
  ): boolean {
    const errorMsg = typeof error === 'string' ? error : error.message || 'Worker processing failure';
    event.retryCount = (event.retryCount || 0) + 1;
    event.lastFailureReason = errorMsg;
    this.retryFailures++;

    const currentAttempt = event.retryCount; // Initial failure = Attempt #1
    const nextRetryNumber = event.retryCount; // Retry #1
    const nextAttemptNumber = currentAttempt + 1; // Execution on retry will be Attempt #2

    const now = Date.now();
    const timeStr = this.formatTime(now);

    // 1. Log the FAILED stage
    const failEntry: RecoveryAuditEntry = {
      id: `fail_${now.toString().slice(-6)}_${Math.floor(Math.random() * 1000)}`,
      eventId: event.id,
      type: event.type,
      priority: event.priority,
      workerId,
      attempt: currentAttempt,
      retryNumber: currentAttempt > 1 ? currentAttempt - 1 : undefined,
      status: 'FAILED',
      failureReason: errorMsg,
      timestamp: timeStr,
      timestampMs: now,
    };

    this.lastFailure = failEntry;
    this.addRecoveryLog(failEntry);

    const maxRetries = this.config.MAX_RETRIES || 3;

    if (event.retryCount > maxRetries) {
      // Reached maximum retry limit -> Permanent failure
      event.status = 'PERMANENT_FAILURE';
      event.dropReason = `Exceeded max retry limit (${maxRetries}): ${errorMsg}`;
      this.permanentFailures++;

      const permEntry: RecoveryAuditEntry = {
        id: `perm_${now.toString().slice(-6)}_${Math.floor(Math.random() * 1000)}`,
        eventId: event.id,
        type: event.type,
        priority: event.priority,
        workerId,
        attempt: currentAttempt,
        status: 'PERMANENT_FAILURE',
        failureReason: `Max retries (${maxRetries}) exhausted: ${errorMsg}`,
        timestamp: this.formatTime(Date.now()),
        timestampMs: Date.now(),
      };
      this.addRecoveryLog(permEntry);
      return false;
    }

    // 2. Log the ISOLATED stage (Targeted isolation: only failed item queued for retry, never whole batch)
    const isolateEntry: RecoveryAuditEntry = {
      id: `iso_${now.toString().slice(-6)}_${Math.floor(Math.random() * 1000)}`,
      eventId: event.id,
      type: event.type,
      priority: event.priority,
      workerId,
      attempt: currentAttempt,
      retryNumber: nextRetryNumber,
      status: 'ISOLATED',
      failureReason: 'Isolated single failed event from worker stream for targeted retry',
      timestamp: this.formatTime(Date.now()),
      timestampMs: Date.now(),
    };
    this.addRecoveryLog(isolateEntry);

    // 3. Prepare for targeted retry with exponential backoff -> RETRYING
    this.retryAttempts++;
    event.status = 'RETRYING';

    const backoffMs = this.getBackoffDelay(event.retryCount);

    const retryEntry: RecoveryAuditEntry = {
      id: `retry_${now.toString().slice(-6)}_${Math.floor(Math.random() * 1000)}`,
      eventId: event.id,
      type: event.type,
      priority: event.priority,
      workerId,
      attempt: nextAttemptNumber,
      retryNumber: nextRetryNumber,
      status: 'RETRYING',
      failureReason: `Scheduling Retry #${nextRetryNumber} (Attempt #${nextAttemptNumber}) after ${backoffMs}ms backoff`,
      timestamp: this.formatTime(Date.now()),
      timestampMs: Date.now(),
    };
    this.lastRetry = retryEntry;
    this.addRecoveryLog(retryEntry);

    setTimeout(() => {
      // Targeted re-enqueue to the event's priority queue with its ORIGINAL event ID
      this.requeueForRetry(event);
    }, backoffMs);

    return true;
  }

  /**
   * Re-enqueues only the failed event back to its dedicated priority queue.
   */
  private requeueForRetry(event: PipelineEvent): void {
    event.status = 'QUEUED';
    event.queuedAt = Date.now();

    switch (event.priority) {
      case 'CRITICAL':
        this.queueManager.criticalQueue.enqueue(event);
        break;
      case 'HIGH':
        this.queueManager.highQueue.enqueue(event);
        break;
      case 'LOW':
        this.queueManager.lowQueue.enqueue(event);
        break;
    }
  }

  /**
   * Records a successful recovery completion of a retried event.
   */
  public recordRecoverySuccess(event: PipelineEvent, workerId: string): void {
    if ((event.retryCount || 0) > 0) {
      this.retrySuccesses++;
      this.retryFailures = Math.max(0, this.retryFailures - 1);
      const attemptNumber = (event.retryCount || 0) + 1; // Executed on retry = Attempt #2
      const retryNumber = event.retryCount || 1; // Retry #1
      const now = Date.now();
      const successEntry: RecoveryAuditEntry = {
        id: `succ_${now.toString().slice(-6)}_${Math.floor(Math.random() * 1000)}`,
        eventId: event.id,
        type: event.type,
        priority: event.priority,
        workerId,
        attempt: attemptNumber,
        retryNumber: retryNumber,
        status: 'SUCCESS',
        failureReason: `Recovered on Retry #${retryNumber} (Attempt #${attemptNumber}) — Idempotency check passed`,
        timestamp: this.formatTime(now),
        timestampMs: now,
      };
      this.lastRecovery = successEntry;
      this.addRecoveryLog(successEntry);
    }
  }

  public getBackoffDelay(attempt: number): number {
    const base = this.config.RETRY_BACKOFF_BASE_MS || 100;
    // Exponential backoff: 100ms, 200ms, 400ms...
    return base * Math.pow(2, Math.max(0, attempt - 1));
  }

  private addRecoveryLog(entry: RecoveryAuditEntry): void {
    this.recentRecoveries.unshift(entry);
    if (this.recentRecoveries.length > this.maxRecoveryLogs) {
      this.recentRecoveries.pop();
    }

    // Maintain per-event lifecycle list
    const existing = this.eventLifecycleMap.get(entry.eventId) || [];
    existing.push(entry);
    this.eventLifecycleMap.set(entry.eventId, existing);
  }

  private formatTime(timestamp: number): string {
    const d = new Date(timestamp);
    const timeStr = d.toTimeString().split(' ')[0];
    const ms = String(timestamp % 1000).padStart(3, '0');
    return `${timeStr}.${ms}`;
  }

  public getRecoveryEvents(): RecoveryEventSummary[] {
    const events: RecoveryEventSummary[] = [];

    for (const [eventId, lifecycle] of this.eventLifecycleMap.entries()) {
      if (lifecycle.length === 0) continue;
      const latest = lifecycle[lifecycle.length - 1];
      const initial = lifecycle[0];

      let outcome: 'RECOVERED' | 'PERMANENT_FAILURE' | 'RECOVERING' | 'FAILED' = 'FAILED';
      if (lifecycle.some((e) => e.status === 'SUCCESS')) {
        outcome = 'RECOVERED';
      } else if (lifecycle.some((e) => e.status === 'PERMANENT_FAILURE')) {
        outcome = 'PERMANENT_FAILURE';
      } else if (latest.status === 'RETRYING' || latest.status === 'ISOLATED') {
        outcome = 'RECOVERING';
      }

      const retriesCount = lifecycle.filter((e) => e.status === 'RETRYING').length;
      const maxAttempt = Math.max(...lifecycle.map((e) => e.attempt));

      events.push({
        eventId,
        type: initial.type,
        priority: initial.priority,
        lastWorkerId: latest.workerId,
        totalAttempts: maxAttempt,
        retriesCount,
        outcome,
        lastStatus: latest.status,
        lastUpdated: latest.timestamp,
        lastUpdatedMs: latest.timestampMs,
        lifecycle: [...lifecycle],
      });
    }

    // Sort newest updated first
    return events.sort((a, b) => b.lastUpdatedMs - a.lastUpdatedMs);
  }

  public getTelemetry(): FaultToleranceTelemetry {
    return {
      retryAttempts: this.retryAttempts,
      retrySuccesses: this.retrySuccesses,
      retryFailures: this.retryFailures,
      permanentFailures: this.permanentFailures,
      duplicatesPrevented: this.duplicatesPrevented,
      failureArmed: this.isFailureArmed,
      lastFailure: this.lastFailure,
      lastRetry: this.lastRetry,
      lastRecovery: this.lastRecovery,
      recentRecoveries: [...this.recentRecoveries],
      recoveryEvents: this.getRecoveryEvents(),
    };
  }

  public reset(): void {
    this.completedEventIds.clear();
    this.sideEffectLedger.clear();
    this.eventLifecycleMap.clear();
    this.isFailureArmed = false;
    this.targetFailureCount = 1;
    this.currentFailureCount = 0;
    this.simulatedEventId = undefined;
    this.retryAttempts = 0;
    this.retrySuccesses = 0;
    this.retryFailures = 0;
    this.permanentFailures = 0;
    this.duplicatesPrevented = 0;
    this.recentRecoveries = [];
    this.lastFailure = null;
    this.lastRetry = null;
    this.lastRecovery = null;
  }
}
