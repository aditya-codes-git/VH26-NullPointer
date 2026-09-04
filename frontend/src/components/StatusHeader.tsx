import React from 'react';
import { TelemetrySnapshot } from '../types/telemetry.js';
import { Zap, Flame } from 'lucide-react';

interface StatusHeaderProps {
  telemetry: TelemetrySnapshot | null;
  connected: boolean;
}

export const StatusHeader: React.FC<StatusHeaderProps> = ({ telemetry, connected }) => {
  const strategy = telemetry?.activeStrategy || 'STREAM';
  const state = telemetry?.systemPressureState || 'NORMAL';

  const getStrategyBadge = () => {
    switch (strategy) {
      case 'STREAM':
        return {
          bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
          dot: 'bg-emerald-400',
          label: 'STREAM (Direct Individual)',
        };
      case 'BATCH':
        return {
          bg: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
          dot: 'bg-blue-400 animate-pulse',
          label: 'BATCH (Micro-Batching Active)',
        };
      case 'DEFER':
        return {
          bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
          dot: 'bg-amber-400 animate-ping',
          label: 'DEFER (Low-Priority Held)',
        };
      case 'SHED':
        return {
          bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
          dot: 'bg-rose-500 animate-ping',
          label: 'SHED (Policy Overload Shedding)',
        };
    }
  };

  const getPressureBadge = () => {
    switch (state) {
      case 'NORMAL':
        return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
      case 'PRESSURED':
        return 'text-blue-400 border-blue-500/30 bg-blue-500/10';
      case 'OVERLOADED':
        return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
      case 'EXTREME':
        return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
    }
  };

  const badge = getStrategyBadge();

  return (
    <header className="bg-slate-900/60 border-b border-slate-800 backdrop-blur-md px-6 py-4">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Title and Tagline */}
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 border border-blue-500/30 rounded-lg text-blue-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Adaptive Event-Processing Pipeline
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  Hackathon MVP
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Dynamic prioritization & backpressure protection for e-commerce flash sales
              </p>
            </div>
          </div>
        </div>

        {/* Live Metrics Header Badges */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Active Mode Badge */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border font-mono text-xs font-semibold ${badge.bg}`}>
            <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
            <span>MODE: {badge.label}</span>
          </div>

          {/* System State Badge */}
          <div className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono font-medium ${getPressureBadge()}`}>
            STATE: {state}
          </div>

          {/* Admission Backpressure Indicator */}
          {telemetry?.backpressureActive && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-950/50 border border-red-500/40 text-red-400 text-xs font-mono animate-pulse">
              <Flame className="w-3.5 h-3.5" />
              <span>ADMISSION BACKPRESSURE ACTIVE</span>
            </div>
          )}

          {/* Connection Status */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono pl-2 border-l border-slate-800">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            {connected ? 'LIVE WS' : 'DISCONNECTED'}
          </div>
        </div>
      </div>
    </header>
  );
};
