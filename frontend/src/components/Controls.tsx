import React, { useState } from 'react';
import { Play, Flame, Square, RotateCcw, BarChart3, Loader2 } from 'lucide-react';
import {
  triggerStart,
  triggerSpike,
  triggerStop,
  triggerReset,
} from '../services/socketClient.js';
import { TelemetrySnapshot } from '../types/telemetry.js';

interface ControlsProps {
  telemetry: TelemetrySnapshot | null;
  onOpenBenchmark: () => void;
}

export const Controls: React.FC<ControlsProps> = ({ telemetry, onOpenBenchmark }) => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const handleAction = async (name: string, action: () => Promise<any>) => {
    try {
      setLoadingAction(name);
      await action();
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const mode = telemetry?.simulatorMode || 'STOPPED';

  return (
    <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
      {/* Rate telemetry indicators */}
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Incoming Traffic</div>
          <div className="text-xl font-bold font-mono text-white flex items-baseline gap-1.5">
            {telemetry?.incomingRatePerSec || 0}
            <span className="text-xs font-normal text-slate-400">evt/s</span>
            <span className="text-xs text-blue-400 font-mono pl-1">
              ({((telemetry?.incomingRatePerMin || 0)).toLocaleString()}/min)
            </span>
          </div>
        </div>

        <div className="h-8 w-[1px] bg-slate-800 hidden sm:block" />

        <div>
          <div className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Worker Throughput</div>
          <div className="text-xl font-bold font-mono text-emerald-400 flex items-baseline gap-1.5">
            {telemetry?.throughputPerSec || 0}
            <span className="text-xs font-normal text-slate-400">evt/s</span>
            <span className="text-xs text-emerald-500/80 font-mono pl-1">
              ({((telemetry?.throughputPerMin || 0)).toLocaleString()}/min)
            </span>
          </div>
        </div>
      </div>

      {/* Simulator Control Action Buttons */}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          onClick={() => handleAction('normal', triggerStart)}
          disabled={loadingAction !== null}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold font-mono transition-all ${
            mode === 'NORMAL'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 ring-1 ring-blue-400'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
          }`}
        >
          {loadingAction === 'normal' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 text-blue-400" />}
          <span>Normal (1,000/min)</span>
        </button>

        <button
          onClick={() => handleAction('spike', triggerSpike)}
          disabled={loadingAction !== null}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold font-mono transition-all ${
            mode === 'SPIKE'
              ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg shadow-rose-600/30 ring-1 ring-rose-400 animate-pulse'
              : 'bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-800/60'
          }`}
        >
          {loadingAction === 'spike' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flame className="w-3.5 h-3.5 text-rose-400" />}
          <span>Trigger 20× Spike</span>
        </button>

        <button
          onClick={() => handleAction('stop', triggerStop)}
          disabled={loadingAction !== null || mode === 'STOPPED'}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 border border-slate-700 text-xs font-mono font-medium transition-all"
        >
          <Square className="w-3.5 h-3.5 text-amber-400" />
          <span>Stop</span>
        </button>

        <button
          onClick={() => handleAction('reset', triggerReset)}
          disabled={loadingAction !== null}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 text-xs font-mono font-medium transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>

        <button
          onClick={onOpenBenchmark}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-mono font-semibold transition-all ml-2"
        >
          <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
          <span>Benchmark vs Naive</span>
        </button>
      </div>
    </div>
  );
};
