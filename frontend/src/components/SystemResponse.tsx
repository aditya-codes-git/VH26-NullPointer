import React from 'react';
import { Flame, CheckCircle2 } from 'lucide-react';

export const SystemResponse: React.FC = () => {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
      <div className="mb-5">
        <h2 className="text-base font-bold text-slate-900">System Response Flow</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          How the pipeline differentiates between normal steady state and sudden flash-sale spikes.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Flow 1: Normal Load */}
        <div className="border border-slate-200 bg-slate-50/50 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <h3 className="text-xs font-bold font-mono text-slate-800 uppercase tracking-wider">
              1. Normal Load Scenario
            </h3>
          </div>

          <div className="my-4 flex flex-col gap-2.5 font-mono text-xs">
            <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-slate-700 flex items-center justify-between">
              <span>Traffic Rate:</span>
              <strong className="text-slate-900">~1,000 events/min</strong>
            </div>
            <div className="text-center text-slate-400">↓</div>
            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between">
              <span>Strategy:</span>
              <strong>STREAM (Individual)</strong>
            </div>
            <div className="text-center text-slate-400">↓</div>
            <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-slate-600 flex items-center justify-between">
              <span>Outcome:</span>
              <span>Nominal latency across all streams</span>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-200">
            Workers easily process incoming events as they arrive without queue congestion.
          </div>
        </div>

        {/* Flow 2: 20x Flash-Sale Spike */}
        <div className="border border-rose-200 bg-rose-50/20 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center gap-2 pb-2 border-b border-rose-200">
            <Flame className="w-4 h-4 text-rose-600" />
            <h3 className="text-xs font-bold font-mono text-rose-800 uppercase tracking-wider">
              2. 20× Flash-Sale Spike Scenario
            </h3>
          </div>

          <div className="my-4 flex flex-col gap-2.5 font-mono text-xs">
            <div className="p-2.5 rounded-lg bg-white border border-rose-200 text-slate-700 flex items-center justify-between">
              <span>Sudden Traffic:</span>
              <strong className="text-rose-600 font-bold">~20,000 events/min</strong>
            </div>
            <div className="text-center text-slate-400">↓</div>
            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between">
              <span>Adaptive Engine:</span>
              <strong>Batch / Defer / Shed Clicks & Logs</strong>
            </div>
            <div className="text-center text-slate-400">↓</div>
            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 flex items-center justify-between font-bold">
              <span>Critical Events:</span>
              <span className="flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                100% Protected (Zero Loss)
              </span>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 pt-2 border-t border-rose-200">
            Low-priority telemetry is degraded gracefully so business-critical transactions stay fast.
          </div>
        </div>
      </div>
    </section>
  );
};
