import React, { useState } from 'react';
import type { FaultToleranceTelemetry } from '../types/telemetry.js';
import { triggerSimulateFailure } from '../services/socketClient.js';

interface FaultToleranceSectionProps {
  faultTolerance?: FaultToleranceTelemetry;
  disabled?: boolean;
}

export const FaultToleranceSection: React.FC<FaultToleranceSectionProps> = ({
  faultTolerance,
  disabled = false,
}) => {
  const [isArming, setIsArming] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<'single' | 'multi' | 'permanent'>('single');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const isArmed = faultTolerance?.failureArmed ?? false;
  const retryAttempts = faultTolerance?.retryAttempts ?? 0;
  const retrySuccesses = faultTolerance?.retrySuccesses ?? 0;
  const retryFailures = faultTolerance?.retryFailures ?? 0;
  const permanentFailures = faultTolerance?.permanentFailures ?? 0;
  const duplicatesPrevented = faultTolerance?.duplicatesPrevented ?? 0;
  
  // Real backend recovery events summary
  const recoveryEvents = faultTolerance?.recoveryEvents ?? [];

  // Determine current overall lifecycle status
  let statusBadge = {
    label: 'READY',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    pulse: false,
  };

  if (isArmed) {
    statusBadge = {
      label: 'FAILURE ARMED',
      className: 'bg-amber-100 text-amber-900 border-amber-300 font-bold',
      pulse: true,
    };
  } else if (recoveryEvents.length > 0) {
    const latest = recoveryEvents[0];
    if (latest.outcome === 'RECOVERING') {
      statusBadge = {
        label: `RECOVERING (${latest.eventId} #${latest.totalAttempts})`,
        className: 'bg-blue-100 text-blue-900 border-blue-300 font-bold',
        pulse: true,
      };
    } else if (latest.outcome === 'PERMANENT_FAILURE') {
      statusBadge = {
        label: 'PERMANENT FAILURE RECORDED',
        className: 'bg-slate-800 text-rose-300 border-slate-700 font-bold',
        pulse: false,
      };
    } else if (latest.outcome === 'RECOVERED') {
      statusBadge = {
        label: 'RECOVERED',
        className: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-bold',
        pulse: false,
      };
    }
  }

  const handleSimulateClick = async (mode: 'single' | 'multi' | 'permanent') => {
    try {
      setIsArming(true);
      setActionMessage(null);
      const res = await triggerSimulateFailure(undefined, mode);
      setActionMessage(res.message || 'Simulated failure armed');
      setTimeout(() => setActionMessage(null), 4000);
    } catch (err: any) {
      setActionMessage(err.message || 'Failed to arm failure');
    } finally {
      setIsArming(false);
    }
  };

  const toggleExpand = (eventId: string) => {
    setExpandedEventId((prev) => (prev === eventId ? null : eventId));
  };

  return (
    <section className="bg-white rounded-xl border border-[#e2e8f0] shadow-xs overflow-hidden">
      {/* Header bar */}
      <div className="p-5 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-rose-600 text-[22px]">health_and_safety</span>
          <div>
            <h3 className="text-sm font-bold text-[#131b2e] uppercase font-mono tracking-wider">
              Fault Tolerance with Idempotent Retry
            </h3>
            <p className="text-[11px] text-slate-500">
              Deterministic failure injection, isolated event retry &amp; duplicate side-effect protection
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono">
          <span className="text-xs text-slate-500">STATUS:</span>
          <span
            className={`px-3 py-1 rounded-lg text-xs border font-mono flex items-center gap-1.5 shadow-2xs ${statusBadge.className}`}
          >
            {statusBadge.pulse && <span className="w-2 h-2 rounded-full bg-current animate-ping" />}
            {statusBadge.label}
          </span>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Simulation Control with Multiple Real Scenarios */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold font-mono text-slate-800 uppercase tracking-tight">
                Event Failure Simulation
              </span>
              <span className="px-2 py-0.5 bg-blue-50 text-blue-800 text-[10px] font-mono font-bold rounded border border-blue-200">
                EVENT-DRIVEN
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1 max-w-2xl">
              Normal events stream directly without failure. When triggered, the backend injects an isolated worker error into the next eligible event, verifying that surviving batch items continue without disruption. Select a realistic failure profile:
            </p>

            {/* Scenario Selection Tabs */}
            <div className="flex flex-wrap gap-2 mt-3 font-mono text-xs">
              <button
                type="button"
                onClick={() => setSelectedScenario('single')}
                disabled={isArmed}
                className={`px-2.5 py-1 rounded border transition-colors cursor-pointer text-left ${
                  selectedScenario === 'single'
                    ? 'bg-blue-600 text-white border-blue-600 font-bold'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                1. Single Retry (Recovers Att #2)
              </button>
              <button
                type="button"
                onClick={() => setSelectedScenario('multi')}
                disabled={isArmed}
                className={`px-2.5 py-1 rounded border transition-colors cursor-pointer text-left ${
                  selectedScenario === 'multi'
                    ? 'bg-blue-600 text-white border-blue-600 font-bold'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                2. Multi-Retry (Recovers Att #3)
              </button>
              <button
                type="button"
                onClick={() => setSelectedScenario('permanent')}
                disabled={isArmed}
                className={`px-2.5 py-1 rounded border transition-colors cursor-pointer text-left ${
                  selectedScenario === 'permanent'
                    ? 'bg-blue-600 text-white border-blue-600 font-bold'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                }`}
              >
                3. Max Retries Exhausted (Permanent Failure)
              </button>
            </div>

            {actionMessage && (
              <div className="text-xs font-mono text-blue-700 mt-2 font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                {actionMessage}
              </div>
            )}
          </div>

          <button
            onClick={() => handleSimulateClick(selectedScenario)}
            disabled={disabled || isArming || isArmed}
            className={`px-5 py-2.5 rounded-lg text-xs font-bold font-mono transition-all shadow-xs flex items-center gap-2 cursor-pointer shrink-0 ${
              isArmed
                ? 'bg-amber-500 text-white cursor-not-allowed opacity-90'
                : 'bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isArmed ? 'hourglass_top' : 'bolt'}
            </span>
            {isArmed ? 'FAILURE ARMED' : 'SIMULATE FAILURE'}
          </button>
        </div>

        {/* Live Recovery Metrics Grid */}
        <div>
          <div className="text-xs font-bold font-mono text-slate-700 uppercase tracking-wider mb-3">
            Live Recovery Metrics
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center font-mono">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-[10px] text-slate-500 block uppercase">Retry Attempts</span>
              <span className="text-xl font-extrabold text-blue-700">{retryAttempts}</span>
            </div>

            <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-lg">
              <span className="text-[10px] text-emerald-700 block uppercase">Successful Retries</span>
              <span className="text-xl font-extrabold text-emerald-700">{retrySuccesses}</span>
            </div>

            <div className="p-3 bg-rose-50/50 border border-rose-200 rounded-lg">
              <span className="text-[10px] text-rose-700 block uppercase">Active Failures</span>
              <span className="text-xl font-extrabold text-rose-700">{retryFailures}</span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <span className="text-[10px] text-slate-500 block uppercase">Permanent Failures</span>
              <span className="text-xl font-extrabold text-slate-700">{permanentFailures}</span>
            </div>

            <div className="p-3 bg-purple-50/50 border border-purple-200 rounded-lg">
              <span className="text-[10px] text-purple-700 block uppercase">Duplicates Prevented</span>
              <span className="text-xl font-extrabold text-purple-700">{duplicatesPrevented}</span>
            </div>
          </div>
        </div>

        {/* Recovery Lifecycle Flow Visualizer */}
        <div className="p-4 bg-slate-900 text-slate-100 rounded-lg font-mono text-xs shadow-inner">
          <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-3 flex items-center justify-between">
            <span>Deterministic Recovery Flow</span>
            <span className="text-[10px] text-slate-400">Targeted Per-Event Retry Invariant</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-center">
            <div className="p-2.5 bg-slate-800 rounded border border-slate-700">
              <div className="text-[10px] text-slate-400">STAGE 1</div>
              <div className="font-bold text-rose-400 mt-0.5">FAILED</div>
              <div className="text-[10px] text-slate-400 mt-1">Worker crash trapped</div>
            </div>

            <div className="p-2.5 bg-slate-800 rounded border border-slate-700">
              <div className="text-[10px] text-slate-400">STAGE 2</div>
              <div className="font-bold text-amber-400 mt-0.5">ISOLATED</div>
              <div className="text-[10px] text-slate-400 mt-1">Only failed event queued</div>
            </div>

            <div className="p-2.5 bg-slate-800 rounded border border-slate-700">
              <div className="text-[10px] text-slate-400">STAGE 3</div>
              <div className="font-bold text-blue-400 mt-0.5">RETRYING #1-3</div>
              <div className="text-[10px] text-slate-400 mt-1">Exponential backoff</div>
            </div>

            <div className="p-2.5 bg-slate-800 rounded border border-slate-700">
              <div className="text-[10px] text-slate-400">STAGE 4</div>
              <div className="font-bold text-emerald-400 mt-0.5">SUCCESS</div>
              <div className="text-[10px] text-slate-400 mt-1">Idempotency check passed</div>
            </div>
          </div>
        </div>

        {/* Compact Recovery Events Table with Expandable Details */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-xs font-bold font-mono text-slate-700 uppercase tracking-wider">
                Recovery Events ({recoveryEvents.length} distinct events)
              </div>
              <p className="text-[11px] text-slate-500">
                Click any event to inspect its chronological lifecycle trace.
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-400">Real Backend Telemetry</span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-mono text-slate-600">
                  <th className="py-2.5 px-4 font-semibold">Event ID</th>
                  <th className="py-2.5 px-4 font-semibold">Type</th>
                  <th className="py-2.5 px-4 font-semibold">Priority</th>
                  <th className="py-2.5 px-4 font-semibold">Total Attempts</th>
                  <th className="py-2.5 px-4 font-semibold">Retries</th>
                  <th className="py-2.5 px-4 font-semibold">Outcome</th>
                  <th className="py-2.5 px-4 font-semibold text-right font-mono">Last Updated</th>
                  <th className="py-2.5 px-3 text-center font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {recoveryEvents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400 font-mono text-xs">
                      No failure events recorded. Normal traffic executes without error. Click &quot;SIMULATE FAILURE&quot; to test.
                    </td>
                  </tr>
                ) : (
                  recoveryEvents.map((ev) => {
                    const isExpanded = expandedEventId === ev.eventId;
                    return (
                      <React.Fragment key={ev.eventId}>
                        <tr
                          onClick={() => toggleExpand(ev.eventId)}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                        >
                          <td className="py-2.5 px-4 font-bold text-slate-800 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[16px] text-slate-400">
                              {isExpanded ? 'expand_less' : 'expand_more'}
                            </span>
                            {ev.eventId}
                          </td>
                          <td className="py-2.5 px-4 font-sans font-semibold text-slate-700">{ev.type}</td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                ev.priority === 'CRITICAL'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : ev.priority === 'HIGH'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-purple-100 text-purple-800'
                              }`}
                            >
                              {ev.priority}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-center font-bold text-slate-700">
                            {ev.totalAttempts} {ev.totalAttempts === 1 ? 'attempt' : 'attempts'}
                          </td>
                          <td className="py-2.5 px-4 text-center text-blue-700 font-semibold">
                            {ev.retriesCount}
                          </td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                ev.outcome === 'RECOVERED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : ev.outcome === 'PERMANENT_FAILURE'
                                  ? 'bg-slate-800 text-rose-300 font-bold'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {ev.outcome === 'RECOVERED'
                                ? '✓ RECOVERED'
                                : ev.outcome === 'PERMANENT_FAILURE'
                                ? '✗ PERMANENT FAILURE'
                                : 'RECOVERING'}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right text-slate-400 text-[11px] font-mono">
                            {ev.lastUpdated}
                          </td>
                          <td className="py-2.5 px-3 text-center text-blue-600 text-xs font-sans font-semibold">
                            {isExpanded ? 'Hide Trace' : 'View Trace'}
                          </td>
                        </tr>

                        {/* Expandable Lifecycle Detail Drawer */}
                        {isExpanded && (
                          <tr className="bg-slate-50/70 border-b border-slate-200">
                            <td colSpan={8} className="p-4">
                              <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-2xs font-mono text-xs space-y-3">
                                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                  <span className="font-bold text-slate-800">
                                    Chronological Lifecycle Trace — {ev.eventId}
                                  </span>
                                  <span className="text-[11px] text-slate-500">
                                    Final Worker: {ev.lastWorkerId}
                                  </span>
                                </div>

                                <div className="space-y-2">
                                  {ev.lifecycle.map((step, idx) => (
                                    <div
                                      key={step.id || idx}
                                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 p-2 rounded bg-slate-50 border border-slate-200/80 text-[11px]"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="w-5 text-slate-400 font-bold">#{idx + 1}</span>
                                        <span
                                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                            step.status === 'SUCCESS'
                                              ? 'bg-emerald-100 text-emerald-800'
                                              : step.status === 'FAILED'
                                              ? 'bg-rose-100 text-rose-800'
                                              : step.status === 'ISOLATED'
                                              ? 'bg-amber-50 text-amber-900 border border-amber-300'
                                              : step.status === 'RETRYING'
                                              ? 'bg-blue-100 text-blue-800'
                                              : 'bg-slate-800 text-white'
                                          }`}
                                        >
                                          {step.status}
                                        </span>
                                        <span className="font-bold text-slate-700">
                                          {step.status === 'RETRYING' && step.retryNumber
                                            ? `Retry #${step.retryNumber} (Attempt #${step.attempt})`
                                            : `Attempt #${step.attempt}`}
                                        </span>
                                        <span className="text-slate-500 font-sans text-[11px]">
                                          — {step.failureReason}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-3 text-slate-400 shrink-0">
                                        <span>Worker: {step.workerId}</span>
                                        <span>{step.timestamp}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
};

