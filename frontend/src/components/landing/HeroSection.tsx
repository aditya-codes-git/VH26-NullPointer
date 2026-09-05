import React, { useState } from 'react';
import {
  ArrowRight,
  Play,
  Zap,
  Layers,
  Clock,
} from 'lucide-react';

interface HeroSectionProps {
  onGetStarted: () => void;
  onViewDemo: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onGetStarted, onViewDemo }) => {
  const [simulatedPressure, setSimulatedPressure] = useState<'normal' | 'surge'>('surge');

  return (
    <section className="relative pt-28 pb-16 sm:pt-36 sm:pb-24 overflow-hidden bg-white dark:bg-[#080a0d] bg-grid-pattern transition-colors duration-200">
      {/* Background Radial Glow (Blue only, zero purple) */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-blue-500/10 dark:bg-blue-600/15 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Hero Narrative */}
          <div className="lg:col-span-7 flex flex-col items-start text-left">
            {/* Eyebrow badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-400 text-xs font-semibold tracking-wide uppercase mb-6">
              <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400 animate-pulse" />
              <span>Adaptive Event Infrastructure</span>
              <span className="text-slate-400 dark:text-slate-500 font-normal">|</span>
              <span className="font-mono lowercase text-[11px]">v2.4 production</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-950 dark:text-white tracking-tight leading-[1.12] mb-6">
              Handle{' '}
              <span className="text-blue-600 dark:text-blue-500 underline decoration-blue-200 dark:decoration-blue-900/60 decoration-wavy decoration-2 underline-offset-8">
                traffic spikes
              </span>{' '}
              without treating every event equally.
            </h1>

            {/* Supporting Subtext */}
            <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl mb-8">
              AdaptiFlow dynamically prioritizes, batches, defers and sheds workload so critical
              business events keep moving while non-critical traffic is handled intelligently.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 w-full sm:w-auto mb-8">
              <button
                onClick={onGetStarted}
                className="flex items-center justify-center gap-2 px-6 py-3.5 text-base font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg shadow-blue-600/25 hover:shadow-xl hover:shadow-blue-600/35 transition-all active:scale-[0.98]"
              >
                <span>Get Started</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={onViewDemo}
                className="flex items-center justify-center gap-2 px-6 py-3.5 text-base font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg border border-slate-300 dark:border-slate-700 transition-all active:scale-[0.98]"
              >
                <Play className="w-4 h-4 text-blue-600 fill-blue-600" />
                <span>View Live Demo</span>
              </button>
            </div>

            {/* Secondary Architecture Link */}
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <span>Explore the adaptive pipeline architecture</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Right Column: Visual Product Simulation */}
          <div className="lg:col-span-5 w-full">
            <div className="relative rounded-2xl bg-white dark:bg-[#0d1117] border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6 transition-all">
              {/* Simulation Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Pipeline Simulation
                  </span>
                </div>

                {/* State selector toggle */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-mono">
                  <button
                    onClick={() => setSimulatedPressure('normal')}
                    className={`px-2.5 py-1 rounded-md transition-all ${
                      simulatedPressure === 'normal'
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-medium'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Normal (1K)
                  </button>
                  <button
                    onClick={() => setSimulatedPressure('surge')}
                    className={`px-2.5 py-1 rounded-md transition-all ${
                      simulatedPressure === 'surge'
                        ? 'bg-blue-600 text-white font-medium shadow-xs'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Surge (20K)
                  </button>
                </div>
              </div>

              {/* Ingress Gateway Node */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 flex items-center justify-center font-mono text-xs font-bold">
                    IN
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Ingress Gateway
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      {simulatedPressure === 'surge' ? '19,840 events/sec' : '1,200 events/sec'}
                    </div>
                  </div>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                  Healthy Ingestion
                </span>
              </div>

              {/* Priority Router Representation */}
              <div className="space-y-3 relative">
                {/* Visual connection bracket line */}
                <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-slate-200 dark:bg-slate-800 -z-0" />

                {/* CRITICAL LANE */}
                <div className="relative pl-6">
                  <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-md bg-blue-600 text-white flex items-center justify-center">
                        <Zap className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            CRITICAL
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                            (Orders & Payments)
                          </span>
                        </div>
                        <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          Strategy: STREAM • 0% Shed
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-blue-700 dark:text-blue-400">
                      12ms latency
                    </span>
                  </div>
                </div>

                {/* HIGH LANE */}
                <div className="relative pl-6">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-md bg-slate-700 text-white flex items-center justify-center">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            HIGH
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                            (Inventory Sync)
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400">
                          Strategy:{' '}
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {simulatedPressure === 'surge' ? 'BATCH (50x chunks)' : 'STREAM'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                      {simulatedPressure === 'surge' ? '45ms' : '15ms'}
                    </span>
                  </div>
                </div>

                {/* LOW LANE */}
                <div className="relative pl-6">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-md bg-amber-500 text-white flex items-center justify-center">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            LOW
                          </span>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                            (Clicks & Logs)
                          </span>
                        </div>
                        <div className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                          Strategy:{' '}
                          {simulatedPressure === 'surge' ? 'DEFER + CONTROLLED SHED' : 'STREAM'}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-amber-700 dark:text-amber-400">
                      {simulatedPressure === 'surge' ? 'Policy Shed: 18%' : '0%'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Real-looking illustrative telemetry pills */}
              <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Simulated Runtime Telemetry
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 italic">
                    (Illustrative Demo Values)
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/80">
                    <div className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                      {simulatedPressure === 'surge' ? '20,000' : '1,200'}
                    </div>
                    <div className="text-[10px] text-slate-500">Events/min</div>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/80">
                    <div className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                      {simulatedPressure === 'surge' ? '6 Active' : '2 Base'}
                    </div>
                    <div className="text-[10px] text-slate-500">Workers</div>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/80">
                    <div className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      0 Lost
                    </div>
                    <div className="text-[10px] text-slate-500">Critical Orders</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
