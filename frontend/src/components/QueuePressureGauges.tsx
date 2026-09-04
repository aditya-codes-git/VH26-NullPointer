import React from 'react';
import { TelemetrySnapshot } from '../types/telemetry.js';
import { ShieldCheck, Layers, Eye } from 'lucide-react';

interface QueuePressureGaugesProps {
  telemetry: TelemetrySnapshot | null;
}

export const QueuePressureGauges: React.FC<QueuePressureGaugesProps> = ({ telemetry }) => {
  const critSize = telemetry?.criticalQueueSize || 0;
  const critCap = telemetry?.criticalQueueCapacity || 2000;
  const critPressure = Math.min(1, critSize / critCap);

  const highSize = telemetry?.highQueueSize || 0;
  const highCap = telemetry?.highQueueCapacity || 2000;
  const highPressure = Math.min(1, highSize / highCap);

  const lowSize = telemetry?.lowQueueSize || 0;
  const lowCap = telemetry?.lowQueueCapacity || 3000;
  const lowPressure = Math.min(1, lowSize / lowCap);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Critical Queue Gauge */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Critical Queue</h3>
                <span className="text-[11px] text-slate-400">Orders & Payments</span>
              </div>
            </div>
            <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              PROTECTED
            </span>
          </div>

          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-white">{critSize}</span>
            <span className="text-xs font-mono text-slate-400">Capacity: {critCap}</span>
          </div>

          {/* Progress Bar */}
          <div className="mt-2 w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${critPressure * 100}%` }}
            />
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>Shedding: <strong className="text-emerald-400">DISABLED</strong></span>
          <span>Pressure: {(critPressure * 100).toFixed(1)}%</span>
        </div>
      </div>

      {/* High Priority (Inventory) Queue Gauge */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">High Queue</h3>
                <span className="text-[11px] text-slate-400">Inventory State</span>
              </div>
            </div>
            <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
              TIER 2
            </span>
          </div>

          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-white">{highSize}</span>
            <span className="text-xs font-mono text-slate-400">Capacity: {highCap}</span>
          </div>

          <div className="mt-2 w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-cyan-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${highPressure * 100}%` }}
            />
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
          <span>Priority: Stream</span>
          <span>Pressure: {(highPressure * 100).toFixed(1)}%</span>
        </div>
      </div>

      {/* Low Priority Queue Gauge (Adaptive Backpressure Target) */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">
                <Eye className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Low Priority Queue</h3>
                <span className="text-[11px] text-slate-400">Clicks & Application Logs</span>
              </div>
            </div>
            <span className="text-xs font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
              ADAPTIVE
            </span>
          </div>

          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-white">{lowSize}</span>
            <span className="text-xs font-mono text-slate-400">Capacity: {lowCap}</span>
          </div>

          {/* Progress Bar with threshold markers */}
          <div className="mt-2 w-full bg-slate-800 rounded-full h-2 relative overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                lowPressure >= 0.80
                  ? 'bg-rose-500'
                  : lowPressure >= 0.55
                  ? 'bg-amber-500'
                  : lowPressure >= 0.25
                  ? 'bg-blue-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${lowPressure * 100}%` }}
            />
          </div>
        </div>

        {/* Threshold Markers Legend */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span title="T1: Batch at 25%">T1 Batch: 25%</span>
          <span title="T2: Defer at 55%">T2 Defer: 55%</span>
          <span title="T3: Shed at 80%" className="text-rose-400 font-semibold">T3 Shed: 80%</span>
        </div>
      </div>
    </div>
  );
};
