import React, { useState } from 'react';
import type { DuplicateDetectionTelemetry } from '../types/telemetry.js';
import { triggerTestDuplicate } from '../services/socketClient.js';

interface DuplicateProtectionSectionProps {
  duplicateDetection?: DuplicateDetectionTelemetry;
  disabled?: boolean;
}

export const DuplicateProtectionSection: React.FC<DuplicateProtectionSectionProps> = ({
  duplicateDetection,
  disabled = false,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastDemoResult, setLastDemoResult] = useState<any | null>(null);
  const [selectedType, setSelectedType] = useState<string>('ORDER');

  const duplicatesPrevented = duplicateDetection?.duplicatesPrevented ?? 0;
  const duplicatesDetected = duplicateDetection?.duplicatesDetected ?? 0;
  const activeEntries = duplicateDetection?.activeRegistryEntries ?? 0;
  const maxCapacity = duplicateDetection?.maxRegistryCapacity ?? 10000;
  const ttlSeconds = duplicateDetection?.windowTtlSeconds ?? 60;
  const recentDuplicates = duplicateDetection?.recentDuplicates ?? [];

  const capacityPercent = Math.min(100, Math.round((activeEntries / maxCapacity) * 100));

  const handleTestDuplicate = async () => {
    try {
      setIsSubmitting(true);
      const res = await triggerTestDuplicate(undefined, selectedType);
      setLastDemoResult(res);
      setTimeout(() => setLastDemoResult(null), 8000);
    } catch (err: any) {
      setLastDemoResult({ error: err.message || 'Failed to execute duplicate demo' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="bg-white p-5 rounded-xl border border-[#e2e8f0] shadow-xs font-mono text-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-amber-600 text-[22px]">content_copy</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 uppercase tracking-wider text-sm">
                REDUNDANT / DUPLICATE EVENT DETECTION
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-bold border border-amber-200">
                STRETCH GOAL #3
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-sans mt-0.5">
              Bounded TTL/LRU registry preventing duplicate external submissions while preserving idempotency separation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="px-2.5 py-1 rounded text-[11px] border font-bold bg-emerald-50 text-emerald-800 border-emerald-200">
              60s SLIDING WINDOW
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              disabled={disabled || isSubmitting}
              className="px-2 py-1 text-[11px] font-sans font-medium rounded border border-slate-200 bg-slate-50 text-slate-700"
            >
              <option value="ORDER">ORDER (Critical)</option>
              <option value="PAYMENT">PAYMENT (Critical)</option>
              <option value="INVENTORY">INVENTORY (High)</option>
              <option value="CLICK">CLICK (Low)</option>
              <option value="LOG">LOG (Low)</option>
            </select>

            <button
              onClick={handleTestDuplicate}
              disabled={disabled || isSubmitting}
              className={`px-3 py-1 text-[11px] font-bold rounded border transition-colors flex items-center gap-1.5 ${
                disabled || isSubmitting
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700 shadow-xs'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">
                {isSubmitting ? 'sync' : 'replay'}
              </span>
              {isSubmitting ? 'Testing...' : 'Test Duplicate Submission'}
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {/* Metric 1: Prevented */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <span className="text-[10px] text-slate-400 block mb-1">Duplicates Prevented</span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-emerald-700">{duplicatesPrevented.toLocaleString()}</span>
            <span className="text-[10px] text-slate-400 font-sans">blocked at gate</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 font-sans">
            Detected: <span className="font-bold text-slate-700">{duplicatesDetected.toLocaleString()}</span>
          </div>
        </div>

        {/* Metric 2: Active Registry */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <span className="text-[10px] text-slate-400 block mb-1">Active Registry Entries</span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-indigo-700">{activeEntries.toLocaleString()}</span>
            <span className="text-[10px] text-slate-400 font-sans">/ {maxCapacity.toLocaleString()} max</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
            <div
              className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(2, capacityPercent)}%` }}
            />
          </div>
        </div>

        {/* Metric 3: Deduplication TTL */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <span className="text-[10px] text-slate-400 block mb-1">Deduplication Window</span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-800">{ttlSeconds}s</span>
            <span className="text-[10px] text-slate-400 font-sans">TTL per ID</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 font-sans">
            Bounded LRU cache with automatic expiration
          </div>
        </div>

        {/* Metric 4: Admission Architecture */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <span className="text-[10px] text-slate-400 block mb-1">Architecture Separation</span>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-emerald-800">Gated Admission</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500 font-sans">
            External → DuplicateDetector | Retry → Idempotency
          </div>
        </div>
      </div>

      {/* Interactive Demo Arrival Box */}
      {lastDemoResult && (
        <div className="mb-4 p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg">
          {lastDemoResult.error ? (
            <div className="text-rose-700 font-bold">{lastDemoResult.error}</div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-amber-900 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-amber-700">bolt</span>
                  Live Duplicate Test Result
                </span>
                <span className="text-[10px] text-amber-700 font-sans">
                  Event ID: <strong className="font-mono">{lastDemoResult.firstSubmission?.eventId}</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                {/* 1st Submission */}
                <div className="p-2.5 bg-white border border-emerald-200 rounded">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-emerald-800">1. First External Submission</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      ADMITTED (NEW)
                    </span>
                  </div>
                  <div className="text-slate-600 font-sans text-[10px]">
                    Event ID registered in TTL registry. Dispatched to priority queue for worker execution.
                  </div>
                </div>

                {/* 2nd Submission */}
                <div className="p-2.5 bg-white border border-rose-200 rounded">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-rose-800">2. Immediate Duplicate Submission</span>
                    <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                      BLOCKED (DUPLICATE)
                    </span>
                  </div>
                  <div className="text-slate-600 font-sans text-[10px]">
                    {lastDemoResult.secondSubmission?.reason || 'Event ID already admitted. Rejected at border.'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Responsibility Callout Note */}
      <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 font-sans text-[11px] leading-relaxed">
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-indigo-600 text-[18px] shrink-0 mt-0.5">shield</span>
          <div>
            <strong className="text-slate-900 font-mono text-[11px]">Clean Responsibility Boundary:</strong>
            <div className="mt-0.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
              <div>
                <span className="font-bold text-amber-800 font-mono">External Ingestion Gate:</span>{' '}
                <code className="text-[10px] bg-slate-200/70 px-1 py-0.5 rounded">DuplicateDetector</code> admits new event IDs and rejects duplicate submissions before they can enter queues or increment accounting counters.
              </div>
              <div>
                <span className="font-bold text-blue-800 font-mono">Internal Fault-Tolerance Retry:</span>{' '}
                <code className="text-[10px] bg-slate-200/70 px-1 py-0.5 rounded">RetryController</code> preserves original event IDs, re-enqueues directly into priority queues, and applies business-effect idempotency checks to prevent double-execution.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Blocked Duplicates Table */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-slate-500">history</span>
            Recent Blocked Duplicates Audit Ledger
          </span>
          <span className="text-[10px] text-slate-400 font-sans">
            Showing {recentDuplicates.length} recorded rejections
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 font-mono text-slate-600">
                <th className="py-2 px-3 font-semibold">Event ID</th>
                <th className="py-2 px-3 font-semibold">Type</th>
                <th className="py-2 px-3 font-semibold">Priority</th>
                <th className="py-2 px-3 font-semibold">Rejection Reason</th>
                <th className="py-2 px-3 font-semibold text-right">Blocked At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentDuplicates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400 font-sans">
                    No duplicate external events detected yet. Click "Test Duplicate Submission" to test admission rejection.
                  </td>
                </tr>
              ) : (
                recentDuplicates.map((dup) => (
                  <tr key={dup.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2 px-3 font-mono font-bold text-slate-800">{dup.eventId}</td>
                    <td className="py-2 px-3">
                      <span className="font-semibold text-slate-700">{dup.type}</span>
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          dup.priority === 'CRITICAL'
                            ? 'bg-rose-100 text-rose-800'
                            : dup.priority === 'HIGH'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {dup.priority}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-600 font-sans text-[10px]">
                      {dup.reason}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-500">
                      {dup.timestamp}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
