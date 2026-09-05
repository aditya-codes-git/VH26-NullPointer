import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  Zap,
  Layers,
  Clock,
  ShieldAlert,
  RefreshCw,
  CopyX,
  ShoppingCart,
  Ticket,
  Truck,
  CreditCard,
  Activity,
} from 'lucide-react';

/* ==========================================================================
   1. TRUST & VALUE STRIP
   ========================================================================== */
export const TrustStrip: React.FC = () => {
  const values = [
    '1K → 20K+ events/min',
    'Adaptive processing',
    'Priority-aware routing',
    'Controlled load shedding',
    'Real-time observability',
  ];

  return (
    <section className="py-8 bg-slate-50/70 dark:bg-[#0d1117]/80 border-y border-slate-200 dark:border-slate-800/80 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            <span>Built for burst-heavy workloads</span>
          </div>
          <div className="flex flex-wrap items-center justify-center md:justify-end gap-2 sm:gap-3">
            {values.map((v, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-white dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-2xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                {v}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

/* ==========================================================================
   2. PROBLEM SECTION (Traditional vs AdaptiFlow)
   ========================================================================== */
export const ProblemSection: React.FC = () => {
  return (
    <section id="problem" className="py-20 sm:py-28 bg-white dark:bg-[#080a0d] transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mb-16 text-left">
          <h2 className="text-xs font-mono uppercase tracking-widest text-blue-600 dark:text-blue-400 font-semibold mb-3">
            The Scaling Paradox
          </h2>
          <p className="text-3xl sm:text-4xl font-extrabold text-slate-950 dark:text-white tracking-tight leading-tight">
            Traffic spikes expose a hidden problem.
          </p>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
            Conventional architectures respond to surges by scaling every workload uniformly. When a sudden 10x burst hits, downstream databases lock up, infrastructure bills skyrocket, and critical checkout orders fail alongside trivial background clicks.
          </p>
        </div>

        {/* Side-by-Side Comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* TRADITIONAL APPROACH */}
          <div className="rounded-2xl p-6 sm:p-8 bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 mb-6">
              <span className="text-sm font-mono uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400">
                Traditional Approach
              </span>
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/50">
                Fragile & Costly
              </span>
            </div>

            <div className="space-y-4">
              {[
                { title: 'Traffic Spike Ingestion', desc: 'Ingests all events into single homogeneous queues without priority separation.' },
                { title: 'Scale Everything', desc: 'Over-provisions all workers uniformly, leading to 4x–10x cloud infrastructure waste.' },
                { title: 'Database Contention', desc: 'Heavy telemetry queries compete for locks against payment and order transactions.' },
                { title: 'Catastrophic Cascading Drop', desc: 'Under extreme pressure, high-value orders fail randomly while trivial views succeed.' },
              ].map((step, idx) => (
                <div key={idx} className="flex items-start gap-3.5 p-3.5 rounded-xl bg-white dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800">
                  <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-950/70 text-red-600 dark:text-red-400 flex items-center justify-center font-mono text-xs font-bold shrink-0 mt-0.5">
                    ✕
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{step.title}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ADAPTIFLOW APPROACH */}
          <div className="rounded-2xl p-6 sm:p-8 bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/60 shadow-md relative overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-blue-200 dark:border-blue-900/60 mb-6">
              <span className="text-sm font-mono uppercase font-bold tracking-wider text-blue-700 dark:text-blue-400">
                AdaptiFlow Engine
              </span>
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                Resilient & Efficient
              </span>
            </div>

            <div className="space-y-4">
              {[
                { title: 'Classify by Business Importance', desc: 'Ingestion gateway instantly partitions traffic into Critical, High, and Low queues.' },
                { title: 'Protect Critical Events', desc: 'Orders and payments receive guaranteed stream processing and dedicated worker slots.' },
                { title: 'Adapt Processing Strategy', desc: 'Automatically transitions secondary traffic from Streaming to dynamic Batching & Deferral.' },
                { title: 'Controlled Policy-Driven Shedding', desc: 'Explicitly sheds non-critical telemetry during saturation with full audit logging.' },
              ].map((step, idx) => (
                <div key={idx} className="flex items-start gap-3.5 p-3.5 rounded-xl bg-white dark:bg-[#0d1117] border border-blue-100 dark:border-blue-900/40">
                  <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900 dark:text-slate-100">{step.title}</div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ==========================================================================
   3. PRODUCT DIFFERENTIATOR (4 Core Modes)
   ========================================================================== */
export const ProductDifferentiator: React.FC = () => {
  const modes = [
    {
      title: 'STREAM',
      badge: 'Zero Latency',
      badgeColor: 'text-blue-600 bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800',
      icon: Zap,
      desc: 'Process events immediately when pressure is low. Every item flows straight to active workers with sub-15ms execution latency.',
      metric: '< 15ms latency',
      useCase: 'Orders, payments, authentications',
    },
    {
      title: 'BATCH',
      badge: 'High Throughput',
      badgeColor: 'text-slate-700 bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700',
      icon: Layers,
      desc: 'Group non-critical work into micro-batches when throughput matters more than individual latency, optimizing CPU and DB IOPS.',
      metric: '50–100x batch efficiency',
      useCase: 'Inventory sync, notification queue',
    },
    {
      title: 'DEFER',
      badge: 'Backpressure Relief',
      badgeColor: 'text-amber-700 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800',
      icon: Clock,
      desc: 'Intentionally hold lower-priority work in bounded queues during temporary spikes while protecting higher-priority business traffic.',
      metric: 'Smooth burst absorption',
      useCase: 'Product catalog cache updates, reviews',
    },
    {
      title: 'CONTROLLED SHED',
      badge: 'Admission Control',
      badgeColor: 'text-red-700 bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800',
      icon: ShieldAlert,
      desc: 'Reject excess low-priority workload explicitly when system capacity is fully saturated. Never silently drop data—all sheds are audited.',
      metric: '100% audited rejection',
      useCase: 'Telemetry pings, search impressions, click logs',
    },
  ];

  return (
    <section id="features" className="py-20 sm:py-28 bg-slate-50/50 dark:bg-[#0d1117]/50 border-y border-slate-200/80 dark:border-slate-800/80 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-left max-w-3xl mb-16">
          <h2 className="text-xs font-mono uppercase tracking-widest text-blue-600 dark:text-blue-400 font-semibold mb-3">
            Core Architecture
          </h2>
          <p className="text-3xl sm:text-4xl font-extrabold text-slate-950 dark:text-white tracking-tight">
            One pipeline. Multiple responses.
          </p>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
            Instead of a rigid single processing policy, AdaptiFlow dynamically shifts strategies per priority queue based on real-time system backpressure.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {modes.map((mode, i) => {
            const Icon = mode.icon;
            return (
              <div
                key={i}
                className="flex flex-col justify-between p-6 rounded-2xl bg-white dark:bg-[#11161c] border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-700 transition-all duration-200 group"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className={`px-2.5 py-0.5 text-[11px] font-mono font-medium rounded-full border ${mode.badgeColor}`}>
                      {mode.badge}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight mb-2">
                    {mode.title}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
                    {mode.desc}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500 uppercase">Target</div>
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-0.5">{mode.useCase}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

/* ==========================================================================
   4. PRIORITY SYSTEM (Not every event deserves the same treatment)
   ========================================================================== */
export const PrioritySystemSection: React.FC = () => {
  const queues = [
    {
      level: 'CRITICAL',
      name: 'Orders & Financial Transactions',
      accent: 'border-blue-500/80 bg-blue-50/50 dark:bg-blue-950/20',
      badge: 'Protected • Zero Loss',
      badgeColor: 'bg-blue-600 text-white',
      items: ['Checkout Payments', 'Customer Orders', 'Inventory Commitments', 'Security Auth'],
      policy: 'Stream-first execution. Never dropped or deferred. Dedicated worker reservation prevents starvation.',
    },
    {
      level: 'HIGH',
      name: 'Catalog & Inventory Updates',
      accent: 'border-slate-400/80 bg-slate-50 dark:bg-slate-900/30',
      badge: 'Priority Execution',
      badgeColor: 'bg-slate-700 text-white',
      items: ['Stock Adjustments', 'Price Syncing', 'Notification Dispatch', 'Order Status Tracking'],
      policy: 'Stream under normal conditions; shifts into dynamic micro-batching under pressure. Protected from shedding.',
    },
    {
      level: 'LOW',
      name: 'User Clicks & Telemetry Logs',
      accent: 'border-amber-400/80 bg-amber-50/40 dark:bg-amber-950/20',
      badge: 'Adaptive Elastic',
      badgeColor: 'bg-amber-600 text-white',
      items: ['Product Impressions', 'Search Clicks', 'Client Logs', 'Analytics Heartbeats'],
      policy: 'Adaptive batching, intentional deferral, and controlled load shedding when queue capacity reaches limits.',
    },
  ];

  return (
    <section id="product" className="py-20 sm:py-28 bg-white dark:bg-[#080a0d] transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-left max-w-3xl mb-16">
          <h2 className="text-xs font-mono uppercase tracking-widest text-blue-600 dark:text-blue-400 font-semibold mb-3">
            Priority-Aware Architecture
          </h2>
          <p className="text-3xl sm:text-4xl font-extrabold text-slate-950 dark:text-white tracking-tight">
            Not every event deserves the same treatment.
          </p>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
            By enforcing strict multi-lane isolation, AdaptiFlow prevents high-volume telemetry from degrading high-value transactional workflows.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {queues.map((q, idx) => (
            <div
              key={idx}
              className={`rounded-2xl p-6 sm:p-8 border ${q.accent} shadow-sm flex flex-col justify-between transition-all`}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className={`px-2.5 py-1 text-xs font-mono font-bold rounded-md ${q.badgeColor}`}>
                    {q.level}
                  </span>
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 font-mono">
                    Lane {idx + 1}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight mb-2">
                  {q.name}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
                  {q.policy}
                </p>

                <div className="space-y-2 mb-6">
                  <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                    Supported Event Types
                  </span>
                  {q.items.map((item, itemIdx) => (
                    <div key={itemIdx} className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-600" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200/80 dark:border-slate-800 text-xs font-mono text-slate-500">
                Isolation: Independent Bounded Ring Buffer
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ==========================================================================
   5. REAL-TIME ADAPTATION TIMELINE
   ========================================================================== */
export const RealTimeAdaptationSection: React.FC = () => {
  const [selectedStage, setSelectedStage] = useState<number>(1);

  const stages = [
    {
      name: 'NORMAL',
      range: '0% – 40% Pressure',
      strategy: 'STREAM ALL',
      desc: 'Full streaming mode across all priority queues. Minimal latency, baseline worker capacity.',
      workers: '2 Active Workers',
      criticalStatus: 'STREAM (12ms)',
      highStatus: 'STREAM (15ms)',
      lowStatus: 'STREAM (18ms)',
      color: 'border-emerald-500 text-emerald-600',
    },
    {
      name: 'PRESSURED',
      range: '40% – 70% Pressure',
      strategy: 'STREAM + BATCH',
      desc: 'Traffic volume increases. High and Low queues transition to micro-batching to conserve database IOPS.',
      workers: '4 Active Workers',
      criticalStatus: 'STREAM (14ms)',
      highStatus: 'BATCH (50 items)',
      lowStatus: 'BATCH (100 items)',
      color: 'border-blue-500 text-blue-600',
    },
    {
      name: 'OVERLOADED',
      range: '70% – 90% Pressure',
      strategy: 'STREAM + BATCH + DEFER',
      desc: 'Sustained peak pressure. Low queue is intentionally deferred while Critical and High lanes clear.',
      workers: '6 Active Workers',
      criticalStatus: 'STREAM (18ms)',
      highStatus: 'BATCH (50 items)',
      lowStatus: 'DEFERRED (Paused)',
      color: 'border-amber-500 text-amber-600',
    },
    {
      name: 'EXTREME',
      range: '90% – 100% Pressure',
      strategy: 'DEFER + CONTROLLED SHED',
      desc: 'Capacity exhaustion. Low queue undergoes policy-driven load shedding with full auditing to safeguard payments.',
      workers: '8 Peak Workers',
      criticalStatus: 'STREAM (Protected)',
      highStatus: 'DEFERRED',
      lowStatus: 'POLICY SHED (Audited)',
      color: 'border-red-500 text-red-600',
    },
  ];

  return (
    <section id="how-it-works" className="py-20 sm:py-28 bg-slate-50/50 dark:bg-[#0d1117]/50 border-y border-slate-200/80 dark:border-slate-800/80 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-left max-w-3xl mb-16">
          <h2 className="text-xs font-mono uppercase tracking-widest text-blue-600 dark:text-blue-400 font-semibold mb-3">
            Dynamic State Engine
          </h2>
          <p className="text-3xl sm:text-4xl font-extrabold text-slate-950 dark:text-white tracking-tight">
            The pipeline adapts as pressure changes.
          </p>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
            AdaptiFlow continuously evaluates queue pressure, worker utilization, and latency metrics instead of relying on a single fixed processing mode.
          </p>
        </div>

        {/* Interactive State Bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {stages.map((stage, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedStage(idx)}
              className={`p-4 rounded-xl text-left border transition-all ${
                selectedStage === idx
                  ? 'bg-white dark:bg-[#11161c] border-blue-600 shadow-md ring-2 ring-blue-600/20'
                  : 'bg-white/70 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="text-xs font-mono text-slate-400 dark:text-slate-500 uppercase">{stage.range}</div>
              <div className="text-base font-bold text-slate-900 dark:text-white mt-1">{stage.name}</div>
              <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mt-0.5">{stage.strategy}</div>
            </button>
          ))}
        </div>

        {/* Detail Panel of Selected Stage */}
        <div className="rounded-2xl p-6 sm:p-8 bg-white dark:bg-[#11161c] border border-slate-200 dark:border-slate-800 shadow-lg">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-6 border-b border-slate-100 dark:border-slate-800 gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-slate-950 dark:text-white">
                  {stages[selectedStage].name} REGIME
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-mono font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                  {stages[selectedStage].range}
                </span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 max-w-2xl">
                {stages[selectedStage].desc}
              </p>
            </div>
            <div className="px-4 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 font-mono text-sm font-bold text-slate-800 dark:text-slate-200 shrink-0">
              {stages[selectedStage].workers}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60">
              <span className="text-xs font-mono uppercase font-bold text-blue-700 dark:text-blue-400">
                Critical Queue
              </span>
              <div className="text-base font-bold text-slate-900 dark:text-white mt-1">
                {stages[selectedStage].criticalStatus}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
              <span className="text-xs font-mono uppercase font-bold text-slate-600 dark:text-slate-400">
                High Queue
              </span>
              <div className="text-base font-bold text-slate-900 dark:text-white mt-1">
                {stages[selectedStage].highStatus}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50">
              <span className="text-xs font-mono uppercase font-bold text-amber-700 dark:text-amber-400">
                Low Queue
              </span>
              <div className="text-base font-bold text-slate-900 dark:text-white mt-1">
                {stages[selectedStage].lowStatus}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ==========================================================================
   6. DYNAMIC WORKER SCALING (Scale capacity when required)
   ========================================================================== */
export const DynamicScalingSection: React.FC = () => {
  return (
    <section className="py-20 sm:py-28 bg-white dark:bg-[#080a0d] transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6 text-left">
            <h2 className="text-xs font-mono uppercase tracking-widest text-blue-600 dark:text-blue-400 font-semibold mb-3">
              Elastic Compute Management
            </h2>
            <p className="text-3xl sm:text-4xl font-extrabold text-slate-950 dark:text-white tracking-tight">
              Scale capacity when the workload actually requires it.
            </p>
            <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
              Worker capacity expands during sustained backpressure and scales back down when demand falls, eliminating unnecessary cloud compute spend while guaranteeing high-throughput processing.
            </p>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Adaptive processing and dynamic worker scaling are independent, complementary mechanisms: strategy adapts in milliseconds, while workers scale smoothly without thrashing.
            </p>
          </div>

          <div className="lg:col-span-6">
            <div className="p-6 sm:p-8 rounded-2xl bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-slate-800 shadow-md">
              <div className="mb-6 pb-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-slate-600 dark:text-slate-400 font-bold">
                  Worker Lifecycle Simulation
                </span>
                <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                  Cooldown Protected
                </span>
              </div>

              {/* Scale Up Flow */}
              <div className="mb-6">
                <span className="text-xs font-mono uppercase text-blue-600 dark:text-blue-400 font-bold block mb-3">
                  Sustained Pressure Surge → Scale Up
                </span>
                <div className="grid grid-cols-4 gap-2 text-center font-mono">
                  {['2 Workers', '4 Workers', '6 Workers', '8 Workers'].map((step, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60">
                      <div className="text-xs font-bold text-blue-700 dark:text-blue-300">{step}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Stage {i + 1}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Scale Down Flow */}
              <div>
                <span className="text-xs font-mono uppercase text-slate-600 dark:text-slate-400 font-bold block mb-3">
                  Queues Normalized → Cooldown Scale Down
                </span>
                <div className="grid grid-cols-4 gap-2 text-center font-mono">
                  {['8 Workers', '6 Workers', '4 Workers', '2 Workers'].map((step, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{step}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Stage {i + 1}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ==========================================================================
   7. RELIABILITY SECTION (Fault Tolerance & Duplicate Detection)
   ========================================================================== */
export const ReliabilitySection: React.FC = () => {
  return (
    <section className="py-20 sm:py-28 bg-slate-50/50 dark:bg-[#0d1117]/50 border-y border-slate-200/80 dark:border-slate-800/80 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-left max-w-3xl mb-16">
          <h2 className="text-xs font-mono uppercase tracking-widest text-blue-600 dark:text-blue-400 font-semibold mb-3">
            System Reliability & Integrity
          </h2>
          <p className="text-3xl sm:text-4xl font-extrabold text-slate-950 dark:text-white tracking-tight">
            Engineered for fault tolerance and business integrity.
          </p>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
            Designed to prevent duplicate business transactions and ensure graceful recovery from transient worker failures without corrupting downstream databases.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Targeted Retries */}
          <div className="p-6 sm:p-8 rounded-2xl bg-white dark:bg-[#11161c] border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <RefreshCw className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Fault-Tolerant Targeted Retries
              </h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
              When a worker crashes or encounters downstream database timeout, the event enters a bounded retry queue with exponential backoff and jitter rather than failing immediately.
            </p>

            {/* Visual flow */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-xs font-mono space-y-2">
              <div className="text-slate-700 dark:text-slate-300">
                EVENT → <span className="text-red-500">WORKER FAILURE</span> → TARGETED RETRY → IDEMPOTENCY CHECK → <span className="text-emerald-500">SUCCESS</span>
              </div>
            </div>
          </div>

          {/* Duplicate Detection */}
          <div className="p-6 sm:p-8 rounded-2xl bg-white dark:bg-[#11161c] border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <CopyX className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Duplicate Ingestion Shield
              </h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
              Prevents duplicate business effects from client re-transmissions or network retries through sliding-window cryptographic signature checks.
            </p>

            {/* Visual flow */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-xs font-mono space-y-2">
              <div className="text-slate-700 dark:text-slate-300">
                EXTERNAL DUPLICATE → SLIDING WINDOW DETECTOR → <span className="text-amber-500">BLOCKED (Audit Logged)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ==========================================================================
   8. EXPLAINABLE DECISION ENGINE
   ========================================================================== */
export const DecisionEngineSection: React.FC = () => {
  return (
    <section className="py-20 sm:py-28 bg-white dark:bg-[#080a0d] transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-left max-w-3xl mb-16">
          <h2 className="text-xs font-mono uppercase tracking-widest text-blue-600 dark:text-blue-400 font-semibold mb-3">
            Operational Intelligence
          </h2>
          <p className="text-3xl sm:text-4xl font-extrabold text-slate-950 dark:text-white tracking-tight">
            Every adaptation has a reason.
          </p>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
            AdaptiFlow uses an explainable multi-factor decision engine. Operators can clearly inspect the exact operational factors that pushed the pipeline toward batching, deferral, or load shedding.
          </p>
        </div>

        <div className="p-6 sm:p-8 rounded-2xl bg-slate-50 dark:bg-[#0d1117] border border-slate-200 dark:border-slate-800 shadow-md">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {[
              { label: 'Queue Pressure', value: '88%' },
              { label: 'Worker Utilization', value: '92%' },
              { label: 'Processing Latency', value: '46ms' },
              { label: 'Batch Size', value: '50 items' },
              { label: 'Cost Factor', value: 'Normal' },
              { label: 'Event Priority', value: 'LOW' },
            ].map((factor, i) => (
              <div key={i} className="p-3 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-center">
                <div className="text-[11px] font-mono text-slate-500 uppercase">{factor.label}</div>
                <div className="text-sm font-mono font-bold text-slate-900 dark:text-white mt-1">{factor.value}</div>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-mono uppercase tracking-wider font-bold text-blue-700 dark:text-blue-400">
                Decision Explanation
              </div>
              <div className="text-sm text-slate-700 dark:text-slate-300 mt-1">
                "High queue pressure (88%) and worker saturation (92%) pushed the system to <span className="font-semibold text-slate-900 dark:text-white">DEFER</span> lower-priority telemetry in order to maintain sub-15ms execution for critical checkout orders."
              </div>
            </div>
            <span className="px-3 py-1 rounded-md bg-amber-500 text-white font-mono text-xs font-bold shrink-0">
              STRATEGY: DEFER
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ==========================================================================
   9. OBSERVABILITY SECTION (Product Preview)
   ========================================================================== */
export const ObservabilityPreview: React.FC<{ onViewDemo: () => void }> = ({ onViewDemo }) => {
  return (
    <section className="py-20 sm:py-28 bg-slate-50/50 dark:bg-[#0d1117]/50 border-y border-slate-200/80 dark:border-slate-800/80 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div className="text-left max-w-2xl">
            <h2 className="text-xs font-mono uppercase tracking-widest text-blue-600 dark:text-blue-400 font-semibold mb-3">
              Full-Spectrum Visibility
            </h2>
            <p className="text-3xl sm:text-4xl font-extrabold text-slate-950 dark:text-white tracking-tight">
              Real-time observability without overhead.
            </p>
            <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
              Track throughput, queue latency, active workers, and shed audits live over WebSockets or query historical execution runs stored in Supabase PostgreSQL.
            </p>
          </div>
          <button
            onClick={onViewDemo}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/20 transition-all self-start md:self-end"
          >
            <span>Explore the platform</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Dashboard Preview Mockup */}
        <div className="rounded-2xl bg-white dark:bg-[#11161c] border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
          {/* Top Bar */}
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-400/80" />
              <span className="w-3 h-3 rounded-full bg-amber-400/80" />
              <span className="w-3 h-3 rounded-full bg-emerald-400/80" />
              <span className="ml-3 text-xs font-mono text-slate-500 dark:text-slate-400">
                AdaptiFlow Live Telemetry Control Deck
              </span>
            </div>
            <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Socket.IO Connected
            </span>
          </div>

          {/* Metric Cards Row */}
          <div className="p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 border-b border-slate-100 dark:border-slate-800">
            {[
              { label: 'Incoming Rate', val: '18,450/min', sub: '+142% surge' },
              { label: 'Processing Rate', val: '18,420/min', sub: 'Healthy throughput' },
              { label: 'Queue Pressure', val: '64%', sub: 'Dynamic batching' },
              { label: 'Active Workers', val: '6 of 8', sub: 'Auto-scaled' },
              { label: 'Retries', val: '12', sub: 'Targeted recovery' },
              { label: 'Duplicates', val: '84', sub: 'Shielded' },
            ].map((m, i) => (
              <div key={i} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800">
                <div className="text-[11px] font-mono text-slate-400 uppercase">{m.label}</div>
                <div className="text-base font-bold font-mono text-slate-900 dark:text-white mt-1">{m.val}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{m.sub}</div>
              </div>
            ))}
          </div>

          {/* Event Table Preview */}
          <div className="p-6 overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase">
                  <th className="pb-3 font-semibold">Event ID</th>
                  <th className="pb-3 font-semibold">Type</th>
                  <th className="pb-3 font-semibold">Priority</th>
                  <th className="pb-3 font-semibold">Strategy</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-300">
                {[
                  { id: 'evt_984f1a', type: 'PAYMENT_AUTH', pri: 'CRITICAL', strat: 'STREAM', status: 'PROCESSED', lat: '11ms', badge: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60' },
                  { id: 'evt_742b3c', type: 'ORDER_COMMIT', pri: 'CRITICAL', strat: 'STREAM', status: 'PROCESSED', lat: '14ms', badge: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60' },
                  { id: 'evt_221c9e', type: 'INVENTORY_RESERVE', pri: 'HIGH', strat: 'BATCH', status: 'BATCHED', lat: '38ms', badge: 'text-blue-600 bg-blue-50 dark:bg-blue-950/60' },
                  { id: 'evt_009f4d', type: 'VIEW_TELEMETRY', pri: 'LOW', strat: 'CONTROLLED_SHED', status: 'SHED', lat: '2ms', badge: 'text-amber-600 bg-amber-50 dark:bg-amber-950/60' },
                ].map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors">
                    <td className="py-3 font-bold text-slate-900 dark:text-white">{row.id}</td>
                    <td className="py-3">{row.type}</td>
                    <td className="py-3 font-semibold">{row.pri}</td>
                    <td className="py-3">{row.strat}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${row.badge}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="py-3">{row.lat}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ==========================================================================
   10. USE CASES SECTION
   ========================================================================== */
export const UseCasesSection: React.FC = () => {
  const cases = [
    {
      title: 'Flash Sales',
      icon: ShoppingCart,
      desc: 'Handle sudden 50x–100x traffic surges during high-demand product drops. Checkout and payment events stay sub-15ms while catalog clicks are micro-batched.',
    },
    {
      title: 'Ticketing Releases',
      icon: Ticket,
      desc: 'Protect seat reservations and payment authorization queues during massive concert and sports ticket on-sales without crashing database connection pools.',
    },
    {
      title: 'Quick Commerce',
      icon: Truck,
      desc: 'Prioritize real-time driver dispatch, inventory deduction, and customer order workflows during extreme mealtime and festival surge hours.',
    },
    {
      title: 'Payment & Fintech',
      icon: CreditCard,
      desc: 'Guarantee transaction-critical order state with strict idempotency and targeted retries while controlling secondary analytics and telemetry ingestion.',
    },
  ];

  return (
    <section id="use-cases" className="py-20 sm:py-28 bg-white dark:bg-[#080a0d] transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-left max-w-3xl mb-16">
          <h2 className="text-xs font-mono uppercase tracking-widest text-blue-600 dark:text-blue-400 font-semibold mb-3">
            Industry Applications
          </h2>
          <p className="text-3xl sm:text-4xl font-extrabold text-slate-950 dark:text-white tracking-tight">
            Engineered for high-consequence traffic.
          </p>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
            Leading engineering organizations use AdaptiFlow to decouple business survivability from brute-force cloud infrastructure scaling.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {cases.map((c, i) => {
            const Icon = c.icon;
            return (
              <div
                key={i}
                className="p-6 rounded-2xl bg-slate-50 dark:bg-[#11161c] border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-600 transition-all shadow-sm"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight mb-2">
                  {c.title}
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {c.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

/* ==========================================================================
   11. COMPARISON MATRIX (Why AdaptiFlow)
   ========================================================================== */
export const ComparisonMatrix: React.FC = () => {
  const rows = [
    { cap: 'Priority-aware queue routing', trad: false, af: true },
    { cap: 'Adaptive dynamic batching', trad: false, af: true },
    { cap: 'Controlled policy-driven shedding', trad: false, af: true },
    { cap: 'Dynamic worker pool scaling', trad: 'Slow / Manual', af: true },
    { cap: 'Fault-tolerant targeted retries', trad: false, af: true },
    { cap: 'Duplicate detection & idempotency', trad: 'Custom code', af: true },
    { cap: 'Explainable adaptation decisions', trad: false, af: true },
    { cap: 'Real-time telemetry & audit history', trad: 'Partial', af: true },
  ];

  return (
    <section className="py-20 sm:py-28 bg-slate-50/50 dark:bg-[#0d1117]/50 border-y border-slate-200/80 dark:border-slate-800/80 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-left max-w-3xl mb-16">
          <h2 className="text-xs font-mono uppercase tracking-widest text-blue-600 dark:text-blue-400 font-semibold mb-3">
            Architectural Comparison
          </h2>
          <p className="text-3xl sm:text-4xl font-extrabold text-slate-950 dark:text-white tracking-tight">
            More intelligent than scaling everything.
          </p>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
            Comparing standard monolithic event brokers against AdaptiFlow's adaptive pipeline capabilities.
          </p>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#11161c] border border-slate-200 dark:border-slate-800 shadow-md overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60">
                <th className="p-4 sm:p-5 font-bold text-slate-900 dark:text-white">Capability</th>
                <th className="p-4 sm:p-5 font-bold text-slate-500 dark:text-slate-400 text-center">Traditional Fixed Processing</th>
                <th className="p-4 sm:p-5 font-bold text-blue-600 dark:text-blue-400 text-center">AdaptiFlow Engine</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/30 transition-colors">
                  <td className="p-4 sm:p-5 font-medium text-slate-900 dark:text-slate-100">{r.cap}</td>
                  <td className="p-4 sm:p-5 text-center text-slate-500 font-mono text-xs">
                    {r.trad === true ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto" />
                    ) : r.trad === false ? (
                      <XCircle className="w-5 h-5 text-slate-300 dark:text-slate-700 mx-auto" />
                    ) : (
                      <span>{r.trad}</span>
                    )}
                  </td>
                  <td className="p-4 sm:p-5 text-center">
                    <CheckCircle2 className="w-5 h-5 text-blue-600 dark:text-blue-400 mx-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

/* ==========================================================================
   12. COST / EFFICIENCY MESSAGE
   ========================================================================== */
export const CostEfficiencySection: React.FC = () => {
  return (
    <section className="py-20 sm:py-28 bg-white dark:bg-[#080a0d] transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-left max-w-3xl mb-16">
          <h2 className="text-xs font-mono uppercase tracking-widest text-blue-600 dark:text-blue-400 font-semibold mb-3">
            Capacity Optimization
          </h2>
          <p className="text-3xl sm:text-4xl font-extrabold text-slate-950 dark:text-white tracking-tight">
            Spend capacity where it matters.
          </p>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
            Instead of keeping 100% cloud compute hot 24/7 just in case a spike occurs, AdaptiFlow matches compute investment strictly to workload importance.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-slate-50 dark:bg-[#11161c] border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 uppercase">
              1. Low Load
            </span>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-2 mb-2">
              Fewer Workers & Direct Streaming
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Maintains minimal worker footprint (2 workers) while delivering sub-15ms direct streaming with near-zero idle compute overhead.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-50 dark:bg-[#11161c] border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 uppercase">
              2. High Load
            </span>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-2 mb-2">
              Dynamic Scaling & Micro-Batching
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Adds worker capacity dynamically while micro-batching non-critical jobs to maximize CPU throughput and downstream database health.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-50 dark:bg-[#11161c] border border-slate-200 dark:border-slate-800">
            <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 uppercase">
              3. Extreme Load
            </span>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-2 mb-2">
              Protect Revenue & Control Admission
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              Prioritizes revenue-generating transactions, defers secondary tasks, and cleanly sheds low-value telemetry to prevent total outages.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ==========================================================================
   13. PRICING SECTION
   ========================================================================== */
export const PricingSection: React.FC<{ onGetStarted: () => void }> = ({ onGetStarted }) => {
  const tiers = [
    {
      name: 'Starter',
      price: '₹18,000',
      period: '/ month',
      badge: 'Early Production',
      desc: 'For growing e-commerce platforms requiring spike resilience and priority routing.',
      features: [
        'Up to 5 Million events / month',
        '3 Independent priority queues',
        'Dynamic scaling up to 4 workers',
        'Adaptive streaming & batching',
        '7-day Supabase event history',
        'Standard community support',
      ],
      cta: 'Start Free Trial',
      popular: false,
    },
    {
      name: 'Growth',
      price: '₹85,000',
      period: '/ month',
      badge: 'Most Popular',
      desc: 'For high-velocity platforms demanding complete surge protection and duplicate shielding.',
      features: [
        'Up to 50 Million events / month',
        'Dynamic scaling up to 16 workers',
        'Controlled load shedding policies',
        'Duplicate shield & idempotency',
        'Explainable decision telemetry',
        '30-day persistent Supabase history',
        'Priority 24/7 engineering support',
      ],
      cta: 'Get Started',
      popular: true,
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      badge: 'Mission-Critical',
      desc: 'For global retail infrastructure requiring custom admission rules and dedicated clusters.',
      features: [
        'Unlimited event throughput',
        'Custom decision engine scoring algorithms',
        'Dedicated worker clusters & VPC peering',
        '99.99% operational uptime SLA',
        'Custom retention & compliance audit logs',
        'Dedicated Solutions Architect',
      ],
      cta: 'Contact Sales',
      popular: false,
    },
  ];

  return (
    <section id="pricing" className="py-20 sm:py-28 bg-slate-50/50 dark:bg-[#0d1117]/50 border-y border-slate-200/80 dark:border-slate-800/80 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 text-xs font-mono font-medium mb-3">
            <span>Illustrative pricing</span>
          </div>
          <p className="text-3xl sm:text-4xl font-extrabold text-slate-950 dark:text-white tracking-tight">
            Transparent pricing for adaptive workloads.
          </p>
          <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
            Scale seamlessly as your transaction volume expands without unexpected compute overages.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          {tiers.map((t, idx) => (
            <div
              key={idx}
              className={`rounded-2xl p-6 sm:p-8 flex flex-col justify-between border transition-all ${
                t.popular
                  ? 'bg-white dark:bg-[#11161c] border-blue-600 shadow-xl ring-2 ring-blue-600/20 relative'
                  : 'bg-white/80 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 shadow-sm'
              }`}
            >
              {t.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-blue-600 text-white text-[11px] font-mono font-bold uppercase tracking-wider shadow-sm">
                  Most Popular
                </div>
              )}

              <div>
                <div className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  {t.name}
                </div>
                <div className="flex items-baseline gap-1 my-3">
                  <span className="text-3xl sm:text-4xl font-extrabold text-slate-950 dark:text-white tracking-tight">
                    {t.price}
                  </span>
                  <span className="text-sm text-slate-500 font-mono">{t.period}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                  {t.desc}
                </p>

                <div className="space-y-3 pt-6 border-t border-slate-100 dark:border-slate-800/80 mb-8">
                  {t.features.map((f, fi) => (
                    <div key={fi} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={onGetStarted}
                className={`w-full py-3 rounded-lg text-sm font-semibold transition-all ${
                  t.popular
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700'
                }`}
              >
                {t.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ==========================================================================
   14. FINAL CTA
   ========================================================================== */
export const FinalCTA: React.FC<{ onGetStarted: () => void; onViewDemo: () => void }> = ({
  onGetStarted,
  onViewDemo,
}) => {
  return (
    <section className="py-20 sm:py-28 bg-white dark:bg-[#080a0d] transition-colors">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="p-8 sm:p-14 rounded-3xl bg-slate-900 dark:bg-[#0d1117] border border-slate-800 text-white shadow-2xl relative overflow-hidden">
          {/* Subtle blue accent background glow */}
          <div className="absolute -top-24 -right-24 w-80 h-80 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight mb-4">
            Build for the spike, not just the average.
          </h2>
          <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto mb-8 leading-relaxed">
            Give critical business events the dedicated capacity they need while your pipeline dynamically adapts to everything else.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5">
            <button
              onClick={onGetStarted}
              className="w-full sm:w-auto px-8 py-3.5 text-base font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-lg shadow-md transition-all active:scale-[0.98]"
            >
              Get Started
            </button>
            <button
              onClick={onViewDemo}
              className="w-full sm:w-auto px-8 py-3.5 text-base font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-all active:scale-[0.98]"
            >
              Explore Live Demo
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

/* ==========================================================================
   15. FOOTER
   ========================================================================== */
export const LandingFooter: React.FC = () => {
  return (
    <footer className="w-full bg-slate-50 dark:bg-[#080a0d] border-t border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand Col */}
          <div className="col-span-2 flex flex-col gap-4">
            <div className="flex items-center gap-2.5">
              <img
                src="/assets/full_logo.png"
                alt="AdaptiFlow"
                className="h-10 w-auto object-contain rounded-xl bg-white p-1 shadow-2xs border border-slate-200/60 dark:border-slate-800"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
              Adaptive event processing and real-time backpressure management for burst-heavy e-commerce and fintech workloads.
            </p>
            <div className="text-xs font-mono text-slate-400 mt-2">
              © {new Date().getFullYear()} AdaptiFlow Inc. All rights reserved.
            </div>
          </div>

          {/* Product */}
          <div>
            <div className="text-xs font-mono uppercase font-bold text-slate-900 dark:text-white mb-3">
              Product
            </div>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li><a href="#features" className="hover:text-blue-600">Features</a></li>
              <li><a href="#how-it-works" className="hover:text-blue-600">How It Works</a></li>
              <li><a href="#product" className="hover:text-blue-600">Priority System</a></li>
              <li><a href="#pricing" className="hover:text-blue-600">Pricing</a></li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <div className="text-xs font-mono uppercase font-bold text-slate-900 dark:text-white mb-3">
              Resources
            </div>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li><a href="#problem" className="hover:text-blue-600">Scaling Guide</a></li>
              <li><a href="#use-cases" className="hover:text-blue-600">Use Cases</a></li>
              <li><a href="/pipeline" className="hover:text-blue-600">Live Dashboard</a></li>
            </ul>
          </div>

          {/* Legal & Status */}
          <div>
            <div className="text-xs font-mono uppercase font-bold text-slate-900 dark:text-white mb-3">
              Platform
            </div>
            <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
              <li className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                All Systems Operational
              </li>
              <li><span className="text-slate-400">Privacy Policy</span></li>
              <li><span className="text-slate-400">Terms of Service</span></li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
};
