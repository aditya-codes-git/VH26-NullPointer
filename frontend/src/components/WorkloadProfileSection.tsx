import React, { useState } from 'react';
import { Play, Square, RotateCcw, Layers, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { TelemetrySnapshot, WorkloadScenario } from '../types/telemetry.js';
import { setWorkloadScenario, resetWorkloadRun, triggerStart, triggerStop } from '../services/socketClient.js';

interface WorkloadProfileSectionProps {
  telemetry: TelemetrySnapshot | null;
  onStartTraffic?: () => void;
  onStopTraffic?: () => void;
}

export const WorkloadProfileSection: React.FC<WorkloadProfileSectionProps> = ({
  telemetry,
  onStartTraffic,
  onStopTraffic,
}) => {
  const [isSwitching, setIsSwitching] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const workload = telemetry?.workload;
  const isTrafficRunning = (telemetry?.simulatorMode && telemetry.simulatorMode !== 'STOPPED') || false;
  const activeScenario: WorkloadScenario = workload?.activeWorkloadScenario || 'LOW_HEAVY';

  const configured = workload?.configuredDistribution || {
    CRITICAL: 20,
    HIGH: 20,
    LOW: 60,
    PAYMENT: 10,
    ORDER: 10,
    INVENTORY: 20,
    CLICK: 30,
    LOG: 30,
  };

  const actual = workload?.actualDistribution || {
    CRITICAL: 0,
    HIGH: 0,
    LOW: 0,
    PAYMENT: 0,
    ORDER: 0,
    INVENTORY: 0,
    CLICK: 0,
    LOG: 0,
  };

  const runCounts = workload?.runEventCounts || {
    paymentReceived: 0,
    orderReceived: 0,
    inventoryReceived: 0,
    clickReceived: 0,
    logReceived: 0,
    criticalReceived: 0,
    highReceived: 0,
    lowReceived: 0,
    totalRunReceived: 0,
  };

  const handleSelectScenario = async (scenario: WorkloadScenario) => {
    if (scenario === activeScenario) return;
    if (isTrafficRunning) {
      setErrorMessage('Traffic is actively running! Please stop traffic first before switching workload profiles.');
      return;
    }

    try {
      setIsSwitching(true);
      setErrorMessage(null);
      await setWorkloadScenario(scenario);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to switch scenario');
    } finally {
      setIsSwitching(false);
    }
  };

  const handleResetRun = async () => {
    try {
      setIsSwitching(true);
      setErrorMessage(null);
      await resetWorkloadRun();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reset run');
    } finally {
      setIsSwitching(false);
    }
  };

  const handleStart = async () => {
    try {
      setIsSwitching(true);
      setErrorMessage(null);
      if (onStartTraffic) {
        onStartTraffic();
      } else {
        await triggerStart();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to start traffic');
    } finally {
      setIsSwitching(false);
    }
  };

  const handleStop = async () => {
    try {
      setIsSwitching(true);
      setErrorMessage(null);
      if (onStopTraffic) {
        onStopTraffic();
      } else {
        await triggerStop();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to stop traffic');
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-bold uppercase tracking-wider font-mono">Workload Profile</h2>
              <span className="text-xs bg-blue-500/20 text-blue-300 px-2.5 py-0.5 rounded-full border border-blue-400/30 font-mono">
                Judge Distribution Control
              </span>
            </div>
            <p className="text-sm text-slate-300 mt-1">
              Select runtime workload composition. Directly controls real backend event generator and priority routing.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isTrafficRunning ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                TRAFFIC RUNNING
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-slate-700 text-slate-300 border border-slate-600">
                <Square className="w-3 h-3 text-slate-400" />
                TRAFFIC IDLE
              </span>
            )}
          </div>
        </div>

        {/* Dominant Priority Selector */}
        <div className="mt-6">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
            Choose Dominant Priority Profile:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* CRITICAL HEAVY */}
            <button
              type="button"
              id="workload-critical-heavy-btn"
              onClick={() => handleSelectScenario('CRITICAL_HEAVY')}
              disabled={isSwitching}
              className={`p-4 rounded-xl border text-left transition-all relative cursor-pointer ${
                activeScenario === 'CRITICAL_HEAVY'
                  ? 'bg-rose-950/40 border-rose-500 shadow-lg shadow-rose-900/20 ring-2 ring-rose-500/40'
                  : 'bg-slate-800/60 border-slate-700 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">🔴</span>
                  <span className="font-mono font-bold text-sm text-white">CRITICAL HEAVY</span>
                </div>
                {activeScenario === 'CRITICAL_HEAVY' && (
                  <CheckCircle2 className="w-4 h-4 text-rose-400" />
                )}
              </div>
              <p className="text-xs text-slate-300 leading-snug">
                PAYMENT (30%) + ORDER (30%) dominate. <strong className="text-rose-400">60% CRITICAL</strong>.
              </p>
            </button>

            {/* HIGH HEAVY */}
            <button
              type="button"
              id="workload-high-heavy-btn"
              onClick={() => handleSelectScenario('HIGH_HEAVY')}
              disabled={isSwitching}
              className={`p-4 rounded-xl border text-left transition-all relative cursor-pointer ${
                activeScenario === 'HIGH_HEAVY'
                  ? 'bg-blue-950/40 border-blue-500 shadow-lg shadow-blue-900/20 ring-2 ring-blue-500/40'
                  : 'bg-slate-800/60 border-slate-700 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">🔵</span>
                  <span className="font-mono font-bold text-sm text-white">HIGH HEAVY</span>
                </div>
                {activeScenario === 'HIGH_HEAVY' && (
                  <CheckCircle2 className="w-4 h-4 text-blue-400" />
                )}
              </div>
              <p className="text-xs text-slate-300 leading-snug">
                INVENTORY (60%) dominates. <strong className="text-blue-400">60% HIGH</strong>.
              </p>
            </button>

            {/* LOW HEAVY */}
            <button
              type="button"
              id="workload-low-heavy-btn"
              onClick={() => handleSelectScenario('LOW_HEAVY')}
              disabled={isSwitching}
              className={`p-4 rounded-xl border text-left transition-all relative cursor-pointer ${
                activeScenario === 'LOW_HEAVY'
                  ? 'bg-emerald-950/40 border-emerald-500 shadow-lg shadow-emerald-900/20 ring-2 ring-emerald-500/40'
                  : 'bg-slate-800/60 border-slate-700 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">🟢</span>
                  <span className="font-mono font-bold text-sm text-white">LOW HEAVY</span>
                </div>
                {activeScenario === 'LOW_HEAVY' && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                )}
              </div>
              <p className="text-xs text-slate-300 leading-snug">
                CLICK (30%) + LOG (30%) dominate. <strong className="text-emerald-400">60% LOW</strong>.
              </p>
            </button>
          </div>
        </div>

        {/* Active Run Warning or Feedback */}
        {isTrafficRunning && (
          <div className="mt-4 px-3.5 py-2.5 bg-amber-500/15 border border-amber-500/30 rounded-lg flex items-center gap-2 text-xs text-amber-200">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Workload composition locked while traffic is running to ensure statistical isolation. Stop traffic to switch scenarios.
            </span>
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 px-3.5 py-2.5 bg-rose-500/20 border border-rose-500/40 rounded-lg flex items-center gap-2 text-xs text-rose-200">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Body: Configured vs Actual Analysis */}
      <div className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <div className="text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">
              Current Run Status
            </div>
            <div className="text-xl font-bold font-mono text-slate-900 flex items-center gap-2 mt-0.5">
              <span>
                {activeScenario === 'CRITICAL_HEAVY' && '🔴 CRITICAL HEAVY'}
                {activeScenario === 'HIGH_HEAVY' && '🔵 HIGH HEAVY'}
                {activeScenario === 'LOW_HEAVY' && '🟢 LOW HEAVY'}
              </span>
              <span className="text-xs font-normal font-sans bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full border border-slate-200">
                {runCounts.totalRunReceived.toLocaleString()} events received in current run
              </span>
            </div>
          </div>

          {/* Run Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {!isTrafficRunning ? (
              <button
                type="button"
                id="workload-start-traffic-btn"
                onClick={handleStart}
                disabled={isSwitching}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-mono font-bold transition-all shadow-sm cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>START TRAFFIC</span>
              </button>
            ) : (
              <button
                type="button"
                id="workload-stop-traffic-btn"
                onClick={handleStop}
                disabled={isSwitching}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-mono font-bold transition-all shadow-sm cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                <span>STOP TRAFFIC</span>
              </button>
            )}

            <button
              type="button"
              id="workload-reset-run-btn"
              onClick={handleResetRun}
              disabled={isSwitching}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-mono font-semibold transition-all cursor-pointer"
              title="Resets current scenario run distribution counters without clearing total accounting"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
              <span>RESET RUN</span>
            </button>
          </div>
        </div>

        {/* Side-by-Side: Priority Distribution (Configured vs Actual) */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Priority Tier Comparison Table */}
          <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
            <h3 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center justify-between">
              <span>Priority Breakdown</span>
              <span className="text-[11px] font-normal text-slate-500 font-sans">
                Configured vs. Real Observed
              </span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-left">
                    <th className="pb-2 font-semibold">Priority</th>
                    <th className="pb-2 font-semibold text-right">Configured</th>
                    <th className="pb-2 font-semibold text-right">Actual</th>
                    <th className="pb-2 font-semibold text-right">Run Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80">
                  {/* CRITICAL */}
                  <tr>
                    <td className="py-2.5 font-bold text-rose-700 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      CRITICAL
                    </td>
                    <td className="py-2.5 text-right font-bold text-slate-700">
                      {configured.CRITICAL}%
                    </td>
                    <td className="py-2.5 text-right font-bold text-rose-700">
                      {runCounts.totalRunReceived > 0 ? `${actual.CRITICAL.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2.5 text-right text-slate-600">
                      {runCounts.criticalReceived.toLocaleString()}
                    </td>
                  </tr>

                  {/* HIGH */}
                  <tr>
                    <td className="py-2.5 font-bold text-blue-700 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      HIGH
                    </td>
                    <td className="py-2.5 text-right font-bold text-slate-700">
                      {configured.HIGH}%
                    </td>
                    <td className="py-2.5 text-right font-bold text-blue-700">
                      {runCounts.totalRunReceived > 0 ? `${actual.HIGH.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2.5 text-right text-slate-600">
                      {runCounts.highReceived.toLocaleString()}
                    </td>
                  </tr>

                  {/* LOW */}
                  <tr>
                    <td className="py-2.5 font-bold text-emerald-700 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      LOW
                    </td>
                    <td className="py-2.5 text-right font-bold text-slate-700">
                      {configured.LOW}%
                    </td>
                    <td className="py-2.5 text-right font-bold text-emerald-700">
                      {runCounts.totalRunReceived > 0 ? `${actual.LOW.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2.5 text-right text-slate-600">
                      {runCounts.lowReceived.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Visual stacked distribution bars */}
            <div className="mt-4 pt-3 border-t border-slate-200">
              <div className="text-[11px] font-mono text-slate-500 mb-1 flex justify-between">
                <span>Configured Composition:</span>
                <span>CRIT {configured.CRITICAL}% | HIGH {configured.HIGH}% | LOW {configured.LOW}%</span>
              </div>
              <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden flex">
                <div style={{ width: `${configured.CRITICAL}%` }} className="bg-rose-500 h-full" title={`CRITICAL: ${configured.CRITICAL}%`} />
                <div style={{ width: `${configured.HIGH}%` }} className="bg-blue-500 h-full" title={`HIGH: ${configured.HIGH}%`} />
                <div style={{ width: `${configured.LOW}%` }} className="bg-emerald-500 h-full" title={`LOW: ${configured.LOW}%`} />
              </div>

              <div className="text-[11px] font-mono text-slate-500 mt-2 mb-1 flex justify-between">
                <span>Cumulative Run Composition:</span>
                <span>
                  {runCounts.totalRunReceived > 0
                    ? `CRIT ${actual.CRITICAL.toFixed(1)}% | HIGH ${actual.HIGH.toFixed(1)}% | LOW ${actual.LOW.toFixed(1)}%`
                    : 'Awaiting traffic events...'}
                </span>
              </div>
              <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden flex">
                {runCounts.totalRunReceived > 0 ? (
                  <>
                    <div style={{ width: `${actual.CRITICAL}%` }} className="bg-rose-500 h-full transition-all duration-300" />
                    <div style={{ width: `${actual.HIGH}%` }} className="bg-blue-500 h-full transition-all duration-300" />
                    <div style={{ width: `${actual.LOW}%` }} className="bg-emerald-500 h-full transition-all duration-300" />
                  </>
                ) : (
                  <div className="w-full bg-slate-300 h-full" />
                )}
              </div>

              {/* Live 1-Second Ingestion Stream */}
              <div className="mt-3.5 pt-3 border-t border-slate-200/80">
                <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isTrafficRunning ? 'bg-emerald-400 opacity-75' : 'bg-slate-300'}`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${isTrafficRunning ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                    </span>
                    Live Ingestion (Last 1s Window):
                  </span>
                  <span className="text-slate-500 font-bold">
                    {workload?.windowCounts ? `${workload.windowCounts.total} evt/s` : '0 evt/s'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono bg-white p-2 rounded-lg border border-slate-200">
                  <div className="bg-rose-50/80 p-1.5 rounded border border-rose-100">
                    <div className="text-rose-600 font-semibold">CRITICAL INCOMING</div>
                    <div className="text-sm font-bold text-rose-800">
                      {workload?.windowPercentages?.critical !== undefined ? `${workload.windowPercentages.critical.toFixed(1)}%` : '—'}
                    </div>
                    <div className="text-[10px] text-rose-600">
                      {workload?.windowCounts?.critical || 0} evt/s (Proc: {workload?.processedPerSec?.critical || 0}/s)
                    </div>
                  </div>

                  <div className="bg-blue-50/80 p-1.5 rounded border border-blue-100">
                    <div className="text-blue-600 font-semibold">HIGH INCOMING</div>
                    <div className="text-sm font-bold text-blue-800">
                      {workload?.windowPercentages?.high !== undefined ? `${workload.windowPercentages.high.toFixed(1)}%` : '—'}
                    </div>
                    <div className="text-[10px] text-blue-600">
                      {workload?.windowCounts?.high || 0} evt/s (Proc: {workload?.processedPerSec?.high || 0}/s)
                    </div>
                  </div>

                  <div className="bg-emerald-50/80 p-1.5 rounded border border-emerald-100">
                    <div className="text-emerald-600 font-semibold">LOW INCOMING</div>
                    <div className="text-sm font-bold text-emerald-800">
                      {workload?.windowPercentages?.low !== undefined ? `${workload.windowPercentages.low.toFixed(1)}%` : '—'}
                    </div>
                    <div className="text-[10px] text-emerald-600">
                      {workload?.windowCounts?.low || 0} evt/s (Proc: {workload?.processedPerSec?.low || 0}/s)
                    </div>
                  </div>
                </div>

                <div className="mt-2 text-[10px] text-slate-500 leading-snug">
                  * Incoming percentages reflect the true wire ingestion distribution. Queue depths diverge because workers prioritize processing CRITICAL first, draining CRITICAL while HIGH & LOW backlogs accumulate.
                </div>
              </div>
            </div>
          </div>

          {/* Event-Level Detailed Breakdown */}
          <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
            <h3 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center justify-between">
              <span>Event Type Breakdown</span>
              <span className="text-[11px] font-normal text-slate-500 font-sans">
                5 Distinct Event Types
              </span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-left">
                    <th className="pb-2 font-semibold">Event</th>
                    <th className="pb-2 font-semibold">Tier</th>
                    <th className="pb-2 font-semibold text-right">Config</th>
                    <th className="pb-2 font-semibold text-right">Actual</th>
                    <th className="pb-2 font-semibold text-right">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80">
                  <tr>
                    <td className="py-2 font-bold text-slate-800">PAYMENT</td>
                    <td className="py-2 text-rose-600 font-semibold">CRITICAL</td>
                    <td className="py-2 text-right">{configured.PAYMENT}%</td>
                    <td className="py-2 text-right font-bold text-slate-800">
                      {runCounts.totalRunReceived > 0 ? `${actual.PAYMENT.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 text-right text-slate-600">{runCounts.paymentReceived.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-bold text-slate-800">ORDER</td>
                    <td className="py-2 text-rose-600 font-semibold">CRITICAL</td>
                    <td className="py-2 text-right">{configured.ORDER}%</td>
                    <td className="py-2 text-right font-bold text-slate-800">
                      {runCounts.totalRunReceived > 0 ? `${actual.ORDER.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 text-right text-slate-600">{runCounts.orderReceived.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-bold text-slate-800">INVENTORY</td>
                    <td className="py-2 text-blue-600 font-semibold">HIGH</td>
                    <td className="py-2 text-right">{configured.INVENTORY}%</td>
                    <td className="py-2 text-right font-bold text-slate-800">
                      {runCounts.totalRunReceived > 0 ? `${actual.INVENTORY.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 text-right text-slate-600">{runCounts.inventoryReceived.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-bold text-slate-800">CLICK</td>
                    <td className="py-2 text-emerald-600 font-semibold">LOW</td>
                    <td className="py-2 text-right">{configured.CLICK}%</td>
                    <td className="py-2 text-right font-bold text-slate-800">
                      {runCounts.totalRunReceived > 0 ? `${actual.CLICK.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 text-right text-slate-600">{runCounts.clickReceived.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-bold text-slate-800">LOG</td>
                    <td className="py-2 text-emerald-600 font-semibold">LOW</td>
                    <td className="py-2 text-right">{configured.LOG}%</td>
                    <td className="py-2 text-right font-bold text-slate-800">
                      {runCounts.totalRunReceived > 0 ? `${actual.LOG.toFixed(1)}%` : '—'}
                    </td>
                    <td className="py-2 text-right text-slate-600">{runCounts.logReceived.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-3.5 p-2.5 bg-blue-50/70 border border-blue-200/80 rounded-lg flex items-start gap-2 text-[11px] text-blue-900 leading-relaxed">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                <strong>Verification Proof:</strong> Percentages are derived entirely from live received events passing through classification and routing.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
