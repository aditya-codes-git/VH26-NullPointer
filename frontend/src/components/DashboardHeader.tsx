import React from 'react';
import { SystemState, ProcessingStrategy } from '../types/dashboard.js';
import { Zap } from 'lucide-react';

interface DashboardHeaderProps {
  systemState?: SystemState;
  processingMode?: ProcessingStrategy;
  isLive?: boolean;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  systemState = 'NORMAL',
  processingMode = 'STREAM',
  isLive = true,
}) => {
  const getStateBadgeStyle = () => {
    switch (systemState) {
      case 'NORMAL':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'PRESSURED':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'OVERLOADED':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'EXTREME':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'RECOVERING':
        return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getModeBadgeStyle = () => {
    switch (processingMode) {
      case 'STREAM':
        return 'bg-emerald-600 text-white';
      case 'BATCH':
        return 'bg-blue-600 text-white';
      case 'DEFER':
        return 'bg-amber-600 text-white';
      case 'SHED':
        return 'bg-rose-600 text-white';
      default:
        return 'bg-slate-600 text-white';
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Project Branding */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              Adaptive Event-Processing Pipeline
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                Hackathon Prototype
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              "Dynamic processing for sudden e-commerce traffic spikes"
            </p>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Live Indicator */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 font-mono text-xs font-medium border border-slate-200">
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            <span>{isLive ? '● LIVE' : 'OFFLINE'}</span>
          </div>

          {/* System State Indicator */}
          <div className={`px-3 py-1.5 rounded-lg border text-xs font-semibold font-mono ${getStateBadgeStyle()}`}>
            System State: {systemState}
          </div>

          {/* Processing Mode Indicator */}
          <div className={`px-3.5 py-1.5 rounded-lg text-xs font-bold font-mono shadow-xs ${getModeBadgeStyle()}`}>
            Processing Mode: {processingMode}
          </div>
        </div>
      </div>
    </header>
  );
};
