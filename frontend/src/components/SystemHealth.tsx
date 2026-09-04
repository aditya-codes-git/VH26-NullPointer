import React from 'react';
import { Server, Cpu, HardDrive, Wifi } from 'lucide-react';

export const SystemHealth: React.FC = () => {
  return (
    <section className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-slate-600">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-slate-400" />
          <span>Backend Link: <strong className="text-emerald-600">Ready</strong></span>
        </div>

        <div className="flex items-center gap-2">
          <Wifi className="w-4 h-4 text-slate-400" />
          <span>Transport: <strong className="text-slate-800">WebSocket / REST</strong></span>
        </div>

        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-slate-400" />
          <span>Worker Pool: <strong className="text-slate-800">2 Cores Dedicated</strong></span>
        </div>

        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-slate-400" />
          <span>Queue Mode: <strong className="text-emerald-600">In-Memory Bounded</strong></span>
        </div>
      </div>
    </section>
  );
};
