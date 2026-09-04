import React from 'react';
import { TrafficMetrics } from '../types/dashboard.js';

interface TrafficOverviewProps {
  metrics: TrafficMetrics;
}

export const TrafficOverview: React.FC<TrafficOverviewProps> = ({ metrics }) => {
  const getPressureColor = (pressure: number) => {
    if (pressure >= 80) return 'bg-rose-500';
    if (pressure >= 55) return 'bg-amber-500';
    if (pressure >= 25) return 'bg-blue-500';
    return 'bg-emerald-500';
  };

  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* 1. Incoming Traffic */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
        <div>
          <span className="text-xs font-semibold font-mono text-slate-500 uppercase tracking-wider">
            INCOMING TRAFFIC
          </span>
          <div className="mt-2 text-3xl font-bold font-mono text-slate-900 flex items-baseline gap-2">
            <span>{metrics.incomingTraffic}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Total ingestion arrival rate</p>
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-mono">
          <span>Instantaneous Arrival:</span>
          <span className="font-semibold text-slate-700">{metrics.incomingEventsPerSec} Events/sec</span>
        </div>
      </div>

      {/* 2. Worker Throughput */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
        <div>
          <span className="text-xs font-semibold font-mono text-slate-500 uppercase tracking-wider">
            WORKER THROUGHPUT
          </span>
          <div className="mt-2 text-3xl font-bold font-mono text-emerald-600 flex items-baseline gap-2">
            <span>{metrics.workerThroughput}</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Processed rate across worker pool</p>
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-mono">
          <span>Processing Velocity:</span>
          <span className="font-semibold text-emerald-600">{metrics.workerEventsPerSec} Events/sec</span>
        </div>
      </div>

      {/* 3. Queue Pressure */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
        <div>
          <span className="text-xs font-semibold font-mono text-slate-500 uppercase tracking-wider">
            QUEUE PRESSURE
          </span>
          <div className="mt-2 text-3xl font-bold font-mono text-slate-900 flex items-baseline gap-2">
            <span>{metrics.queuePressurePercent}%</span>
            <span className="text-sm font-normal text-slate-500 font-sans">Capacity Used</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Backlog vs total buffer capacity</p>
        </div>

        {/* Visual Progress Bar */}
        <div className="mt-4">
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${getPressureColor(metrics.queuePressurePercent)}`}
              style={{ width: `${Math.min(100, Math.max(2, metrics.queuePressurePercent))}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
};
