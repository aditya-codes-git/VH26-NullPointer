import React from 'react';
import { ShedLogEntry } from '../types/telemetry.js';
import { FileText, ShieldAlert } from 'lucide-react';

interface ShedAuditLogProps {
  logs: ShedLogEntry[];
}

export const ShedAuditLog: React.FC<ShedAuditLogProps> = ({ logs }) => {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex flex-col h-72">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Shedding Audit Log (Live Telemetry)</h3>
            <p className="text-[11px] text-slate-400">
              Only non-critical clicks/logs are dropped during extreme backpressure; never silent
            </p>
          </div>
        </div>

        <div className="text-xs font-mono text-slate-400">
          Showing last {logs.length} logged drops
        </div>
      </div>

      <div className="flex-1 overflow-y-auto mt-2 font-mono text-xs divide-y divide-slate-800/60">
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-1">
            <ShieldAlert className="w-5 h-5 text-slate-600" />
            <span>No events shed. Pipeline operating within safe capacity.</span>
          </div>
        ) : (
          logs.map((log) => {
            const timeStr = new Date(log.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              fractionalSecondDigits: 3,
            } as any);

            return (
              <div key={log.id} className="py-2 flex items-center justify-between text-slate-300 hover:bg-slate-800/30 px-1 rounded transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-slate-500 text-[11px]">{timeStr}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-950/60 border border-rose-500/30 text-rose-300">
                    {log.type}
                  </span>
                  <span className="text-slate-400 text-xs truncate max-w-xs">{log.eventId}</span>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-amber-400/90">{log.reason}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
