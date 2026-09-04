import React from 'react';
import { PriorityLaneData } from '../types/dashboard.js';
import { ShieldCheck, Layers, Eye } from 'lucide-react';

interface QueueCardProps {
  lanes: PriorityLaneData[];
}

export const QueueCard: React.FC<QueueCardProps> = ({ lanes }) => {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
      <div className="mb-5">
        <h2 className="text-base font-bold text-slate-900">Queue Capacity & Backlog Depth</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Real-time buffer utilization across dedicated memory queues.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {lanes.map((lane) => {
          const isCritical = lane.tier.includes('CRITICAL');
          const isHigh = lane.tier.includes('HIGH');

          let icon = <Eye className="w-4 h-4 text-purple-600" />;
          let barColor = 'bg-purple-500';

          if (isCritical) {
            icon = <ShieldCheck className="w-4 h-4 text-emerald-600" />;
            barColor = 'bg-emerald-500';
          } else if (isHigh) {
            icon = <Layers className="w-4 h-4 text-blue-600" />;
            barColor = 'bg-blue-500';
          } else if (lane.pressurePercent >= 80) {
            barColor = 'bg-rose-500';
          } else if (lane.pressurePercent >= 55) {
            barColor = 'bg-amber-500';
          }

          return (
            <div
              key={lane.name}
              className="border border-slate-200 rounded-xl p-5 bg-slate-50/40 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                  <div className="flex items-center gap-2">
                    {icon}
                    <h3 className="text-sm font-bold text-slate-900">{lane.name}</h3>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white border border-slate-200 font-semibold text-slate-700">
                    {isCritical ? 'PROTECTED' : 'BUFFERED'}
                  </span>
                </div>

                <div className="mt-4 flex items-baseline justify-between">
                  <span className="text-xs font-mono text-slate-500">Events Waiting:</span>
                  <span className="text-2xl font-bold font-mono text-slate-900">
                    {lane.queueCount.toLocaleString()}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between text-xs font-mono text-slate-500">
                  <span>Capacity:</span>
                  <span>{lane.capacity.toLocaleString()}</span>
                </div>

                <div className="mt-1 flex items-center justify-between text-xs font-mono text-slate-500">
                  <span>Pressure:</span>
                  <span className="font-semibold text-slate-800">{lane.pressurePercent}%</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-4 pt-3 border-t border-slate-200/60">
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${barColor}`}
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
