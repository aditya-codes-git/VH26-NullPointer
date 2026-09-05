import React, { useState } from 'react';
import type { DecisionFunctionTelemetry, EventPriority, ProcessingStrategy } from '../types/telemetry.js';
import { triggerEvaluateDecision } from '../services/socketClient.js';

interface DecisionEngineSectionProps {
  decisionFunction?: DecisionFunctionTelemetry;
  disabled?: boolean;
}

export const DecisionEngineSection: React.FC<DecisionEngineSectionProps> = ({
  decisionFunction,
  disabled = false,
}) => {
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [selectedPriority, setSelectedPriority] = useState<EventPriority>('LOW');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const currentDecision: ProcessingStrategy = decisionFunction?.currentDecision ?? 'STREAM';
  const currentScore = decisionFunction?.currentScore ?? 0.11;
  const confidence = decisionFunction?.confidence ?? 0.95;
  const weights = decisionFunction?.weights ?? {
    queuePressure: 0.30,
    workerUtilization: 0.25,
    latency: 0.15,
    dataSize: 0.10,
    costPressure: 0.10,
    priority: 0.10,
  };
  const inputs = decisionFunction?.currentInputs ?? {
    queuePressure: 0,
    workerUtilization: 0,
    latency: 0,
    latencyMs: 15,
    dataSize: 0.1,
    dataSizeBytes: 350,
    costPressure: 0,
    priority: 1.0,
    priorityName: 'LOW' as EventPriority,
  };
  const contributions = decisionFunction?.currentContributions ?? {
    queuePressure: 0,
    workerUtilization: 0,
    latency: 0,
    dataSize: 0.01,
    costPressure: 0,
    priority: 0.1,
  };
  const reasons = decisionFunction?.currentReasons ?? [
    'Queue pressure is nominal (0%)',
    'Worker pool capacity is ample (0%)',
    'Processing latency is optimal (15 ms)',
    'Event is LOW priority (eligible for batching, deferral, and shedding under strain)',
  ];
  const explanation = decisionFunction?.explanation ?? 'STREAM selected because system pressure is nominal.';
  const history = decisionFunction?.decisionHistory ?? [];

  const handleEvaluate = async () => {
    try {
      setIsEvaluating(true);
      setActionFeedback(null);
      const res = await triggerEvaluateDecision({ priority: selectedPriority });
      setActionFeedback(`Evaluated: ${res.result.decision} (score ${res.result.score})`);
      setTimeout(() => setActionFeedback(null), 5000);
    } catch (err: any) {
      setActionFeedback(`Evaluation error: ${err.message}`);
    } finally {
      setIsEvaluating(false);
    }
  };

  // Helper for decision badges
  const getDecisionBadge = (decision: ProcessingStrategy) => {
    switch (decision) {
      case 'STREAM':
        return {
          label: 'STREAM',
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-300',
          dot: 'bg-emerald-500',
        };
      case 'BATCH':
        return {
          label: 'BATCH',
          bg: 'bg-blue-50 text-blue-800 border-blue-300',
          dot: 'bg-blue-500',
        };
      case 'DEFER':
        return {
          label: 'DEFER',
          bg: 'bg-amber-50 text-amber-800 border-amber-300',
          dot: 'bg-amber-500',
        };
      case 'SHED':
      case 'DEFER + SHED':
        return {
          label: 'SHED',
          bg: 'bg-rose-50 text-rose-800 border-rose-300',
          dot: 'bg-rose-500',
        };
      default:
        return {
          label: decision,
          bg: 'bg-slate-50 text-slate-800 border-slate-300',
          dot: 'bg-slate-500',
        };
    }
  };

  const badge = getDecisionBadge(currentDecision);

  return (
    <section className="bg-white p-5 rounded-xl border border-[#e2e8f0] shadow-xs font-mono text-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-purple-600 text-[22px]">psychology</span>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 uppercase tracking-wider text-sm">
                FORMALIZED DECISION ENGINE
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-bold border border-purple-200">
                STRETCH GOAL #4
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-sans mt-0.5">
              Explainable multi-factor processing decision function with complete factor attribution breakdown
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${badge.dot} animate-pulse`} />
            <span className={`px-2.5 py-1 rounded text-[11px] border font-bold ${badge.bg}`}>
              {badge.label}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value as EventPriority)}
              disabled={disabled || isEvaluating}
              className="px-2 py-1 text-[11px] font-sans font-medium rounded border border-slate-200 bg-slate-50 text-slate-700"
            >
              <option value="LOW">LOW (Adaptive)</option>
              <option value="HIGH">HIGH (Protected)</option>
              <option value="CRITICAL">CRITICAL (Zero-Drop)</option>
            </select>

            <button
              onClick={handleEvaluate}
              disabled={disabled || isEvaluating}
              className={`px-3 py-1 text-[11px] font-bold rounded border transition-colors flex items-center gap-1.5 ${
                disabled || isEvaluating
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-700 text-white border-purple-700 shadow-xs'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">
                {isEvaluating ? 'sync' : 'auto_graph'}
              </span>
              {isEvaluating ? 'Evaluating...' : 'Evaluate Current State'}
            </button>
          </div>
        </div>
      </div>

      {actionFeedback && (
        <div className="mb-3 p-2 rounded bg-purple-50 border border-purple-200 text-purple-800 text-[11px] font-sans flex items-center justify-between">
          <span>{actionFeedback}</span>
        </div>
      )}

      {/* Top Banner: Decision & Score */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {/* Card 1: Active Decision */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 block mb-1">RECOMMENDED STRATEGY</span>
          <div className="flex items-center gap-2 my-1">
            <span className={`text-2xl font-black px-3 py-1 rounded-md border ${badge.bg}`}>
              {currentDecision}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 font-sans">
            Priority Tier: <strong className="font-mono text-slate-700">{inputs.priorityName}</strong>
          </span>
        </div>

        {/* Card 2: Decision Score */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 block mb-1">COMPOSITE DECISION SCORE</span>
          <div className="flex items-baseline gap-2 my-1">
            <span className="text-3xl font-black text-purple-900">{currentScore.toFixed(3)}</span>
            <span className="text-xs text-slate-400">/ 1.000</span>
          </div>
          <div className="text-[10px] text-slate-500 font-sans flex items-center justify-between">
            <span>Confidence: <strong className="text-purple-700">{Math.round(confidence * 100)}%</strong></span>
            <span className="text-slate-400">Deterministic</span>
          </div>
        </div>

        {/* Card 3: Threshold Bracket */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 block mb-1">SCORE THRESHOLD BRACKETS</span>
          <div className="space-y-1 my-1 text-[10px]">
            <div className={`flex justify-between px-1.5 py-0.5 rounded ${currentDecision === 'STREAM' ? 'bg-emerald-100 font-bold text-emerald-800' : 'text-slate-500'}`}>
              <span>STREAM</span>
              <span>score &lt; 0.35</span>
            </div>
            <div className={`flex justify-between px-1.5 py-0.5 rounded ${currentDecision === 'BATCH' ? 'bg-blue-100 font-bold text-blue-800' : 'text-slate-500'}`}>
              <span>BATCH</span>
              <span>0.35 ≤ score &lt; 0.65</span>
            </div>
            <div className={`flex justify-between px-1.5 py-0.5 rounded ${currentDecision === 'DEFER' ? 'bg-amber-100 font-bold text-amber-800' : 'text-slate-500'}`}>
              <span>DEFER</span>
              <span>0.65 ≤ score &lt; 0.85</span>
            </div>
            <div className={`flex justify-between px-1.5 py-0.5 rounded ${currentDecision === 'SHED' ? 'bg-rose-100 font-bold text-rose-800' : 'text-slate-500'}`}>
              <span>SHED</span>
              <span>score ≥ 0.85 (LOW only)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Six Inputs Grid */}
      <div className="mb-4">
        <div className="text-[11px] font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px] text-slate-500">tune</span>
          Six Measured Decision Inputs (Normalized Domain [0, 1])
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-center">
          {/* 1. Queue Pressure */}
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-[10px] text-slate-400 block mb-0.5">Queue Pressure</span>
            <span className="text-base font-bold text-slate-800">{Math.round(inputs.queuePressure * 100)}%</span>
            <div className="text-[10px] text-slate-500 mt-1">
              Norm: <span className="font-bold">{inputs.queuePressure.toFixed(2)}</span>
            </div>
            <span className="text-[9px] text-purple-600 block mt-0.5">w: {weights.queuePressure.toFixed(2)}</span>
          </div>

          {/* 2. Worker Utilization */}
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-[10px] text-slate-400 block mb-0.5">Worker Util</span>
            <span className="text-base font-bold text-slate-800">{Math.round(inputs.workerUtilization * 100)}%</span>
            <div className="text-[10px] text-slate-500 mt-1">
              Norm: <span className="font-bold">{inputs.workerUtilization.toFixed(2)}</span>
            </div>
            <span className="text-[9px] text-purple-600 block mt-0.5">w: {weights.workerUtilization.toFixed(2)}</span>
          </div>

          {/* 3. Latency */}
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-[10px] text-slate-400 block mb-0.5">Latency</span>
            <span className="text-base font-bold text-slate-800">{inputs.latencyMs}ms</span>
            <div className="text-[10px] text-slate-500 mt-1">
              Norm: <span className="font-bold">{inputs.latency.toFixed(2)}</span>
            </div>
            <span className="text-[9px] text-purple-600 block mt-0.5">w: {weights.latency.toFixed(2)}</span>
          </div>

          {/* 4. Data Size */}
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-[10px] text-slate-400 block mb-0.5">Data Volume</span>
            <span className="text-base font-bold text-slate-800">{inputs.dataSizeBytes}B</span>
            <div className="text-[10px] text-slate-500 mt-1">
              Norm: <span className="font-bold">{inputs.dataSize.toFixed(2)}</span>
            </div>
            <span className="text-[9px] text-purple-600 block mt-0.5">w: {weights.dataSize.toFixed(2)}</span>
          </div>

          {/* 5. Cost Pressure */}
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-[10px] text-slate-400 block mb-0.5">Cost Pressure</span>
            <span className="text-base font-bold text-slate-800">{Math.round(inputs.costPressure * 100)}%</span>
            <div className="text-[10px] text-slate-500 mt-1">
              Norm: <span className="font-bold">{inputs.costPressure.toFixed(2)}</span>
            </div>
            <span className="text-[9px] text-purple-600 block mt-0.5">w: {weights.costPressure.toFixed(2)}</span>
          </div>

          {/* 6. Priority */}
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-[10px] text-slate-400 block mb-0.5">Priority Factor</span>
            <span className={`text-base font-bold ${inputs.priorityName === 'CRITICAL' ? 'text-rose-700' : inputs.priorityName === 'HIGH' ? 'text-blue-700' : 'text-slate-700'}`}>
              {inputs.priorityName}
            </span>
            <div className="text-[10px] text-slate-500 mt-1">
              Norm: <span className="font-bold">{inputs.priority.toFixed(2)}</span>
            </div>
            <span className="text-[9px] text-purple-600 block mt-0.5">w: {weights.priority.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Factor Contribution Breakdown */}
      <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
          <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-indigo-600">bar_chart</span>
            Factor Contribution Breakdown (Sum ≡ Score {currentScore.toFixed(3)})
          </span>
          <span className="text-[10px] text-slate-400 font-sans">Formula: Score = Σ (w_i × input_i)</span>
        </div>

        <div className="space-y-2 text-[11px]">
          {/* Queue Pressure */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-slate-700 font-medium">Queue Pressure (w: {weights.queuePressure})</span>
              <span className="font-bold text-slate-900">+{contributions.queuePressure.toFixed(3)}</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5">
              <div
                className="bg-indigo-600 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, Math.round((contributions.queuePressure / weights.queuePressure) * 100))}%` }}
              />
            </div>
          </div>

          {/* Worker Utilization */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-slate-700 font-medium">Worker Utilization (w: {weights.workerUtilization})</span>
              <span className="font-bold text-slate-900">+{contributions.workerUtilization.toFixed(3)}</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5">
              <div
                className="bg-blue-600 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, Math.round((contributions.workerUtilization / weights.workerUtilization) * 100))}%` }}
              />
            </div>
          </div>

          {/* Latency */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-slate-700 font-medium">Processing Latency (w: {weights.latency})</span>
              <span className="font-bold text-slate-900">+{contributions.latency.toFixed(3)}</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5">
              <div
                className="bg-purple-600 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, Math.round((contributions.latency / weights.latency) * 100))}%` }}
              />
            </div>
          </div>

          {/* Data Size */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-slate-700 font-medium">Data Size Volume (w: {weights.dataSize})</span>
              <span className="font-bold text-slate-900">+{contributions.dataSize.toFixed(3)}</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5">
              <div
                className="bg-teal-600 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, Math.round((contributions.dataSize / weights.dataSize) * 100))}%` }}
              />
            </div>
          </div>

          {/* Cost Pressure */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-slate-700 font-medium">Infrastructure Cost Pressure (w: {weights.costPressure})</span>
              <span className="font-bold text-slate-900">+{contributions.costPressure.toFixed(3)}</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5">
              <div
                className="bg-amber-600 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, Math.round((contributions.costPressure / weights.costPressure) * 100))}%` }}
              />
            </div>
          </div>

          {/* Priority */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-slate-700 font-medium">Priority Sensitivity (w: {weights.priority})</span>
              <span className="font-bold text-slate-900">+{contributions.priority.toFixed(3)}</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5">
              <div
                className="bg-rose-600 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, Math.round((contributions.priority / weights.priority) * 100))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* WHY THIS DECISION? Explanation Box */}
      <div className="mb-4 p-4 bg-purple-50/60 border border-purple-200 rounded-lg">
        <div className="font-bold text-purple-900 uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px] text-purple-700">help</span>
          WHY THIS DECISION? (Human-Readable Explainability)
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
          {reasons.map((reason, idx) => (
            <div key={idx} className="flex items-start gap-1.5 text-[11px] text-slate-700 font-sans">
              <span className="material-symbols-outlined text-purple-600 text-[14px] shrink-0 mt-0.5">check_circle</span>
              <span>{reason}</span>
            </div>
          ))}
        </div>

        <div className="p-3 bg-white border border-purple-200 rounded text-[11px] text-purple-950 font-sans leading-relaxed">
          <strong>Synthesized Rationale:</strong> "{explanation}"
        </div>
      </div>

      {/* Decision History Table */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-slate-500">history</span>
            Decision Evaluation History Ledger
          </span>
          <span className="text-[10px] text-slate-400 font-sans">
            Showing last {history.length} snapshots (bounded)
          </span>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 font-mono text-slate-600">
                <th className="py-2 px-3 font-semibold">Time</th>
                <th className="py-2 px-3 font-semibold">Score</th>
                <th className="py-2 px-3 font-semibold">Decision</th>
                <th className="py-2 px-3 font-semibold">Priority</th>
                <th className="py-2 px-3 font-semibold">Queue</th>
                <th className="py-2 px-3 font-semibold">Workers</th>
                <th className="py-2 px-3 font-semibold">Latency</th>
                <th className="py-2 px-3 font-semibold">Top Factor Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-400 font-sans">
                    No decisions evaluated yet. Click "Evaluate Current State" to trigger a live evaluation.
                  </td>
                </tr>
              ) : (
                history.map((snap) => {
                  const snapBadge = getDecisionBadge(snap.decision);
                  return (
                    <tr key={snap.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2 px-3 font-mono text-slate-500">{snap.timestamp}</td>
                      <td className="py-2 px-3 font-mono font-bold text-purple-900">{snap.score.toFixed(3)}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${snapBadge.bg}`}>
                          {snapBadge.label}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono font-semibold text-slate-700">{snap.priority}</td>
                      <td className="py-2 px-3 font-mono text-slate-700">{snap.queuePressurePercent}%</td>
                      <td className="py-2 px-3 font-mono text-slate-700">{snap.workerUtilizationPercent}%</td>
                      <td className="py-2 px-3 font-mono text-slate-700">{snap.latencyMs}ms</td>
                      <td className="py-2 px-3 text-slate-600 font-sans text-[10px] truncate max-w-xs">
                        {snap.topReasons[0] || snap.explanation}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
