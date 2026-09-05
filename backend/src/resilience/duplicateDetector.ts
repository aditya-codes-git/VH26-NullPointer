import { EventType, EventPriority, DuplicateLogEntry, DuplicateDetectionTelemetry } from '../models/event.js';

interface RegistryEntry {
  registeredAt: number;
  type: EventType;
  priority: EventPriority;
}

export interface CheckAndRegisterResult {
  isDuplicate: boolean;
  reason?: string;
  entry?: DuplicateLogEntry;
}

export class DuplicateDetector {
  // In-memory bounded LRU + TTL cache: Map preserves insertion order for LRU eviction
  private registry = new Map<string, RegistryEntry>();

  private readonly ttlMs: number;
  private readonly maxCapacity: number;

  public duplicatesDetected = 0;
  public duplicatesPrevented = 0;

  // Bounded ring buffer for recent duplicate log entries (max 50)
  private recentDuplicates: DuplicateLogEntry[] = [];
  private readonly maxRecentLogs = 50;
  public onDuplicate?: (entry: DuplicateLogEntry) => void;

  constructor(ttlSeconds = 60, maxCapacity = 10000) {
    this.ttlMs = ttlSeconds * 1000;
    this.maxCapacity = maxCapacity;
  }

  /**
   * Atomic check-and-register operation for external event admission.
   * If the event ID has already been admitted within the active TTL window:
   *   -> returns { isDuplicate: true } and increments prevention metrics.
   * Otherwise:
   *   -> registers the event ID in the registry and returns { isDuplicate: false }.
   */
  public checkAndRegister(
    eventId: string,
    type: EventType,
    priority: EventPriority
  ): CheckAndRegisterResult {
    const now = Date.now();

    // 1. Check if ID already exists in registry
    const existing = this.registry.get(eventId);
    if (existing) {
      // Check if entry has expired past TTL
      if (now - existing.registeredAt < this.ttlMs) {
        // Unexpired -> Legitimate external duplicate detected!
        this.duplicatesDetected++;
        this.duplicatesPrevented++;

        const d = new Date(now);
        const timeStr = `${d.toTimeString().split(' ')[0]}.${String(now % 1000).padStart(3, '0')}`;

        const logEntry: DuplicateLogEntry = {
          id: `dup_${now.toString().slice(-6)}_${Math.floor(Math.random() * 1000)}`,
          eventId,
          type,
          priority,
          timestamp: timeStr,
          timestampMs: now,
          reason: `Event ID '${eventId}' already admitted within ${Math.round(this.ttlMs / 1000)}s deduplication window`,
          originalEventTimestamp: existing.registeredAt,
        };

        this.recentDuplicates.unshift(logEntry);
        if (this.recentDuplicates.length > this.maxRecentLogs) {
          this.recentDuplicates.pop();
        }

        if (this.onDuplicate) {
          this.onDuplicate(logEntry);
        }

        return {
          isDuplicate: true,
          reason: logEntry.reason,
          entry: logEntry,
        };
      } else {
        // Expired -> Delete from map so it re-registers freshly
        this.registry.delete(eventId);
      }
    }

    // 2. Bound LRU capacity: If registry reached maximum entries, evict oldest
    if (this.registry.size >= this.maxCapacity) {
      const oldestKey = this.registry.keys().next().value;
      if (oldestKey) {
        this.registry.delete(oldestKey);
      }
    }

    // 3. Atomically register new event ID
    this.registry.set(eventId, {
      registeredAt: now,
      type,
      priority,
    });

    return { isDuplicate: false };
  }

  /**
   * Periodic or on-demand cleanup of expired entries.
   */
  public cleanupExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.registry.entries()) {
      if (now - entry.registeredAt >= this.ttlMs) {
        this.registry.delete(id);
      } else {
        // Since entries are ordered by insertion, once we hit an unexpired entry,
        // subsequent entries are newer (unless updated out of order).
        break;
      }
    }
  }

  public getTelemetry(): DuplicateDetectionTelemetry {
    // Evict expired entries before snapshot
    this.cleanupExpired();

    return {
      duplicatesDetected: this.duplicatesDetected,
      duplicatesPrevented: this.duplicatesPrevented,
      activeRegistryEntries: this.registry.size,
      maxRegistryCapacity: this.maxCapacity,
      windowTtlSeconds: Math.round(this.ttlMs / 1000),
      recentDuplicates: [...this.recentDuplicates],
    };
  }

  public reset(): void {
    this.registry.clear();
    this.duplicatesDetected = 0;
    this.duplicatesPrevented = 0;
    this.recentDuplicates = [];
  }
}
