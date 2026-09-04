import React from 'react';

interface ProcessingCountersProps {
  counters: {
    totalProcessed: number;
    criticalProcessed: number;
    nonCriticalProcessed: number;
    batchedCount: number;
    deferredCount: number;
    shedCount: number;
  };
}

export const ProcessingCounters: React.FC<ProcessingCountersProps> = ({ counters }) => {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
      <div className="mb-5">
        <h2 className="text-base font-bold text-slate-900">Pipeline Processing Counters</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Cumulative accounting of events processed, batched, deferred, and shed.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* 1. Critical Processed */}
        <div className="border border-emerald-200 bg-emerald-50/30 rounded-xl p-4 shadow-2xs">
          <div className="text-[11px] font-mono font-bold text-emerald-800 uppercase tracking-wider">
            Critical Processed
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">
            {counters.criticalProcessed.toLocaleString()}
          </div>
          <div className="text-[10px] text-emerald-600 mt-0.5">Orders & Payments</div>
        </div>

        {/* 2. Total Processed */}
        <div className="border border-slate-200 bg-white rounded-xl p-4 shadow-2xs">
          <div className="text-[11px] font-mono font-semibold text-slate-500 uppercase tracking-wider">
            Total Processed
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
            {counters.totalProcessed.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">All streams combined</div>
        </div>

        {/* 3. Non-Critical Processed */}
        <div className="border border-slate-200 bg-white rounded-xl p-4 shadow-2xs">
          <div className="text-[11px] font-mono font-semibold text-slate-500 uppercase tracking-wider">
            Non-Critical Processed
          </div>
          <div className="text-2xl font-bold font-mono text-slate-800 mt-1">
            {counters.nonCriticalProcessed.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Telemetry & Logs</div>
        </div>

        {/* 4. Micro-Batched */}
        <div className="border border-blue-200 bg-blue-50/20 rounded-xl p-4 shadow-2xs">
          <div className="text-[11px] font-mono font-semibold text-blue-700 uppercase tracking-wider">
            Micro-Batched
          </div>
          <div className="text-2xl font-bold font-mono text-blue-600 mt-1">
            {counters.batchedCount.toLocaleString()}
          </div>
          <div className="text-[10px] text-blue-500 mt-0.5">Amortized execution</div>
        </div>

        {/* 5. Deferred */}
        <div className="border border-amber-200 bg-amber-50/20 rounded-xl p-4 shadow-2xs">
          <div className="text-[11px] font-mono font-semibold text-amber-700 uppercase tracking-wider">
            Deferred Work
          </div>
          <div className="text-2xl font-bold font-mono text-amber-600 mt-1">
            {counters.deferredCount.toLocaleString()}
          </div>
          <div className="text-[10px] text-amber-600 mt-0.5">Temporarily held</div>
        </div>

        {/* 6. Controlled Shedding */}
        <div className="border border-rose-200 bg-rose-50/20 rounded-xl p-4 shadow-2xs">
          <div className="text-[11px] font-mono font-semibold text-rose-700 uppercase tracking-wider">
            Controlled Shedding
          </div>
          <div className="text-2xl font-bold font-mono text-rose-600 mt-1">
            {counters.shedCount.toLocaleString()}
          </div>
          <div className="text-[10px] text-rose-500 mt-0.5">Permitted non-critical</div>
        </div>
      </div>
    </section>
  );
};
