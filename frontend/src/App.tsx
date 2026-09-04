import React, { useEffect, useState } from 'react';
import { TelemetrySnapshot } from './types/telemetry.js';
import { initSocket } from './services/socketClient.js';
import { StatusHeader } from './components/StatusHeader.js';
import { Controls } from './components/Controls.js';
import { QueuePressureGauges } from './components/QueuePressureGauges.js';
import { LatencyMonitor } from './components/LatencyMonitor.js';
import { AccountingCard } from './components/AccountingCard.js';
import { ShedAuditLog } from './components/ShedAuditLog.js';
import { BenchmarkModal } from './components/BenchmarkModal.js';

export const App: React.FC = () => {
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [isBenchmarkOpen, setIsBenchmarkOpen] = useState(false);

  useEffect(() => {
    const cleanup = initSocket((data) => {
      setTelemetry(data);
      setConnected(true);
    });

    return cleanup;
  }, []);

  return (
    <div className="min-h-screen bg-[#080c14] flex flex-col selection:bg-blue-600 selection:text-white pb-12">
      {/* 1. Header with live mode badge & system status */}
      <StatusHeader telemetry={telemetry} connected={connected} />

      {/* Main Container */}
      <main className="max-w-7xl w-full mx-auto px-6 mt-6 flex flex-col gap-6">
        {/* 2. Controls Panel (Normal 1k, Spike 20k, Stop, Benchmark) */}
        <Controls
          telemetry={telemetry}
          onOpenBenchmark={() => setIsBenchmarkOpen(true)}
        />

        {/* 3. Mathematical Accounting Card (Proving Critical Lost = 0) */}
        <AccountingCard telemetry={telemetry} />

        {/* 4. Queue Pressure Gauges (Critical, High, Low with T1, T2, T3 markers) */}
        <QueuePressureGauges telemetry={telemetry} />

        {/* 5. Real-Time Latency Tracking (Critical vs Non-Critical p95/avg) */}
        <LatencyMonitor telemetry={telemetry} />

        {/* 6. Shedding Audit Log Feed */}
        <ShedAuditLog logs={telemetry?.recentShedEvents || []} />
      </main>

      {/* Benchmark Modal */}
      <BenchmarkModal
        isOpen={isBenchmarkOpen}
        onClose={() => setIsBenchmarkOpen(false)}
      />
    </div>
  );
};

export default App;
