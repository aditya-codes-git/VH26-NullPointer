import React from 'react';
import { Play, Flame, Square, RotateCcw } from 'lucide-react';

interface DemoControlsProps {
  currentMode?: 'STOPPED' | 'NORMAL' | 'SPIKE';
  onStartNormal?: () => void;
  onTriggerSpike?: () => void;
  onReturnToNormal?: () => void;
  onStop?: () => void;
  onReset?: () => void;
}

export const DemoControls: React.FC<DemoControlsProps> = ({
  currentMode = 'NORMAL',
  onStartNormal,
  onTriggerSpike,
  onReturnToNormal,
  onStop,
  onReset,
}) => {
  return (
    <section className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider font-mono flex items-center gap-2">
            <Flame className="w-4 h-4 text-rose-500" />
            Live Demo Simulation Controls
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Simulate flash-sale traffic spikes to observe real-time system adaptation and protection of critical events.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Start Normal Load */}
          <button
            onClick={onStartNormal}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold font-mono transition-all ${
              currentMode === 'NORMAL'
                ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-300'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
            }`}
          >
            <Play className="w-3.5 h-3.5 text-blue-600" />
            <span>Start Normal Load</span>
          </button>

          {/* Trigger 20x Spike (Most Prominent Button) */}
          <div className="flex flex-col items-center">
            <button
              onClick={onTriggerSpike}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold font-mono transition-all shadow-sm ${
                currentMode === 'SPIKE'
                  ? 'bg-rose-600 text-white ring-4 ring-rose-200 animate-pulse'
                  : 'bg-rose-600 hover:bg-rose-700 text-white'
              }`}
            >
              <Flame className="w-4 h-4 fill-white" />
              <span>Trigger 20× Spike</span>
            </button>
            <span className="text-[10px] text-slate-500 mt-1 font-sans">
              Suddenly increase traffic from ~1,000 to ~20,000 events/min.
            </span>
          </div>

          {/* Return to Normal */}
          <button
            onClick={onReturnToNormal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-mono font-medium transition-all"
          >
            <span>Return to Normal</span>
          </button>

          {/* Stop */}
          <button
            onClick={onStop}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-mono font-medium transition-all"
          >
            <Square className="w-3.5 h-3.5 text-amber-600" />
            <span>Stop</span>
          </button>

          {/* Reset */}
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200 text-xs font-mono font-medium transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>
    </section>
  );
};
