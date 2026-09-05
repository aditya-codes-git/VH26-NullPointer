import { describe, it, expect, beforeEach } from 'vitest';
import {
  FormalizedDecisionEngine,
  DEFAULT_DECISION_WEIGHTS,
} from '../src/decision-engine/formalizedDecisionEngine.js';
import { QueueManager } from '../src/queues/queueManager.js';
import { DEFAULT_CONFIG } from '../src/config/pipelineConfig.js';
import { AdaptiveDecisionEngine } from '../src/decision-engine/adaptiveEngine.js';
import { MetricsCollector } from '../src/metrics/metricsCollector.js';
import { SheddingPolicy } from '../src/backpressure/sheddingPolicy.js';
import { BackpressureController } from '../src/backpressure/backpressureController.js';
import { RetryController } from '../src/resilience/retryController.js';
import { WorkerScaler } from '../src/workers/workerScaler.js';
import { WorkerPool } from '../src/processing/workerPool.js';
import { BatchProcessor } from '../src/processing/batchProcessor.js';
import { DuplicateDetector } from '../src/resilience/duplicateDetector.js';

describe('Stretch Feature 4 — Formalized Decision Function', () => {
  let engine: FormalizedDecisionEngine;
  let queueManager: QueueManager;
  let adaptiveEngine: AdaptiveDecisionEngine;
  let metricsCollector: MetricsCollector;
  let workerScaler: WorkerScaler;
  let workerPool: WorkerPool;

  beforeEach(() => {
    const config = { ...DEFAULT_CONFIG };
    queueManager = new QueueManager(config);
    const retryController = new RetryController(config, queueManager);
    const batchProcessor = new BatchProcessor(config, retryController);
    const sheddingPolicy = new SheddingPolicy(queueManager);
    const backpressureController = new BackpressureController(config, queueManager);
    adaptiveEngine = new AdaptiveDecisionEngine(config, queueManager);
    const duplicateDetector = new DuplicateDetector(60, 10000);

    metricsCollector = new MetricsCollector(
      queueManager,
      sheddingPolicy,
      backpressureController,
      adaptiveEngine,
      retryController
    );
    metricsCollector.registerDuplicateDetector(duplicateDetector);

    workerPool = new WorkerPool(
      config,
      queueManager,
      batchProcessor,
      sheddingPolicy,
      adaptiveEngine,
      retryController
    );
    workerPool.registerMetricsCollector(metricsCollector);

    workerScaler = new WorkerScaler(config, workerPool, queueManager, metricsCollector, () => {});
    metricsCollector.registerWorkerScaler(workerScaler);

    engine = new FormalizedDecisionEngine(
      config,
      queueManager,
      adaptiveEngine,
      workerPool,
      workerScaler,
      metricsCollector
    );
    metricsCollector.registerDecisionEngine(engine);
  });

  // ==========================================================
  // Core Functional Tests
  // ==========================================================

  it('TEST 1: Weights sum exactly to 1.0', () => {
    const weights = engine.getWeights();
    const sum =
      weights.queuePressure +
      weights.workerUtilization +
      weights.latency +
      weights.dataSize +
      weights.costPressure +
      weights.priority;

    expect(Number(sum.toFixed(4))).toBe(1.0);
  });

  it('TEST 2: Same inputs always produce identical, deterministic results', () => {
    const inputs = {
      queuePressure: 0.65,
      workerUtilization: 0.72,
      latencyMs: 180,
      dataSizeBytes: 800,
      costPressure: 0.45,
      priority: 'LOW' as const,
    };

    const res1 = engine.calculateDecision(inputs);
    const res2 = engine.calculateDecision(inputs);

    expect(res1.score).toBe(res2.score);
    expect(res1.decision).toBe(res2.decision);
    expect(res1.confidence).toBe(res2.confidence);
    expect(res1.contributions).toEqual(res2.contributions);
    expect(res1.explanation).toBe(res2.explanation);
  });

  it('TEST 3: Contribution values are mathematically consistent with the score (sum of contributions == score)', () => {
    const res = engine.calculateDecision({
      queuePressure: 0.75,
      workerUtilization: 0.68,
      latencyMs: 250,
      dataSizeBytes: 1200,
      costPressure: 0.55,
      priority: 'LOW',
    });

    const sumContributions = Number(
      (
        res.contributions.queuePressure +
        res.contributions.workerUtilization +
        res.contributions.latency +
        res.contributions.dataSize +
        res.contributions.costPressure +
        res.contributions.priority
      ).toFixed(3)
    );

    expect(res.score).toBe(sumContributions);
  });

  it('TEST 4: Low pressure favors STREAM strategy', () => {
    const res = engine.calculateDecision({
      queuePressure: 0.10,
      workerUtilization: 0.15,
      latencyMs: 15,
      dataSizeBytes: 200,
      costPressure: 0.05,
      priority: 'LOW',
    });

    expect(res.score).toBeLessThan(0.35);
    expect(res.decision).toBe('STREAM');
    expect(res.explanation).toContain('STREAM selected because system pressure is nominal');
  });

  it('TEST 5: Moderate pressure favors BATCH strategy', () => {
    const res = engine.calculateDecision({
      queuePressure: 0.45,
      workerUtilization: 0.50,
      latencyMs: 120,
      dataSizeBytes: 500,
      costPressure: 0.30,
      priority: 'LOW',
    });

    expect(res.score).toBeGreaterThanOrEqual(0.35);
    expect(res.score).toBeLessThan(0.65);
    expect(res.decision).toBe('BATCH');
    expect(res.explanation).toContain('BATCH selected');
  });

  it('TEST 6: High pressure favors DEFER strategy for LOW priority', () => {
    const res = engine.calculateDecision({
      queuePressure: 0.75,
      workerUtilization: 0.82,
      latencyMs: 380,
      dataSizeBytes: 1600,
      costPressure: 0.70,
      priority: 'LOW',
    });

    expect(res.score).toBeGreaterThanOrEqual(0.65);
    expect(res.score).toBeLessThan(0.85);
    expect(res.decision).toBe('DEFER');
    expect(res.explanation).toContain('DEFER selected');
  });

  it('TEST 7: Extreme pressure engages SHED strategy for eligible LOW priority', () => {
    const res = engine.calculateDecision({
      queuePressure: 0.95,
      workerUtilization: 0.98,
      latencyMs: 480,
      dataSizeBytes: 2400,
      costPressure: 0.95,
      priority: 'LOW',
    });

    expect(res.score).toBeGreaterThanOrEqual(0.85);
    expect(res.decision).toBe('SHED');
    expect(res.explanation).toContain('SHED selected because extreme queue saturation');
  });

  it('TEST 8: CRITICAL events are always protected (never DEFER or SHED)', () => {
    // Under extreme system pressure conditions
    const extremeConditions = {
      queuePressure: 0.95,
      workerUtilization: 0.98,
      latencyMs: 480,
      dataSizeBytes: 2400,
      costPressure: 0.95,
    };

    const criticalRes = engine.calculateDecision({
      ...extremeConditions,
      priority: 'CRITICAL',
    });

    // Invariant: CRITICAL events MUST be STREAM (never SHED, never DEFER)
    expect(criticalRes.decision).toBe('STREAM');
    expect(criticalRes.inputs.priorityName).toBe('CRITICAL');
    expect(criticalRes.inputs.priority).toBe(0.0);
    expect(criticalRes.explanation).toContain('STREAM enforced because event is CRITICAL priority');
  });

  it('TEST 9: HIGH events are protected (never SHED, may BATCH under load)', () => {
    const extremeConditions = {
      queuePressure: 0.95,
      workerUtilization: 0.98,
      latencyMs: 480,
      dataSizeBytes: 2400,
      costPressure: 0.95,
    };

    const highRes = engine.calculateDecision({
      ...extremeConditions,
      priority: 'HIGH',
    });

    // Invariant: HIGH events must NEVER be SHED
    expect(highRes.decision).not.toBe('SHED');
    expect(highRes.decision).toBe('BATCH');
    expect(highRes.explanation).toContain('HIGH-priority event');
  });

  it('TEST 10: Different priorities produce different decisions under identical system conditions', () => {
    const heavyState = {
      queuePressure: 0.78,
      workerUtilization: 0.85,
      latencyMs: 350,
      dataSizeBytes: 1400,
      costPressure: 0.65,
    };

    const critRes = engine.calculateDecision({ ...heavyState, priority: 'CRITICAL' });
    const highRes = engine.calculateDecision({ ...heavyState, priority: 'HIGH' });
    const lowRes = engine.calculateDecision({ ...heavyState, priority: 'LOW' });

    expect(critRes.decision).toBe('STREAM');
    expect(highRes.decision).toBe('BATCH');
    expect(lowRes.decision).toBe('DEFER');

    expect(critRes.score).toBeLessThan(highRes.score);
    expect(highRes.score).toBeLessThan(lowRes.score);
  });

  // ==========================================================
  // SENSITIVITY TEST (REQUIRED BY SPECIFICATION)
  // Take a baseline input set. Change exactly ONE input at a time.
  // Verify that the resulting score/contribution changes for ALL SIX factors.
  // ==========================================================

  describe('Sensitivity Test — All Six Inputs Independently Influence Score', () => {
    const baseline = {
      queuePressure: 0.40,
      workerUtilization: 0.40,
      latencyMs: 206,      // yields normalized latency ~0.40
      dataSizeBytes: 1060, // yields normalized data size ~0.40
      costPressure: 0.40,
      priority: 0.40,      // normalized priority ~0.40
    };

    it('1. Changing Queue Pressure alone modifies the score & queue contribution', () => {
      const baseResult = engine.calculateDecision(baseline);
      const modifiedResult = engine.calculateDecision({ ...baseline, queuePressure: 0.85 });

      expect(modifiedResult.score).not.toBe(baseResult.score);
      expect(modifiedResult.contributions.queuePressure).not.toBe(baseResult.contributions.queuePressure);
      expect(modifiedResult.contributions.queuePressure).toBeGreaterThan(baseResult.contributions.queuePressure);

      // Other factor contributions remain unchanged
      expect(modifiedResult.contributions.workerUtilization).toBe(baseResult.contributions.workerUtilization);
      expect(modifiedResult.contributions.latency).toBe(baseResult.contributions.latency);
      expect(modifiedResult.contributions.dataSize).toBe(baseResult.contributions.dataSize);
      expect(modifiedResult.contributions.costPressure).toBe(baseResult.contributions.costPressure);
      expect(modifiedResult.contributions.priority).toBe(baseResult.contributions.priority);
    });

    it('2. Changing Worker Utilization alone modifies the score & worker contribution', () => {
      const baseResult = engine.calculateDecision(baseline);
      const modifiedResult = engine.calculateDecision({ ...baseline, workerUtilization: 0.90 });

      expect(modifiedResult.score).not.toBe(baseResult.score);
      expect(modifiedResult.contributions.workerUtilization).toBeGreaterThan(baseResult.contributions.workerUtilization);
      expect(modifiedResult.contributions.queuePressure).toBe(baseResult.contributions.queuePressure);
    });

    it('3. Changing Processing Latency alone modifies the score & latency contribution', () => {
      const baseResult = engine.calculateDecision(baseline);
      const modifiedResult = engine.calculateDecision({ ...baseline, latencyMs: 450 });

      expect(modifiedResult.score).not.toBe(baseResult.score);
      expect(modifiedResult.contributions.latency).toBeGreaterThan(baseResult.contributions.latency);
      expect(modifiedResult.contributions.workerUtilization).toBe(baseResult.contributions.workerUtilization);
    });

    it('4. Changing Data Size alone modifies the score & data size contribution', () => {
      const baseResult = engine.calculateDecision(baseline);
      const modifiedResult = engine.calculateDecision({ ...baseline, dataSizeBytes: 2200 });

      expect(modifiedResult.score).not.toBe(baseResult.score);
      expect(modifiedResult.contributions.dataSize).toBeGreaterThan(baseResult.contributions.dataSize);
      expect(modifiedResult.contributions.latency).toBe(baseResult.contributions.latency);
    });

    it('5. Changing Cost Pressure alone modifies the score & cost contribution', () => {
      const baseResult = engine.calculateDecision(baseline);
      const modifiedResult = engine.calculateDecision({ ...baseline, costPressure: 0.90 });

      expect(modifiedResult.score).not.toBe(baseResult.score);
      expect(modifiedResult.contributions.costPressure).toBeGreaterThan(baseResult.contributions.costPressure);
      expect(modifiedResult.contributions.dataSize).toBe(baseResult.contributions.dataSize);
    });

    it('6. Changing Event Priority alone modifies the score & priority contribution', () => {
      const baseResult = engine.calculateDecision(baseline);
      const modifiedResult = engine.calculateDecision({ ...baseline, priority: 'CRITICAL' });

      expect(modifiedResult.score).not.toBe(baseResult.score);
      expect(modifiedResult.contributions.priority).toBeLessThan(baseResult.contributions.priority);
      expect(modifiedResult.contributions.costPressure).toBe(baseResult.contributions.costPressure);
    });
  });

  // ==========================================================
  // Telemetry, Explanations, and System Integration Tests
  // ==========================================================

  it('TEST 17: Explanation generation dynamically reflects actual inputs and numbers', () => {
    const lowRes = engine.calculateDecision({
      queuePressure: 0.15,
      workerUtilization: 0.20,
      latencyMs: 12,
      dataSizeBytes: 150,
      costPressure: 0.10,
      priority: 'LOW',
    });
    expect(lowRes.explanation).toContain('15% queue');
    expect(lowRes.explanation).toContain('20% workers');
    expect(lowRes.explanation).toContain('12ms latency');

    const highRes = engine.calculateDecision({
      queuePressure: 0.88,
      workerUtilization: 0.92,
      latencyMs: 410,
      dataSizeBytes: 1800,
      costPressure: 0.80,
      priority: 'LOW',
    });
    expect(highRes.explanation).toContain('88%');
    expect(highRes.explanation).toContain('92%');
    expect(highRes.explanation).toContain('SHED selected');
  });

  it('TEST 18: Decision history is bounded and records chronological entries', () => {
    // Evaluate 60 times
    for (let i = 0; i < 60; i++) {
      engine.evaluateFromSystemState('LOW');
    }

    const telemetry = engine.getTelemetry();
    expect(telemetry.decisionHistory.length).toBeLessThanOrEqual(50);
    expect(telemetry.decisionHistory[0].timestamp).toBeDefined();
    expect(telemetry.decisionHistory[0].decision).toBeDefined();
    expect(telemetry.decisionHistory[0].score).toBeDefined();
  });

  it('TEST 19: TelemetrySnapshot includes formalized decision data', () => {
    const snapshot = metricsCollector.getSnapshot();

    expect(snapshot.decisionFunction).toBeDefined();
    expect(snapshot.decisionFunction?.currentDecision).toBeDefined();
    expect(snapshot.decisionFunction?.currentScore).toBeDefined();
    expect(snapshot.decisionFunction?.currentInputs).toBeDefined();
    expect(snapshot.decisionFunction?.currentContributions).toBeDefined();
    expect(snapshot.decisionFunction?.weights).toBeDefined();
    expect(snapshot.decisionFunction?.explanation).toBeDefined();
  });

  it('TEST 20: Reset clears decision history and re-evaluates nominal state', () => {
    engine.evaluateFromSystemState('LOW');
    engine.evaluateFromSystemState('HIGH');
    expect(engine.getTelemetry().decisionHistory.length).toBeGreaterThan(0);

    metricsCollector.reset();

    const telemetry = engine.getTelemetry();
    expect(telemetry.decisionHistory.length).toBe(1); // Baseline re-evaluation
    expect(telemetry.currentDecision).toBe('STREAM');
  });

  it('TEST 21: Accounting invariant remains strictly intact (DIFF == 0)', () => {
    engine.evaluateFromSystemState('LOW');
    engine.evaluateFromSystemState('HIGH');

    const snapshot = metricsCollector.getSnapshot();
    const totalQueued = snapshot.criticalQueueSize + snapshot.highQueueSize + snapshot.lowQueueSize;
    const inFlight = snapshot.criticalInFlight || 0;
    const diff = snapshot.totalReceived - (snapshot.totalProcessed + totalQueued + snapshot.shedCount + inFlight);

    expect(diff).toBe(0);
  });
});
