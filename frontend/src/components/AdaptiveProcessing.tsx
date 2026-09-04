import React from 'react';
import { ProcessingStrategy, SystemState } from '../types/dashboard.js';
import { Info } from 'lucide-react';

interface AdaptiveProcessingProps {
  currentStrategy?: ProcessingStrategy;
  systemState?: SystemState;
  reason?: string;
}

export const AdaptiveProcessing: React.FC<AdaptiveProcessingProps> = ({
  currentStrategy = 'BATCH',
  systemState = 'PRESSURED',
  reason = 'Queue pressure is increasing as incoming traffic exceeds single-event processing capacity.',
}) => {
  const steps = [
    {
      id: 'STREAM',
      name: 'STREAM',
      tagline: 'Process individually',
      description: 'Normal traffic mode. Every event is processed as soon as it arrives.',
      pressureRange: '< 25%',
      color: 'emerald',
    },
    {
      id: 'BATCH',
      name: 'BATCH',
      tagline: 'Group low-priority events',
      description: 'Micro-batches low-priority telemetry to amortize processing overhead.',
      pressureRange: '25% – 55%',
      color: 'blue',
    },
    {
      id: 'DEFER',
      name: 'DEFER',
      tagline: 'Process later',
      description: 'Pauses low-priority queue execution so worker threads serve critical transactions.',
      pressureRange: '55% – 80%',
      color: 'amber',
    },
    {
      id: 'SHED',
      name: 'SHED',
      tagline: 'Discard permitted non-critical events under extreme overload',
      description: 'Controlled shedding of clicks & logs with full audit logging; zero critical loss.',
      pressureRange: '≥ 80%',
      color: 'rose',
    },
  ];

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Adaptive Processing</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            How the pipeline dynamically changes execution strategy based on system load.
          </p>
        </div>

        {/* Status Callout Box */}
        <div className="flex flex-wrap items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono">
          <div>
            <span className="text-slate-500">CURRENT STRATEGY:</span>{' '}
            <strong className="text-blue-600 font-bold">{currentStrategy}</strong>
          </div>
          <span className="text-slate-300">|</span>
          <div>
            <span className="text-slate-500">SYSTEM STATE:</span>{' '}
            <strong className="text-slate-800 font-bold">{systemState}</strong>
          </div>
        </div>
      </div>

      {/* "Why?" Explanation Area */}
      <div className="mt-4 bg-blue-50/50 border border-blue-100 rounded-lg p-3 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-900">
          <strong>Why is this strategy active?</strong> {reason}
        </div>
      </div>

      {/* 4-Step Progression Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {steps.map((step) => {
          const isCurrent = step.id === currentStrategy;

          let cardStyle = 'bg-slate-50/60 border-slate-200 opacity-60';
          let badgeStyle = 'bg-slate-200 text-slate-600';

          if (isCurrent) {
            if (step.color === 'emerald') {
              cardStyle = 'bg-emerald-50/50 border-emerald-300 ring-2 ring-emerald-500/20 shadow-xs';
              badgeStyle = 'bg-emerald-600 text-white';
            } else if (step.color === 'blue') {
              cardStyle = 'bg-blue-50/50 border-blue-300 ring-2 ring-blue-500/20 shadow-xs';
              badgeStyle = 'bg-blue-600 text-white';
            } else if (step.color === 'amber') {
              cardStyle = 'bg-amber-50/50 border-amber-300 ring-2 ring-amber-500/20 shadow-xs';
              badgeStyle = 'bg-amber-600 text-white';
            } else if (step.color === 'rose') {
              cardStyle = 'bg-rose-50/50 border-rose-300 ring-2 ring-rose-500/20 shadow-xs';
              badgeStyle = 'bg-rose-600 text-white';
            }
          }

          return (
            <div
              key={step.id}
              className={`border rounded-xl p-4 flex flex-col justify-between transition-all ${cardStyle}`}
            >
              <div>
                <div className="flex items-center justify-between text-xs font-mono mb-2">
                  <span className="font-semibold text-slate-500">Tier: {step.pressureRange}</span>
                  {isCurrent && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${badgeStyle}`}>
                      CURRENT
                    </span>
                  )}
                </div>

                <h3 className="text-base font-bold text-slate-900">{step.name}</h3>
                <div className="text-xs font-semibold text-slate-700 mt-1">"{step.tagline}"</div>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">{step.description}</p>
              </div>

              <div className="mt-4 pt-2 border-t border-slate-200/60 text-[11px] font-mono text-slate-400">
                Trigger: Queue pressure {step.pressureRange}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
