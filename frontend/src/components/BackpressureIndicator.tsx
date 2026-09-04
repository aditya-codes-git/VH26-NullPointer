import React from 'react';
import { Gauge, HelpCircle } from 'lucide-react';

interface BackpressureIndicatorProps {
  isActive?: boolean;
}

export const BackpressureIndicator: React.FC<BackpressureIndicatorProps> = ({ isActive = false }) => {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
        <div className="flex items-center gap-2">
          <Gauge className="w-5 h-5 text-blue-600" />
          <h2 className="text-base font-bold text-slate-900">Flow Control & Admission Safety</h2>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <HelpCircle className="w-4 h-4 text-slate-400" />
          <span>"Slows or controls incoming work when the pipeline is under pressure."</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col justify-between">
          <div className="text-xs font-mono font-semibold text-slate-500 uppercase">Step 1</div>
          <div className="text-sm font-bold text-slate-800 mt-1">Queue Pressure Increases</div>
          <p className="text-xs text-slate-500 mt-1">
            Backlog builds up during flash-sale 20× surges.
          </p>
        </div>

        <div className={`p-3.5 rounded-lg border flex flex-col justify-between ${
          isActive
            ? 'bg-amber-50 border-amber-300 text-amber-900'
            : 'bg-slate-50 border-slate-200 text-slate-700'
        }`}>
          <div className="text-xs font-mono font-semibold text-slate-500 uppercase">Step 2</div>
          <div className="text-sm font-bold mt-1">Pipeline Controls Influx</div>
          <p className="text-xs mt-1 text-slate-500">
            Signals producers to pace ingestion and avoid memory explosion.
          </p>
        </div>

        <div className="p-3.5 rounded-lg bg-emerald-50/50 border border-emerald-200 flex flex-col justify-between">
          <div className="text-xs font-mono font-semibold text-emerald-800 uppercase">Step 3</div>
          <div className="text-sm font-bold text-emerald-900 mt-1">Capacity Protected</div>
          <p className="text-xs text-emerald-700 mt-1">
            Critical compute threads remain uncompromised.
          </p>
        </div>
      </div>
    </section>
  );
};
