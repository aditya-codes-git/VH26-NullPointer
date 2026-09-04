import React from 'react';
import { PriorityLaneData } from '../types/dashboard.js';
import { ShieldCheck, Layers, Eye } from 'lucide-react';

interface PriorityLanesProps {
  lanes: PriorityLaneData[];
}

export const PriorityLanes: React.FC<PriorityLanesProps> = ({ lanes }) => {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
      <div className="mb-5">
        <h2 className="text-base font-bold text-slate-900">Priority Lanes</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          "Don't process every event equally — process what matters first."
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {lanes.map((lane) => {
          const isCritical = lane.tier.includes('CRITICAL');
          const isHigh = lane.tier.includes('HIGH');

          let borderColor = 'border-purple-200';
          let bgColor = 'bg-purple-50/20';
          let badgeColor = 'bg-purple-100 text-purple-700 border-purple-200';
          let icon = <Eye className="w-4 h-4 text-purple-600" />;

          if (isCritical) {
            borderColor = 'border-emerald-300 ring-1 ring-emerald-500/20';
            bgColor = 'bg-emerald-50/30';
            badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
            icon = <ShieldCheck className="w-4 h-4 text-emerald-600" />;
          } else if (isHigh) {
            borderColor = 'border-blue-200';
            bgColor = 'bg-blue-50/20';
            badgeColor = 'bg-blue-100 text-blue-700 border-blue-200 font-medium';
            icon = <Layers className="w-4 h-4 text-blue-600" />;
          }

          return (
            <div
              key={lane.tier}
              className={`border ${borderColor} ${bgColor} rounded-xl p-5 flex flex-col justify-between shadow-2xs`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-200/80">
                  <div>
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      {icon}
                      {lane.tier}
                    </span>
                    <h3 className="text-base font-bold text-slate-900 mt-1">{lane.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{lane.description}</p>
                  </div>

                  <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${badgeColor}`}>
                    {lane.status}
                  </span>
                </div>

                <div className="mt-4">
                  <div className="text-xs text-slate-500 font-medium">Processing Strategy:</div>
                  <div className="text-xs font-semibold text-slate-800 font-mono mt-0.5">
                    {lane.processingMode}
                  </div>
                </div>

                <div className="mt-4 flex items-baseline justify-between">
                  <span className="text-xs font-mono text-slate-600">Events Waiting:</span>
                  <span className="text-2xl font-bold font-mono text-slate-900">
                    {lane.queueCount.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Lane capacity bar */}
              <div className="mt-4 pt-3 border-t border-slate-200/80">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 mb-1.5">
                  <span>Lane Pressure:</span>
                  <span className="font-semibold text-slate-700">{lane.pressurePercent}%</span>
                </div>
                <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isCritical
                        ? 'bg-emerald-500'
                        : isHigh
                        ? 'bg-blue-500'
                        : lane.pressurePercent >= 80
                        ? 'bg-rose-500'
                        : 'bg-purple-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(2, lane.pressurePercent))}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
