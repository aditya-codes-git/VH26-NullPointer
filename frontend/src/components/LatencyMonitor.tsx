import React, { useEffect, useState } from 'react';
import { TelemetrySnapshot } from '../types/telemetry.js';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { Timer } from 'lucide-react';

interface LatencyMonitorProps {
  telemetry: TelemetrySnapshot | null;
}

interface LatencyDataPoint {
  time: string;
  criticalP95: number;
  nonCriticalP95: number;
  criticalAvg: number;
  nonCriticalAvg: number;
}

export const LatencyMonitor: React.FC<LatencyMonitorProps> = ({ telemetry }) => {
  const [history, setHistory] = useState<LatencyDataPoint[]>([]);

  useEffect(() => {
    if (!telemetry) return;

    const timeStr = new Date(telemetry.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    setHistory((prev) => {
      const next = [
        ...prev,
        {
          time: timeStr,
          criticalP95: telemetry.criticalLatencyP95,
          nonCriticalP95: telemetry.nonCriticalLatencyP95,
          criticalAvg: telemetry.criticalLatencyAvg,
          nonCriticalAvg: telemetry.nonCriticalLatencyAvg,
        },
      ];
      // Keep last 30 data points (~15-30s window)
      return next.slice(-30);
    });
  }, [telemetry?.timestamp]);

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Timer className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Real-Time Latency Tracking (p95 & Average)</h3>
            <p className="text-[11px] text-slate-400">Critical orders/payments vs. non-critical telemetry latency</p>
          </div>
        </div>

        {/* Current Latency Badges */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
            <span className="text-slate-300">Critical p95:</span>
            <span className="font-bold text-emerald-400">{telemetry?.criticalLatencyP95 || 0} ms</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400 inline-block" />
            <span className="text-slate-300">Non-Critical p95:</span>
            <span className="font-bold text-purple-400">{telemetry?.nonCriticalLatencyP95 || 0} ms</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickLine={false} />
            <YAxis stroke="#64748b" fontSize={10} tickLine={false} unit="ms" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                borderColor: '#334155',
                borderRadius: '8px',
                fontSize: '12px',
                fontFamily: 'monospace',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
            <Line
              type="monotone"
              dataKey="criticalP95"
              name="Critical p95 (Orders/Payments)"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="nonCriticalP95"
              name="Non-Critical p95 (Clicks/Logs)"
              stroke="#a855f7"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
