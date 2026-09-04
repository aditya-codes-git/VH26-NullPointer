import React from 'react';
import { LatencyDataPoint } from '../types/dashboard.js';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { Clock } from 'lucide-react';

interface LatencyChartProps {
  data: LatencyDataPoint[];
}

export const LatencyChart: React.FC<LatencyChartProps> = ({ data }) => {
  const currentCritical = data.length > 0 ? data[data.length - 1].criticalLatency : 15;
  const currentNonCritical = data.length > 0 ? data[data.length - 1].nonCriticalLatency : 35;

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" />
            Processing Latency
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Critical vs Non-Critical Events (milliseconds)
          </p>
        </div>

        {/* Legend / Badges */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
            <span className="text-slate-600">Critical Events:</span>
            <span className="font-bold text-emerald-600">{currentCritical} ms</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-purple-500 inline-block" />
            <span className="text-slate-600">Non-Critical Events:</span>
            <span className="font-bold text-purple-600">{currentNonCritical} ms</span>
          </div>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} tickLine={false} />
            <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} unit="ms" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#ffffff',
                borderColor: '#cbd5e1',
                borderRadius: '8px',
                fontSize: '12px',
                fontFamily: 'monospace',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
            <Line
              type="monotone"
              dataKey="criticalLatency"
              name="Critical Events (Orders/Payments)"
              stroke="#10b981"
              strokeWidth={3}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="nonCriticalLatency"
              name="Non-Critical Events (Clicks/Logs)"
              stroke="#a855f7"
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};
