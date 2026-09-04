import React, { useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

export const App: React.FC = () => {
  // State variables for interactive simulation matching Stitch UI specifications
  const [simulatorMode, setSimulatorMode] = useState<'NORMAL' | 'SPIKE' | 'STOPPED'>('NORMAL');
  const [systemState, setSystemState] = useState<'NORMAL' | 'PRESSURED' | 'OVERLOADED' | 'EXTREME'>('NORMAL');
  const [processingMode, setProcessingMode] = useState<'STREAM' | 'BATCH' | 'DEFER' | 'SHED'>('STREAM');

  // Traffic metrics
  const [incomingRate, setIncomingRate] = useState('1,000');
  const [throughputRate, setThroughputRate] = useState('950');
  const [queuePressure, setQueuePressure] = useState(12);

  // Critical event protection metrics
  const [criticalReceived, setCriticalReceived] = useState('1,250');
  const [criticalProcessed, setCriticalProcessed] = useState('1,225');
  const [criticalQueued, setCriticalQueued] = useState('25');
  const [criticalLost] = useState(0); // Invariant: Always 0

  // Priority lanes queue depths
  const [critQueueDepth, setCritQueueDepth] = useState('25');
  const [highQueueDepth, setHighQueueDepth] = useState('140');
  const [lowQueueDepth, setLowQueueDepth] = useState('2,340');

  // Latency chart history data
  const [latencyData, setLatencyData] = useState([
    { time: '10:42:00', critical: 15, nonCritical: 18 },
    { time: '10:42:05', critical: 14, nonCritical: 22 },
    { time: '10:42:10', critical: 15, nonCritical: 25 },
    { time: '10:42:15', critical: 16, nonCritical: 42 },
    { time: '10:42:20', critical: 15, nonCritical: 78 },
    { time: '10:42:25', critical: 15, nonCritical: 115 },
    { time: '10:42:30', critical: 14, nonCritical: 140 },
    { time: '10:42:35', critical: 15, nonCritical: 195 },
    { time: '10:42:40', critical: 16, nonCritical: 230 },
    { time: '10:42:45', critical: 15, nonCritical: 175 },
    { time: '10:42:50', critical: 14, nonCritical: 85 },
    { time: '10:42:55', critical: 15, nonCritical: 30 },
  ]);

  // Decision log entries
  const [decisionLogs, setDecisionLogs] = useState([
    {
      id: '1',
      type: 'Checkout_Complete',
      priority: 'CRITICAL',
      strategy: 'STREAM',
      reason: 'Standard priority routing',
      timestamp: '10:42:01.450',
    },
    {
      id: '2',
      type: 'Payment_Authorization',
      priority: 'CRITICAL',
      strategy: 'STREAM',
      reason: 'Dedicated transaction path',
      timestamp: '10:42:01.448',
    },
    {
      id: '3',
      type: 'Inventory_Update',
      priority: 'HIGH',
      strategy: 'STREAM',
      reason: 'Standard routing',
      timestamp: '10:42:01.442',
    },
    {
      id: '4',
      type: 'Page_View_Log',
      priority: 'LOW',
      strategy: 'DEFER',
      reason: 'Queue pressure > 60%',
      timestamp: '10:42:01.120',
    },
    {
      id: '5',
      type: 'User_Clickstream',
      priority: 'LOW',
      strategy: 'BATCH',
      reason: 'Grouped into micro-batch (25 items)',
      timestamp: '10:42:00.890',
    },
  ]);

  // Simulation Trigger Handlers
  const handleStartNormal = () => {
    setSimulatorMode('NORMAL');
    setSystemState('NORMAL');
    setProcessingMode('STREAM');
    setIncomingRate('1,000');
    setThroughputRate('950');
    setQueuePressure(12);
    setCritQueueDepth('25');
    setHighQueueDepth('140');
    setLowQueueDepth('180');
    setCriticalReceived('1,250');
    setCriticalProcessed('1,225');
    setCriticalQueued('25');
    setLatencyData((prev) => prev.map((item) => ({ ...item, nonCritical: Math.min(item.nonCritical, 35) })));
  };

  const handleTriggerSpike = () => {
    setSimulatorMode('SPIKE');
    setSystemState('PRESSURED');
    setProcessingMode('BATCH');
    setIncomingRate('20,000');
    setThroughputRate('18,500');
    setQueuePressure(74);
    setCritQueueDepth('18');
    setHighQueueDepth('210');
    setLowQueueDepth('2,340');
    setCriticalReceived('5,420');
    setCriticalProcessed('5,395');
    setCriticalQueued('25');
    setLatencyData((prev) =>
      prev.map((item, idx) => ({
        ...item,
        critical: 15,
        nonCritical: idx > 6 ? 180 + idx * 10 : item.nonCritical,
      }))
    );

    // Add spike log entry
    setDecisionLogs((prev) => [
      {
        id: Date.now().toString(),
        type: 'Flash_Sale_Click_Surge',
        priority: 'LOW',
        strategy: 'BATCH',
        reason: 'Spike rate ~20,000/min: micro-batching 25 events to preserve capacity',
        timestamp: new Date().toLocaleTimeString() + '.012',
      },
      ...prev.slice(0, 4),
    ]);
  };

  const handleReturnToNormal = () => {
    setSimulatorMode('NORMAL');
    setSystemState('NORMAL');
    setProcessingMode('STREAM');
    setIncomingRate('1,000');
    setThroughputRate('1,000');
    setQueuePressure(9);
    setCritQueueDepth('4');
    setHighQueueDepth('45');
    setLowQueueDepth('90');
    setCriticalReceived('6,800');
    setCriticalProcessed('6,795');
    setCriticalQueued('5');
    setLatencyData((prev) => prev.map((item) => ({ ...item, critical: 15, nonCritical: 20 })));
  };

  const handleStop = () => {
    setSimulatorMode('STOPPED');
  };

  const handleReset = () => {
    handleStartNormal();
  };

  return (
    <div className="bg-[#ffffff] text-[#131b2e] min-h-screen flex flex-col md:flex-row antialiased">
      {/* -------------------------------------------------- */}
      {/* Side Navigation (Stitch Design) */}
      {/* -------------------------------------------------- */}
      <aside className="hidden md:flex flex-col h-screen w-[260px] bg-[#ffffff] border-r border-[#e2e8f0] sticky top-0 p-4 gap-2 shrink-0 select-none">
        {/* Branding */}
        <div className="flex items-center gap-3 mb-6 px-2">
          <div className="h-8 w-8 rounded-lg bg-[#2563eb] flex items-center justify-center text-white font-bold text-sm shadow-xs">
            AO
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#131b2e] leading-tight">System Admin</h2>
            <p className="text-[11px] text-[#64748b]">Adaptive Ops</p>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 flex flex-col gap-1">
          {/* Active Tab: Dashboard */}
          <a
            className="flex items-center gap-3 px-3 py-2 bg-[#eaedff] text-[#004ac6] rounded-lg font-semibold text-xs transition-colors shadow-2xs"
            href="#"
          >
            <span className="material-symbols-outlined text-[20px]">dashboard</span>
            <span>Dashboard</span>
          </a>
          <a
            className="flex items-center gap-3 px-3 py-2 text-[#64748b] hover:bg-[#f8fafc] hover:text-[#131b2e] rounded-lg text-xs transition-colors"
            href="#"
          >
            <span className="material-symbols-outlined text-[20px]">analytics</span>
            <span>Analytics</span>
          </a>
          <a
            className="flex items-center gap-3 px-3 py-2 text-[#64748b] hover:bg-[#f8fafc] hover:text-[#131b2e] rounded-lg text-xs transition-colors"
            href="#"
          >
            <span className="material-symbols-outlined text-[20px]">hub</span>
            <span>Nodes</span>
          </a>
          <a
            className="flex items-center gap-3 px-3 py-2 text-[#64748b] hover:bg-[#f8fafc] hover:text-[#131b2e] rounded-lg text-xs transition-colors"
            href="#"
          >
            <span className="material-symbols-outlined text-[20px]">list_alt</span>
            <span>Logs</span>
          </a>
        </nav>

        {/* Bottom Actions */}
        <div className="mt-auto flex flex-col gap-1 border-t border-[#e2e8f0] pt-3">
          <button className="w-full bg-[#2563eb] text-white py-2 rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors shadow-xs">
            Deploy Patch
          </button>
          <a
            className="flex items-center gap-3 px-3 py-2 text-[#64748b] hover:bg-[#f8fafc] hover:text-[#131b2e] rounded-lg text-xs transition-colors"
            href="#"
          >
            <span className="material-symbols-outlined text-[18px]">help</span>
            <span>Support</span>
          </a>
          <a
            className="flex items-center gap-3 px-3 py-2 text-[#64748b] hover:bg-[#f8fafc] hover:text-[#131b2e] rounded-lg text-xs transition-colors"
            href="#"
          >
            <span className="material-symbols-outlined text-[18px]">description</span>
            <span>Documentation</span>
          </a>
        </div>
      </aside>

      {/* -------------------------------------------------- */}
      {/* Main Content Area (Stitch Design) */}
      {/* -------------------------------------------------- */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#faf8ff]">
        {/* Top App Bar */}
        <header className="flex justify-between items-center px-8 py-3 w-full sticky top-0 z-40 bg-white border-b border-[#e2e8f0] shadow-2xs">
          <div className="flex items-center gap-3">
            <button className="md:hidden text-[#64748b] p-1.5 hover:bg-[#f1f5f9] rounded-lg">
              <span className="material-symbols-outlined text-[20px]">menu</span>
            </button>
            <h1 className="text-lg font-bold text-[#004ac6] tracking-tight">Adaptive Pipeline</h1>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-[#64748b] p-1.5 hover:bg-[#f1f5f9] rounded-full transition-colors hidden sm:block">
              <span className="material-symbols-outlined text-[20px]">sensors</span>
            </button>
            <button className="text-[#64748b] p-1.5 hover:bg-[#f1f5f9] rounded-full transition-colors">
              <span className="material-symbols-outlined text-[20px]">settings</span>
            </button>
            <button className="text-[#64748b] p-1.5 hover:bg-[#f1f5f9] rounded-full transition-colors">
              <span className="material-symbols-outlined text-[20px]">account_circle</span>
            </button>
          </div>
        </header>

        {/* Main Canvas Padding */}
        <main className="flex-1 p-6 md:p-8 flex flex-col gap-6 max-w-7xl w-full mx-auto">
          {/* Section 1: Header / Status */}
          <section className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-xs">
            <div>
              <h2 className="text-2xl font-bold text-[#131b2e] tracking-tight mb-1">
                Adaptive Event-Processing Pipeline
              </h2>
              <p className="text-sm text-[#64748b]">
                Dynamic processing for sudden e-commerce traffic spikes
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5 items-center">
              {/* Live Badge */}
              <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-bold text-emerald-800 uppercase font-mono tracking-wider">
                  Live
                </span>
              </div>
              {/* System State */}
              <div className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-full text-xs text-slate-700 font-mono">
                System State: <span className="font-bold text-slate-900">{systemState}</span>
              </div>
              {/* Processing Mode */}
              <div className="px-3 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs text-blue-800 font-mono">
                Processing Mode: <span className="font-bold text-blue-900">{processingMode}</span>
              </div>
            </div>
          </section>

          {/* Section 2: Traffic Overview Cards */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-xs flex flex-col justify-between">
              <div className="flex justify-between items-center text-[#64748b]">
                <span className="text-xs font-semibold uppercase tracking-wider font-mono">Incoming Traffic</span>
                <span className="material-symbols-outlined text-[20px]">input</span>
              </div>
              <div className="text-2xl font-bold text-[#131b2e] font-mono mt-3">
                {incomingRate} <span className="text-xs font-normal text-[#64748b] font-sans">Events/min</span>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-xs flex flex-col justify-between">
              <div className="flex justify-between items-center text-[#64748b]">
                <span className="text-xs font-semibold uppercase tracking-wider font-mono">Worker Throughput</span>
                <span className="material-symbols-outlined text-[20px]">speed</span>
              </div>
              <div className="text-2xl font-bold text-blue-600 font-mono mt-3">
                {throughputRate} <span className="text-xs font-normal text-[#64748b] font-sans">Events/min</span>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-xs flex flex-col justify-between">
              <div className="flex justify-between items-center text-[#64748b]">
                <span className="text-xs font-semibold uppercase tracking-wider font-mono">Queue Pressure</span>
                <span className="material-symbols-outlined text-[20px]">queue</span>
              </div>
              <div className="text-2xl font-bold text-emerald-600 font-mono mt-3">
                {queuePressure}% <span className="text-xs font-normal text-[#64748b] font-sans">Capacity Used</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-3">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    queuePressure >= 80
                      ? 'bg-rose-500'
                      : queuePressure >= 55
                      ? 'bg-amber-500'
                      : queuePressure >= 25
                      ? 'bg-blue-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${queuePressure}%` }}
                />
              </div>
            </div>
          </section>

          {/* Section 3: Demo Controls */}
          <section className="bg-slate-50 p-6 rounded-xl border border-[#e2e8f0] shadow-xs">
            <h3 className="text-sm font-bold text-[#131b2e] uppercase font-mono tracking-wider mb-4">
              Simulation Controls
            </h3>
            <div className="flex flex-wrap gap-3 items-center">
              <button
                onClick={handleStartNormal}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-xs ${
                  simulatorMode === 'NORMAL'
                    ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Start Normal Load
              </button>

              <div className="relative group">
                <button
                  onClick={handleTriggerSpike}
                  className={`px-5 py-2 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 ${
                    simulatorMode === 'SPIKE'
                      ? 'bg-amber-600 text-white ring-4 ring-amber-200 animate-pulse'
                      : 'bg-amber-600 hover:bg-amber-700 text-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">local_fire_department</span>
                  Trigger 20x Spike
                </button>
                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 left-0 w-64 bg-slate-800 text-white text-[11px] p-2 rounded shadow-lg hidden group-hover:block z-20 pointer-events-none">
                  Suddenly increase traffic from ~1,000 to ~20,000 events/min
                </div>
              </div>

              <button
                onClick={handleReturnToNormal}
                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-100 transition-colors shadow-xs"
              >
                Return to Normal
              </button>

              <div className="flex-1" />

              <button
                onClick={handleStop}
                className="px-3.5 py-2 bg-white border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold hover:bg-rose-50 transition-colors shadow-xs flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">stop_circle</span> Stop
              </button>

              <button
                onClick={handleReset}
                className="px-3.5 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-100 transition-colors shadow-xs flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">restart_alt</span> Reset
              </button>
            </div>
          </section>

          {/* Section 4: Critical Event Protection (Hero Card) */}
          <section className="bg-white p-6 md:p-8 rounded-xl border-2 border-emerald-200 shadow-[0_4px_20px_-4px_rgba(16,185,129,0.12)] relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50/60 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined filled-icon text-emerald-500 text-3xl">
                    verified_user
                  </span>
                  <h3 className="text-xl font-bold text-[#131b2e]">Critical Event Protection</h3>
                </div>
                <p className="text-xs text-[#64748b]">Orders & Payments processing integrity monitor.</p>
                <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full w-max">
                  <span className="material-symbols-outlined text-emerald-700 text-[16px]">check_circle</span>
                  <span className="text-xs font-semibold text-emerald-800">Critical Events Protected</span>
                </div>
              </div>

              <div className="text-right flex flex-col items-end">
                <div className="text-xs font-bold font-mono text-[#64748b] uppercase tracking-wider mb-1">
                  CRITICAL LOST
                </div>
                <div className="text-6xl font-extrabold font-mono text-emerald-500 leading-none mb-3">
                  {criticalLost}
                </div>
                <div className="flex gap-4 bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs font-mono">
                  <div className="px-2 border-r border-slate-200">
                    <div className="text-[11px] text-slate-400">Received</div>
                    <div className="text-sm font-bold text-slate-800">{criticalReceived}</div>
                  </div>
                  <div className="px-2 border-r border-slate-200">
                    <div className="text-[11px] text-slate-400">Processed</div>
                    <div className="text-sm font-bold text-slate-800">{criticalProcessed}</div>
                  </div>
                  <div className="px-2">
                    <div className="text-[11px] text-slate-400">Queued</div>
                    <div className="text-sm font-bold text-emerald-600">{criticalQueued}</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Grid Layout for Remaining Sections (Stitch 12-Column Split) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Left Column (Wider: xl:col-span-8) */}
            <div className="xl:col-span-8 flex flex-col gap-6">
              {/* Section 5: Adaptive Progression */}
              <section className="bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-xs">
                <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-[#131b2e] uppercase font-mono tracking-wider">
                    Adaptive Engine State
                  </h3>
                  <div className="px-3 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700">
                    System State: {systemState} | Strategy:{' '}
                    <span className="text-blue-600 font-bold">{processingMode}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Stream */}
                  <div
                    className={`rounded-lg p-4 text-center transition-all ${
                      processingMode === 'STREAM'
                        ? 'bg-blue-50 border-2 border-blue-400 shadow-xs'
                        : 'bg-white border border-slate-200 opacity-60'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined mb-1 text-[22px] ${
                        processingMode === 'STREAM' ? 'text-blue-600' : 'text-slate-400'
                      }`}
                    >
                      water_drop
                    </span>
                    <div
                      className={`text-xs font-bold ${
                        processingMode === 'STREAM' ? 'text-blue-900' : 'text-slate-600'
                      }`}
                    >
                      STREAM
                    </div>
                    <div className="text-[10px] text-blue-700 mt-0.5">Real-time processing</div>
                  </div>

                  {/* Batch */}
                  <div
                    className={`rounded-lg p-4 text-center transition-all ${
                      processingMode === 'BATCH'
                        ? 'bg-blue-50 border-2 border-blue-400 shadow-xs'
                        : 'bg-white border border-slate-200 opacity-60'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined mb-1 text-[22px] ${
                        processingMode === 'BATCH' ? 'text-blue-600' : 'text-slate-400'
                      }`}
                    >
                      inventory_2
                    </span>
                    <div
                      className={`text-xs font-bold ${
                        processingMode === 'BATCH' ? 'text-blue-900' : 'text-slate-600'
                      }`}
                    >
                      BATCH
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Micro-batching</div>
                  </div>

                  {/* Defer */}
                  <div
                    className={`rounded-lg p-4 text-center transition-all ${
                      processingMode === 'DEFER'
                        ? 'bg-amber-50 border-2 border-amber-400 shadow-xs'
                        : 'bg-white border border-slate-200 opacity-60'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined mb-1 text-[22px] ${
                        processingMode === 'DEFER' ? 'text-amber-600' : 'text-slate-400'
                      }`}
                    >
                      schedule
                    </span>
                    <div
                      className={`text-xs font-bold ${
                        processingMode === 'DEFER' ? 'text-amber-900' : 'text-slate-600'
                      }`}
                    >
                      DEFER
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Held in buffer</div>
                  </div>

                  {/* Shed */}
                  <div
                    className={`rounded-lg p-4 text-center transition-all ${
                      processingMode === 'SHED'
                        ? 'bg-rose-50 border-2 border-rose-400 shadow-xs'
                        : 'bg-white border border-slate-200 opacity-60'
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined mb-1 text-[22px] ${
                        processingMode === 'SHED' ? 'text-rose-600' : 'text-slate-400'
                      }`}
                    >
                      delete
                    </span>
                    <div
                      className={`text-xs font-bold ${
                        processingMode === 'SHED' ? 'text-rose-900' : 'text-slate-600'
                      }`}
                    >
                      SHED
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Drop telemetry</div>
                  </div>
                </div>
              </section>

              {/* Section 7: Flow Control Topology (Stitch Visualizer) */}
              <section className="bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-xs flex flex-col">
                <h3 className="text-sm font-bold text-[#131b2e] uppercase font-mono tracking-wider mb-4">
                  Flow Control Topology
                </h3>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 flex items-center justify-center relative overflow-hidden">
                  <div className="flex items-center gap-4 w-full max-w-lg font-mono text-xs">
                    {/* Ingress */}
                    <div className="p-3 bg-white border border-slate-300 rounded-lg shadow-2xs text-center z-10 shrink-0 font-semibold text-slate-700">
                      Ingress<br />Traffic
                    </div>

                    {/* Arrow 1 */}
                    <div className="h-[2px] bg-slate-300 flex-1 relative">
                      <div className="absolute right-0 -mt-[4px] border-[5px] border-transparent border-l-slate-400" />
                    </div>

                    {/* Adaptive Engine */}
                    <div className="p-3 bg-blue-50 border border-blue-300 rounded-lg shadow-2xs text-center z-10 font-bold text-blue-800 shrink-0">
                      Adaptive<br />Engine
                    </div>

                    {/* Output Lines */}
                    <div className="flex flex-col gap-5 flex-1 relative">
                      {/* Critical Line (Emerald) */}
                      <div className="flex items-center w-full">
                        <div className="h-[2px] bg-emerald-500 w-full relative">
                          <div className="absolute right-0 -mt-[4px] border-[5px] border-transparent border-l-emerald-600" />
                        </div>
                      </div>
                      {/* Non-Critical Line */}
                      <div className="flex items-center w-full">
                        <div className="h-[2px] bg-slate-300 w-full relative">
                          <div className="absolute right-0 -mt-[4px] border-[5px] border-transparent border-l-slate-400" />
                        </div>
                      </div>
                    </div>

                    {/* Destination Nodes */}
                    <div className="flex flex-col gap-2 z-10 shrink-0">
                      <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold rounded shadow-2xs text-center text-[11px]">
                        Orders
                      </div>
                      <div className="px-3 py-1.5 bg-slate-100 border border-slate-300 text-slate-700 rounded shadow-2xs text-center text-[11px]">
                        Analytics
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Section 8: Processing Latency Chart (Stitch Chart) */}
              <section className="bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-xs flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-bold text-[#131b2e] uppercase font-mono tracking-wider">
                    Processing Latency
                  </h3>
                  <div className="flex gap-4 font-mono text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-1 bg-emerald-500 rounded" />
                      <span>Critical (~15ms)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-1 bg-purple-500 rounded" />
                      <span>Non-Critical</span>
                    </div>
                  </div>
                </div>

                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={latencyData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
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
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                      <Line
                        type="monotone"
                        dataKey="critical"
                        name="Critical (Orders/Payments)"
                        stroke="#10b981"
                        strokeWidth={2.5}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="nonCritical"
                        name="Non-Critical (Clicks/Logs)"
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
            </div>

            {/* Right Column (Narrower: xl:col-span-4) */}
            <div className="xl:col-span-4 flex flex-col gap-6">
              {/* Section 6: Priority Lanes */}
              <section className="bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-xs flex flex-col gap-4">
                <h3 className="text-sm font-bold text-[#131b2e] uppercase font-mono tracking-wider border-b border-slate-100 pb-2">
                  Priority Lanes
                </h3>

                {/* Tier 1 */}
                <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="text-xs font-mono font-bold text-emerald-700">Tier 1: CRITICAL</div>
                      <div className="text-xs text-slate-500">Orders &amp; Payments</div>
                    </div>
                    <div className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] uppercase font-bold tracking-wider font-mono">
                      Protected
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-3 font-mono">
                    <span className="text-xs text-slate-500">Queue Depth:</span>
                    <span className="text-lg font-bold text-slate-800">{critQueueDepth}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: '5%' }} />
                  </div>
                </div>

                {/* Tier 2 */}
                <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="text-xs font-mono font-bold text-blue-700">Tier 2: HIGH</div>
                      <div className="text-xs text-slate-500">Inventory</div>
                    </div>
                    <div className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] uppercase font-bold tracking-wider font-mono">
                      Tier 2
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-3 font-mono">
                    <span className="text-xs text-slate-500">Queue Depth:</span>
                    <span className="text-lg font-bold text-slate-800">{highQueueDepth}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: '25%' }} />
                  </div>
                </div>

                {/* Tier 3 */}
                <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="text-xs font-mono font-bold text-purple-700">Tier 3: LOW</div>
                      <div className="text-xs text-slate-500">Logs &amp; Analytics</div>
                    </div>
                    <div className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-[10px] uppercase font-bold tracking-wider font-mono">
                      Adaptive
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-3 font-mono">
                    <span className="text-xs text-slate-500">Queue Depth:</span>
                    <span className="text-lg font-bold text-slate-800">{lowQueueDepth}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(100, queuePressure)}%` }} />
                  </div>
                </div>
              </section>

              {/* Section 9: Global Capacity Limit & Flow Control */}
              <section className="bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-xs">
                <h3 className="text-sm font-bold text-[#131b2e] uppercase font-mono tracking-wider mb-1">
                  Global Capacity Limit
                </h3>
                <p className="text-xs text-[#64748b] mb-4">
                  When aggregate queue depth exceeds 80%, Tier 3 traffic is automatically deferred to batch processing.
                </p>
                <div className="relative w-full h-3 bg-slate-100 rounded-full overflow-hidden mb-2">
                  <div className="absolute top-0 left-0 h-full bg-emerald-400" style={{ width: '20%' }} />
                  <div className="absolute top-0 left-[20%] h-full bg-blue-400" style={{ width: '15%' }} />
                  <div className="absolute top-0 left-[35%] h-full bg-purple-400" style={{ width: `${queuePressure * 0.4}%` }} />
                  {/* Threshold marker (80%) */}
                  <div className="absolute top-0 left-[80%] h-full w-[2px] bg-rose-500 z-10" />
                </div>
                <div className="flex justify-between text-[11px] font-mono text-slate-500">
                  <span>0%</span>
                  <span className="text-rose-600 font-bold mr-[15%]">Threshold (80%)</span>
                  <span>100%</span>
                </div>
              </section>
            </div>
          </div>

          {/* Section 10: Activity Log (Data Table from Stitch) */}
          <section className="bg-white rounded-xl border border-[#e2e8f0] shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#131b2e] uppercase font-mono tracking-wider">
                Decision Log
              </h3>
              <span className="text-xs text-slate-400 font-mono">Recent routing audit entries</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 font-mono text-slate-600">
                    <th className="py-2.5 px-6 font-semibold">Event Type</th>
                    <th className="py-2.5 px-6 font-semibold">Priority</th>
                    <th className="py-2.5 px-6 font-semibold">Strategy</th>
                    <th className="py-2.5 px-6 font-semibold">Reason</th>
                    <th className="py-2.5 px-6 font-semibold text-right font-mono">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {decisionLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-6 font-semibold text-slate-800">{log.type}</td>
                      <td className="py-3 px-6">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                            log.priority === 'CRITICAL'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : log.priority === 'HIGH'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-purple-100 text-purple-800 border border-purple-200'
                          }`}
                        >
                          {log.priority}
                        </span>
                      </td>
                      <td className="py-3 px-6">
                        <span className="font-mono text-xs text-blue-600 font-bold">{log.strategy}</span>
                      </td>
                      <td className="py-3 px-6 text-slate-600 text-[11px]">{log.reason}</td>
                      <td className="py-3 px-6 text-slate-400 text-right font-mono text-xs">{log.timestamp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default App;
