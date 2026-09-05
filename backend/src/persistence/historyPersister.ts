import { SupabaseClient } from '@supabase/supabase-js';
import { createScopedClient, getSupabaseClient } from '../supabase/supabaseClient.js';
import {
  PipelineEvent,
  RecoveryAuditEntry,
  WorkerScalingAction,
  DuplicateLogEntry,
  DecisionSnapshotEntry,
  WorkloadScenario,
} from '../models/event.js';

export interface ActiveRunContext {
  runId: string;
  userId: string;
  userToken: string;
  scenario: WorkloadScenario;
  startTime: number;
}

export interface PersistenceTelemetry {
  isConfigured: boolean;
  dbStatus: 'CONNECTED' | 'DEGRADED' | 'OFFLINE';
  activeRunId: string | null;
  activeUserId: string | null;
  bufferedEventsCount: number;
  totalEventsPersisted: number;
  totalPersistErrors: number;
  lastPersistedAt: number | null;
  lastError: string | null;
}

export class HistoryPersister {
  private activeRun: ActiveRunContext | null = null;
  private flushTimer: NodeJS.Timeout | null = null;

  // In-memory non-blocking buffer queues
  private eventBuffer: any[] = [];
  private retryBuffer: any[] = [];
  private duplicateBuffer: any[] = [];
  private scalingBuffer: any[] = [];
  private decisionBuffer: any[] = [];

  // Buffer for events processed before an active run is fully initialized in Supabase
  private pendingPreRunEvents: Array<{ event: PipelineEvent; latencyMs?: number; workerId?: string }> = [];
  // Set to prevent duplicate event inserts within the same active run
  private seenEventIds: Set<string> = new Set();

  // Max buffer capacity before oldest entries are discarded to prevent memory leaks if DB is down
  private readonly MAX_BUFFER_SIZE = 5000;
  private readonly BATCH_SIZE = 100;
  private readonly FLUSH_INTERVAL_MS = 1000;

  // Diagnostics
  private totalEventsPersisted = 0;
  private totalPersistErrors = 0;
  private lastPersistedAt: number | null = null;
  private lastError: string | null = null;
  private dbStatus: 'CONNECTED' | 'DEGRADED' | 'OFFLINE' = 'CONNECTED';

  constructor() {
    this.startFlushLoop();
  }

  public getActiveRun(): ActiveRunContext | null {
    return this.activeRun;
  }

  public getTelemetry(): PersistenceTelemetry {
    return {
      isConfigured: Boolean(getSupabaseClient()),
      dbStatus: this.dbStatus,
      activeRunId: this.activeRun?.runId || null,
      activeUserId: this.activeRun?.userId || null,
      bufferedEventsCount:
        this.eventBuffer.length +
        this.retryBuffer.length +
        this.duplicateBuffer.length +
        this.scalingBuffer.length +
        this.decisionBuffer.length,
      totalEventsPersisted: this.totalEventsPersisted,
      totalPersistErrors: this.totalPersistErrors,
      lastPersistedAt: this.lastPersistedAt,
      lastError: this.lastError,
    };
  }

  /**
   * Start a new tracked workload run for the authenticated user
   */
  public async startRun(
    userId: string,
    userToken: string,
    scenario: WorkloadScenario,
    configuredDistribution: any
  ): Promise<string | null> {
    const scopedClient = createScopedClient(userToken) || getSupabaseClient();
    if (!scopedClient) {
      console.warn('[HistoryPersister] Supabase not configured. Running without persistent database storage.');
      return null;
    }

    try {
      const { data, error } = await scopedClient
        .from('workload_runs')
        .insert({
          user_id: userId,
          scenario,
          configured_distribution: configuredDistribution,
          actual_distribution: {},
          start_time: new Date().toISOString(),
          status: 'RUNNING',
        })
        .select('id')
        .single();

      if (error || !data) {
        console.error('[HistoryPersister] Failed to create run in Supabase:', error?.message);
        this.recordDbError(error?.message || 'Failed to insert workload_runs');
        return null;
      }

      const runId = data.id;
      this.activeRun = {
        runId,
        userId,
        userToken,
        scenario,
        startTime: Date.now(),
      };
      this.seenEventIds.clear();
      this.dbStatus = 'CONNECTED';
      console.log(`[HistoryPersister] Active run created in Supabase: runId=${runId} user=${userId}`);

      // Transfer any events that occurred while run was initiating
      if (this.pendingPreRunEvents.length > 0) {
        const pending = [...this.pendingPreRunEvents];
        this.pendingPreRunEvents = [];
        for (const p of pending) {
          this.recordEvent(p.event, p.latencyMs, p.workerId);
        }
      }

      return runId;
    } catch (err: any) {
      this.recordDbError(err?.message || 'Exception during startRun');
      return null;
    }
  }

  /**
   * Finalize the active run summary in Supabase
   */
  public async stopRun(summary: {
    actualDistribution?: any;
    totalEvents: number;
    processed: number;
    queued: number;
    shed: number;
    retries: number;
    duplicates: number;
    peakPressure: number;
    maximumWorkers: number;
    avgLatency: number;
  }): Promise<void> {
    if (!this.activeRun) return;

    const { runId, userToken } = this.activeRun;
    const scopedClient = createScopedClient(userToken) || getSupabaseClient();

    // Drain all remaining in-flight buffers before finalizing run
    for (let i = 0; i < 10; i++) {
      const remaining =
        this.eventBuffer.length +
        this.retryBuffer.length +
        this.duplicateBuffer.length +
        this.scalingBuffer.length +
        this.decisionBuffer.length;
      if (remaining === 0) break;
      await this.flushBuffers();
      const after =
        this.eventBuffer.length +
        this.retryBuffer.length +
        this.duplicateBuffer.length +
        this.scalingBuffer.length +
        this.decisionBuffer.length;
      if (after >= remaining) break; // Break if no progress due to DB outage
    }

    if (scopedClient) {
      try {
        const { error } = await scopedClient
          .from('workload_runs')
          .update({
            end_time: new Date().toISOString(),
            actual_distribution: summary.actualDistribution || {},
            total_events: summary.totalEvents,
            processed: summary.processed,
            queued: summary.queued,
            shed: summary.shed,
            retries: summary.retries,
            duplicates: summary.duplicates,
            peak_pressure: summary.peakPressure,
            maximum_workers: summary.maximumWorkers,
            avg_latency: summary.avgLatency,
            status: 'COMPLETED',
          })
          .eq('id', runId);

        if (error) {
          console.error('[HistoryPersister] Failed to update final run summary:', error.message);
          this.recordDbError(error.message);
        } else {
          console.log(`[HistoryPersister] Finalized run in Supabase: runId=${runId}`);
        }
      } catch (err: any) {
        this.recordDbError(err?.message || 'Exception during stopRun');
      }
    }

    this.seenEventIds.clear();
    this.activeRun = null;
  }

  // ==========================================================
  // Non-blocking Event Record Buffering
  // ==========================================================

  public recordEvent(event: PipelineEvent, latencyMs?: number, workerId?: string): void {
    if (!this.activeRun) {
      // Buffer recent events so they are not lost if run is about to start
      if (this.pendingPreRunEvents.length >= 1000) {
        this.pendingPreRunEvents.shift();
      }
      this.pendingPreRunEvents.push({ event, latencyMs, workerId });
      return;
    }

    // Deduplication check for this run
    if (this.seenEventIds.has(event.id)) {
      return;
    }
    this.seenEventIds.add(event.id);

    if (this.eventBuffer.length >= this.MAX_BUFFER_SIZE) {
      this.eventBuffer.shift(); // LRU drop to prevent memory overflow
    }

    this.eventBuffer.push({
      run_id: this.activeRun.runId,
      user_id: this.activeRun.userId,
      event_id: event.id,
      event_type: event.type,
      priority: event.priority,
      strategy: event.strategy || 'STREAM',
      status: event.status,
      audit_reason: event.dropReason || event.lastFailureReason || null,
      worker_id: workerId || null,
      processing_latency: latencyMs ?? null,
      retry_count: event.retryCount || 0,
      timestamp: new Date(event.createdAt || Date.now()).toISOString(),
    });
  }

  public recordRetry(entry: RecoveryAuditEntry, backoffMs?: number): void {
    if (!this.activeRun) return;
    if (this.retryBuffer.length >= this.MAX_BUFFER_SIZE) {
      this.retryBuffer.shift();
    }

    this.retryBuffer.push({
      run_id: this.activeRun.runId,
      user_id: this.activeRun.userId,
      event_id: entry.eventId,
      attempt: entry.attempt,
      status: entry.status,
      worker_id: entry.workerId,
      backoff: backoffMs ?? null,
      failure_reason: entry.failureReason,
      timestamp: new Date(entry.timestampMs || Date.now()).toISOString(),
    });
  }

  public recordDuplicate(entry: DuplicateLogEntry): void {
    if (!this.activeRun) return;
    if (this.duplicateBuffer.length >= this.MAX_BUFFER_SIZE) {
      this.duplicateBuffer.shift();
    }

    this.duplicateBuffer.push({
      run_id: this.activeRun.runId,
      user_id: this.activeRun.userId,
      event_id: entry.eventId,
      original_event_reference: entry.originalEventTimestamp ? String(entry.originalEventTimestamp) : null,
      reason: entry.reason,
      timestamp: new Date(entry.timestampMs || Date.now()).toISOString(),
    });
  }

  public recordScaling(action: WorkerScalingAction): void {
    if (!this.activeRun) return;
    if (this.scalingBuffer.length >= this.MAX_BUFFER_SIZE) {
      this.scalingBuffer.shift();
    }

    this.scalingBuffer.push({
      run_id: this.activeRun.runId,
      user_id: this.activeRun.userId,
      timestamp: new Date(action.timestampMs || Date.now()).toISOString(),
      action: action.direction,
      previous_worker_count: action.previousWorkers,
      new_worker_count: action.newWorkers,
      queue_pressure: action.queuePressure,
      utilization: action.workerUtilization,
      backlog: action.backlog,
      decision_reason: action.reason,
    });
  }

  public recordDecision(entry: DecisionSnapshotEntry): void {
    if (!this.activeRun) return;
    if (this.decisionBuffer.length >= this.MAX_BUFFER_SIZE) {
      this.decisionBuffer.shift();
    }

    this.decisionBuffer.push({
      run_id: this.activeRun.runId,
      user_id: this.activeRun.userId,
      timestamp: new Date(entry.timestampMs || Date.now()).toISOString(),
      queue_pressure: entry.queuePressurePercent,
      worker_utilization: entry.workerUtilizationPercent,
      latency: entry.latencyMs,
      data_size: entry.dataSizeBytes,
      cost_pressure: entry.costPressurePercent,
      priority: entry.priority,
      score: entry.score,
      strategy: entry.decision,
      explanation: entry.explanation,
    });
  }

  // ==========================================================
  // Periodic Async Batch Flushing
  // ==========================================================

  private startFlushLoop(): void {
    this.flushTimer = setInterval(() => {
      this.flushBuffers().catch(() => {});
    }, this.FLUSH_INTERVAL_MS);
  }

  public async flushBuffers(): Promise<void> {
    if (!this.activeRun) return;

    const scopedClient = createScopedClient(this.activeRun.userToken) || getSupabaseClient();
    if (!scopedClient) return;

    // 1. Drain batches of event logs (drain up to 5 batches per flush cycle)
    let eventBatchesFlushed = 0;
    while (this.eventBuffer.length > 0 && eventBatchesFlushed < 5) {
      const batch = this.eventBuffer.splice(0, this.BATCH_SIZE);
      eventBatchesFlushed++;
      try {
        const { error } = await scopedClient
          .from('event_logs')
          .upsert(batch, { onConflict: 'run_id,event_id', ignoreDuplicates: true });
        if (error) {
          this.recordDbError(error.message);
          // Restore batch if space permits
          if (this.eventBuffer.length + batch.length <= this.MAX_BUFFER_SIZE) {
            this.eventBuffer.unshift(...batch);
          }
          break;
        } else {
          this.totalEventsPersisted += batch.length;
          this.lastPersistedAt = Date.now();
          this.dbStatus = 'CONNECTED';
        }
      } catch (err: any) {
        this.recordDbError(err?.message || 'Error inserting event_logs batch');
        if (this.eventBuffer.length + batch.length <= this.MAX_BUFFER_SIZE) {
          this.eventBuffer.unshift(...batch);
        }
        break;
      }
    }

    // 2. Drain retry logs
    if (this.retryBuffer.length > 0) {
      const batch = this.retryBuffer.splice(0, this.BATCH_SIZE);
      try {
        const { error } = await scopedClient.from('retry_logs').insert(batch);
        if (error) {
          this.recordDbError(error.message);
          if (this.retryBuffer.length + batch.length <= this.MAX_BUFFER_SIZE) {
            this.retryBuffer.unshift(...batch);
          }
        }
      } catch (err: any) {
        this.recordDbError(err?.message || 'Error inserting retry_logs');
      }
    }

    // 3. Drain duplicate logs
    if (this.duplicateBuffer.length > 0) {
      const batch = this.duplicateBuffer.splice(0, this.BATCH_SIZE);
      try {
        const { error } = await scopedClient.from('duplicate_logs').insert(batch);
        if (error) {
          this.recordDbError(error.message);
          if (this.duplicateBuffer.length + batch.length <= this.MAX_BUFFER_SIZE) {
            this.duplicateBuffer.unshift(...batch);
          }
        }
      } catch (err: any) {
        this.recordDbError(err?.message || 'Error inserting duplicate_logs');
      }
    }

    // 4. Drain scaling events
    if (this.scalingBuffer.length > 0) {
      const batch = this.scalingBuffer.splice(0, this.BATCH_SIZE);
      try {
        const { error } = await scopedClient.from('scaling_events').insert(batch);
        if (error) {
          this.recordDbError(error.message);
          if (this.scalingBuffer.length + batch.length <= this.MAX_BUFFER_SIZE) {
            this.scalingBuffer.unshift(...batch);
          }
        }
      } catch (err: any) {
        this.recordDbError(err?.message || 'Error inserting scaling_events');
      }
    }

    // 5. Drain decision logs
    if (this.decisionBuffer.length > 0) {
      const batch = this.decisionBuffer.splice(0, this.BATCH_SIZE);
      try {
        const { error } = await scopedClient.from('decision_logs').insert(batch);
        if (error) {
          this.recordDbError(error.message);
          if (this.decisionBuffer.length + batch.length <= this.MAX_BUFFER_SIZE) {
            this.decisionBuffer.unshift(...batch);
          }
        }
      } catch (err: any) {
        this.recordDbError(err?.message || 'Error inserting decision_logs');
      }
    }
  }

  private recordDbError(msg: string): void {
    this.totalPersistErrors++;
    this.lastError = msg;
    this.dbStatus = this.totalPersistErrors > 5 ? 'OFFLINE' : 'DEGRADED';
    console.warn(`[HistoryPersister Warning] Database write degraded: ${msg}`);
  }

  public destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
