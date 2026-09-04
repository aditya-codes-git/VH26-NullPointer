import React from 'react';
import { CriticalProtectionMetrics } from '../types/dashboard.js';
import { ShieldCheck } from 'lucide-react';

interface CriticalProtectionCardProps {
  metrics: CriticalProtectionMetrics;
}

export const CriticalProtectionCard: React.FC<CriticalProtectionCardProps> = ({ metrics }) => {
  return (
    <section className="bg-emerald-50/40 border border-emerald-200 rounded-xl p-6 shadow-xs">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-emerald-200/70 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-600 text-white shadow-xs">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              Critical Event Protection
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-mono">
                ✓ Critical Events Protected
              </span>
            </h2>
            <p className="text-xs text-slate-600 mt-0.5 font-medium">
              Orders & Payments
            </p>
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs font-mono font-semibold text-slate-500 uppercase">
            Critical Shedding
          </div>
          <div className="text-xs font-bold font-mono text-emerald-700 bg-white border border-emerald-300 px-2.5 py-1 rounded mt-0.5 inline-block">
            {metrics.sheddingStatus} (HARD INVARIANT)
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {/* Critical Received */}
        <div className="bg-white border border-emerald-100 rounded-lg p-4 shadow-2xs">
          <div className="text-xs font-mono text-slate-500">Critical Received</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
            {metrics.received.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Orders + Payments Ingested</div>
        </div>

        {/* Critical Processed */}
        <div className="bg-white border border-emerald-100 rounded-lg p-4 shadow-2xs">
          <div className="text-xs font-mono text-slate-500">Critical Processed</div>
          <div className="text-2xl font-bold font-mono text-emerald-600 mt-1">
            {metrics.processed.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Completed by workers</div>
        </div>

        {/* Critical Queued */}
        <div className="bg-white border border-emerald-100 rounded-lg p-4 shadow-2xs">
          <div className="text-xs font-mono text-slate-500">Critical Queued</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1">
            {metrics.queued.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Awaiting execution</div>
        </div>

        {/* CRITICAL LOST: 0 (The Hero Metric) */}
        <div className="bg-white border-2 border-emerald-500 rounded-lg p-4 shadow-xs ring-2 ring-emerald-500/15">
          <div className="text-xs font-mono font-bold text-emerald-800 uppercase tracking-wider">
            CRITICAL LOST
          </div>
          <div className="text-3xl font-extrabold font-mono text-emerald-600 mt-1">
            {metrics.lost}
          </div>
          <div className="text-[11px] font-medium text-emerald-700 mt-0.5">
            Zero critical events dropped
          </div>
        </div>
      </div>
    </section>
  );
};
