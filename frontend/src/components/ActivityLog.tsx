import React from 'react';
import { PipelineDecisionEntry } from '../types/dashboard.js';
import { FileText } from 'lucide-react';

interface ActivityLogProps {
  decisions: PipelineDecisionEntry[];
}

export const ActivityLog: React.FC<ActivityLogProps> = ({ decisions }) => {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-600" />
            Recent Pipeline Decisions
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit trail of routing and strategy decisions made per event.
          </p>
        </div>

        <div className="text-xs font-mono text-slate-400">
          Showing {decisions.length} recent decisions
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[11px] border-b border-slate-200">
            <tr>
              <th className="py-2.5 px-3">Time</th>
              <th className="py-2.5 px-3">Event Type</th>
              <th className="py-2.5 px-3">Priority</th>
              <th className="py-2.5 px-3">Decision</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3">Reason / Context</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {decisions.map((entry) => {
              const isCritical = entry.priority === 'CRITICAL';
              const isShed = entry.decision === 'SHED';
              const isBatch = entry.decision === 'BATCH';
              const isDefer = entry.decision === 'DEFER';

              let decisionBadge = 'bg-emerald-100 text-emerald-800';
              if (isShed) decisionBadge = 'bg-rose-100 text-rose-800 font-bold';
              else if (isDefer) decisionBadge = 'bg-amber-100 text-amber-800 font-bold';
              else if (isBatch) decisionBadge = 'bg-blue-100 text-blue-800 font-bold';

              return (
                <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 px-3 text-slate-400">{entry.time}</td>
                  <td className="py-2.5 px-3 font-bold text-slate-800">{entry.type}</td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isCritical
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {entry.priority}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] ${decisionBadge}`}>
                      → {entry.decision}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-700">{entry.status}</td>
                  <td className="py-2.5 px-3 text-slate-500 text-[11px] font-sans">{entry.reason}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
