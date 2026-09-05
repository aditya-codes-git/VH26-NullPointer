import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  WORKLOAD_CONFIGS,
  WorkloadScenario,
  sampleEventTypeForScenario,
  isValidWorkloadScenario,
} from '../src/config/workloadConfig.js';
import { EventSimulator } from '../src/simulator/eventSimulator.js';
import { MetricsCollector } from '../src/metrics/metricsCollector.js';
import { QueueManager } from '../src/queues/queueManager.js';
import { SheddingPolicy } from '../src/backpressure/sheddingPolicy.js';
import { BackpressureController } from '../src/backpressure/backpressureController.js';
import { AdaptiveDecisionEngine } from '../src/decision-engine/adaptiveEngine.js';
import { PriorityRouter } from '../src/router/priorityRouter.js';
import { WorkerPool } from '../src/processing/workerPool.js';
import { DEFAULT_CONFIG } from '../src/config/pipelineConfig.js';
import { classifyEvent } from '../src/classifier/eventClassifier.js';
import { DuplicateDetector } from '../src/resilience/duplicateDetector.js';
import { RetryController } from '../src/resilience/retryController.js';
import { WorkerScaler } from '../src/workers/workerScaler.js';
import { FormalizedDecisionEngine } from '../src/decision-engine/formalizedDecisionEngine.js';
import { PipelineEvent } from '../src/models/event.js';

describe('Dynamic Workload & Priority Distribution Control', () => {
  // -------------------------------------------------------------
  // Requirements 1-5: Configurations & Mathematical Invariants
  // -------------------------------------------------------------
  it('1. CRITICAL_HEAVY configuration exists with correct dominant priority', () => {
    expect(WORKLOAD_CONFIGS.CRITICAL_HEAVY).toBeDefined();
    expect(WORKLOAD_CONFIGS.CRITICAL_HEAVY.dominantPriority).toBe('CRITICAL');
    expect(WORKLOAD_CONFIGS.CRITICAL_HEAVY.priorityDistribution.CRITICAL).toBe(60);
    expect(WORKLOAD_CONFIGS.CRITICAL_HEAVY.priorityDistribution.HIGH).toBe(20);
    expect(WORKLOAD_CONFIGS.CRITICAL_HEAVY.priorityDistribution.LOW).toBe(20);
    expect(WORKLOAD_CONFIGS.CRITICAL_HEAVY.eventDistribution.PAYMENT).toBe(30);
    expect(WORKLOAD_CONFIGS.CRITICAL_HEAVY.eventDistribution.ORDER).toBe(30);
    expect(WORKLOAD_CONFIGS.CRITICAL_HEAVY.eventDistribution.INVENTORY).toBe(20);
    expect(WORKLOAD_CONFIGS.CRITICAL_HEAVY.eventDistribution.CLICK).toBe(10);
    expect(WORKLOAD_CONFIGS.CRITICAL_HEAVY.eventDistribution.LOG).toBe(10);
  });

  it('2. HIGH_HEAVY configuration exists with correct dominant priority', () => {
    expect(WORKLOAD_CONFIGS.HIGH_HEAVY).toBeDefined();
    expect(WORKLOAD_CONFIGS.HIGH_HEAVY.dominantPriority).toBe('HIGH');
    expect(WORKLOAD_CONFIGS.HIGH_HEAVY.priorityDistribution.CRITICAL).toBe(20);
    expect(WORKLOAD_CONFIGS.HIGH_HEAVY.priorityDistribution.HIGH).toBe(60);
    expect(WORKLOAD_CONFIGS.HIGH_HEAVY.priorityDistribution.LOW).toBe(20);
    expect(WORKLOAD_CONFIGS.HIGH_HEAVY.eventDistribution.PAYMENT).toBe(10);
    expect(WORKLOAD_CONFIGS.HIGH_HEAVY.eventDistribution.ORDER).toBe(10);
    expect(WORKLOAD_CONFIGS.HIGH_HEAVY.eventDistribution.INVENTORY).toBe(60);
    expect(WORKLOAD_CONFIGS.HIGH_HEAVY.eventDistribution.CLICK).toBe(10);
    expect(WORKLOAD_CONFIGS.HIGH_HEAVY.eventDistribution.LOG).toBe(10);
  });

  it('3. LOW_HEAVY configuration exists with correct dominant priority', () => {
    expect(WORKLOAD_CONFIGS.LOW_HEAVY).toBeDefined();
    expect(WORKLOAD_CONFIGS.LOW_HEAVY.dominantPriority).toBe('LOW');
    expect(WORKLOAD_CONFIGS.LOW_HEAVY.priorityDistribution.CRITICAL).toBe(20);
    expect(WORKLOAD_CONFIGS.LOW_HEAVY.priorityDistribution.HIGH).toBe(20);
    expect(WORKLOAD_CONFIGS.LOW_HEAVY.priorityDistribution.LOW).toBe(60);
    expect(WORKLOAD_CONFIGS.LOW_HEAVY.eventDistribution.PAYMENT).toBe(10);
    expect(WORKLOAD_CONFIGS.LOW_HEAVY.eventDistribution.ORDER).toBe(10);
    expect(WORKLOAD_CONFIGS.LOW_HEAVY.eventDistribution.INVENTORY).toBe(20);
    expect(WORKLOAD_CONFIGS.LOW_HEAVY.eventDistribution.CLICK).toBe(30);
    expect(WORKLOAD_CONFIGS.LOW_HEAVY.eventDistribution.LOG).toBe(30);
  });

  it('4. Every event distribution sums to exactly 100%', () => {
    const scenarios: WorkloadScenario[] = ['CRITICAL_HEAVY', 'HIGH_HEAVY', 'LOW_HEAVY'];
    for (const sc of scenarios) {
      const dist = WORKLOAD_CONFIGS[sc].eventDistribution;
      const total = dist.PAYMENT + dist.ORDER + dist.INVENTORY + dist.CLICK + dist.LOG;
      expect(total).toBe(100);
    }
  });

  it('5. Every priority distribution sums to exactly 100%', () => {
    const scenarios: WorkloadScenario[] = ['CRITICAL_HEAVY', 'HIGH_HEAVY', 'LOW_HEAVY'];
    for (const sc of scenarios) {
      const dist = WORKLOAD_CONFIGS[sc].priorityDistribution;
      const total = dist.CRITICAL + dist.HIGH + dist.LOW;
      expect(total).toBe(100);

      // Verify event-priority alignment:
      // CRITICAL = PAYMENT + ORDER
      // HIGH = INVENTORY
      // LOW = CLICK + LOG
      const eventDist = WORKLOAD_CONFIGS[sc].eventDistribution;
      expect(dist.CRITICAL).toBe(eventDist.PAYMENT + eventDist.ORDER);
      expect(dist.HIGH).toBe(eventDist.INVENTORY);
      expect(dist.LOW).toBe(eventDist.CLICK + eventDist.LOG);
    }
  });

  // -------------------------------------------------------------
  // Requirements 6-8: Runtime Selection & Simulator Configuration
  // -------------------------------------------------------------
  it('6, 7, 8. Selecting scenarios updates simulator getScenario() and rejects invalid', () => {
    const simulator = new EventSimulator(DEFAULT_CONFIG, () => {});

    expect(simulator.getScenario()).toBe('LOW_HEAVY');

    simulator.setScenario('CRITICAL_HEAVY');
    expect(simulator.getScenario()).toBe('CRITICAL_HEAVY');

    simulator.setScenario('HIGH_HEAVY');
    expect(simulator.getScenario()).toBe('HIGH_HEAVY');

    simulator.setScenario('LOW_HEAVY');
    expect(simulator.getScenario()).toBe('LOW_HEAVY');

    expect(isValidWorkloadScenario('CRITICAL_HEAVY')).toBe(true);
    expect(isValidWorkloadScenario('HIGH_HEAVY')).toBe(true);
    expect(isValidWorkloadScenario('LOW_HEAVY')).toBe(true);
    expect(isValidWorkloadScenario('INVALID_SCENARIO')).toBe(false);
    expect(isValidWorkloadScenario(null)).toBe(false);
  });

  // -------------------------------------------------------------
  // Requirement 9: Statistical Distribution of Generated Events
  // -------------------------------------------------------------
  it('9. Generated events follow selected scenario distribution within statistical tolerance (N=5000)', () => {
    const N = 5000;

    // Test CRITICAL_HEAVY: Expect CRITICAL ~60%, HIGH ~20%, LOW ~20%
    const countsCrit = { PAYMENT: 0, ORDER: 0, INVENTORY: 0, CLICK: 0, LOG: 0 };
    for (let i = 0; i < N; i++) {
      countsCrit[sampleEventTypeForScenario('CRITICAL_HEAVY')]++;
    }
    const critPercent = ((countsCrit.PAYMENT + countsCrit.ORDER) / N) * 100;
    const highPercentCrit = (countsCrit.INVENTORY / N) * 100;
    const lowPercentCrit = ((countsCrit.CLICK + countsCrit.LOG) / N) * 100;

    expect(critPercent).toBeGreaterThanOrEqual(56);
    expect(critPercent).toBeLessThanOrEqual(64);
    expect(highPercentCrit).toBeGreaterThanOrEqual(17);
    expect(highPercentCrit).toBeLessThanOrEqual(23);
    expect(lowPercentCrit).toBeGreaterThanOrEqual(17);
    expect(lowPercentCrit).toBeLessThanOrEqual(23);

    // Test HIGH_HEAVY: Expect CRITICAL ~20%, HIGH ~60%, LOW ~20%
    const countsHigh = { PAYMENT: 0, ORDER: 0, INVENTORY: 0, CLICK: 0, LOG: 0 };
    for (let i = 0; i < N; i++) {
      countsHigh[sampleEventTypeForScenario('HIGH_HEAVY')]++;
    }
    const critPercentHigh = ((countsHigh.PAYMENT + countsHigh.ORDER) / N) * 100;
    const highPercent = (countsHigh.INVENTORY / N) * 100;
    const lowPercentHigh = ((countsHigh.CLICK + countsHigh.LOG) / N) * 100;

    expect(critPercentHigh).toBeGreaterThanOrEqual(17);
    expect(critPercentHigh).toBeLessThanOrEqual(23);
    expect(highPercent).toBeGreaterThanOrEqual(56);
    expect(highPercent).toBeLessThanOrEqual(64);
    expect(lowPercentHigh).toBeGreaterThanOrEqual(17);
    expect(lowPercentHigh).toBeLessThanOrEqual(23);

    // Test LOW_HEAVY: Expect CRITICAL ~20%, HIGH ~20%, LOW ~60%
    const countsLow = { PAYMENT: 0, ORDER: 0, INVENTORY: 0, CLICK: 0, LOG: 0 };
    for (let i = 0; i < N; i++) {
      countsLow[sampleEventTypeForScenario('LOW_HEAVY')]++;
    }
    const critPercentLow = ((countsLow.PAYMENT + countsLow.ORDER) / N) * 100;
    const highPercentLow = (countsLow.INVENTORY / N) * 100;
    const lowPercent = ((countsLow.CLICK + countsLow.LOG) / N) * 100;

    expect(critPercentLow).toBeGreaterThanOrEqual(17);
    expect(critPercentLow).toBeLessThanOrEqual(23);
    expect(highPercentLow).toBeGreaterThanOrEqual(17);
    expect(highPercentLow).toBeLessThanOrEqual(23);
    expect(lowPercent).toBeGreaterThanOrEqual(56);
    expect(lowPercent).toBeLessThanOrEqual(64);
  });

  // -------------------------------------------------------------
  // Requirement 10: Actual Distribution Calculated from Real Events
  // -------------------------------------------------------------
  it('10. Actual distribution is calculated strictly from real received events, not config', () => {
    const queueManager = new QueueManager(DEFAULT_CONFIG);
    const sheddingPolicy = new SheddingPolicy();
    const backpressure = new BackpressureController(DEFAULT_CONFIG, queueManager);
    const adaptiveEngine = new AdaptiveDecisionEngine(DEFAULT_CONFIG);
    const metrics = new MetricsCollector(queueManager, sheddingPolicy, backpressure, adaptiveEngine);

    // Manually record specific real events: 3 PAYMENT, 2 ORDER, 1 INVENTORY, 4 CLICK
    // Total = 10 events: CRITICAL = 5 (50%), HIGH = 1 (10%), LOW = 4 (40%)
    const now = Date.now();
    for (let i = 0; i < 3; i++) {
      metrics.recordIncomingEvent({ id: `p_${i}`, type: 'PAYMENT', priority: 'CRITICAL', payload: {}, createdAt: now, queuedAt: now, status: 'QUEUED' });
    }
    for (let i = 0; i < 2; i++) {
      metrics.recordIncomingEvent({ id: `o_${i}`, type: 'ORDER', priority: 'CRITICAL', payload: {}, createdAt: now, queuedAt: now, status: 'QUEUED' });
    }
    metrics.recordIncomingEvent({ id: 'inv_1', type: 'INVENTORY', priority: 'HIGH', payload: {}, createdAt: now, queuedAt: now, status: 'QUEUED' });
    for (let i = 0; i < 4; i++) {
      metrics.recordIncomingEvent({ id: `c_${i}`, type: 'CLICK', priority: 'LOW', payload: {}, createdAt: now, queuedAt: now, status: 'QUEUED' });
    }

    const dist = metrics.getRunDistribution();
    expect(dist.actual.CRITICAL).toBe(50.0);
    expect(dist.actual.HIGH).toBe(10.0);
    expect(dist.actual.LOW).toBe(40.0);
    expect(dist.actual.PAYMENT).toBe(30.0);
    expect(dist.actual.ORDER).toBe(20.0);
    expect(dist.actual.INVENTORY).toBe(10.0);
    expect(dist.actual.CLICK).toBe(40.0);
    expect(dist.actual.LOG).toBe(0.0);
    expect(dist.runCounts.totalRunReceived).toBe(10);
  });

  // -------------------------------------------------------------
  // Requirement 11: Cannot Switch Scenario During Active Run
  // -------------------------------------------------------------
  it('11. Scenario cannot be changed while simulator is running', () => {
    const simulator = new EventSimulator(DEFAULT_CONFIG, () => {});
    simulator.startNormal();

    expect(simulator.isRunning()).toBe(true);
    expect(() => simulator.setScenario('CRITICAL_HEAVY')).toThrow(/actively running/i);

    simulator.stop();
    expect(simulator.isRunning()).toBe(false);
    expect(() => simulator.setScenario('CRITICAL_HEAVY')).not.toThrow();
    expect(simulator.getScenario()).toBe('CRITICAL_HEAVY');
  });

  // -------------------------------------------------------------
  // Requirement 12: Clean Run-Specific Counters on New Run
  // -------------------------------------------------------------
  it('12. resetRunCounters() cleanly resets run-specific counters without losing total lifetime counts', () => {
    const queueManager = new QueueManager(DEFAULT_CONFIG);
    const sheddingPolicy = new SheddingPolicy();
    const backpressure = new BackpressureController(DEFAULT_CONFIG, queueManager);
    const adaptiveEngine = new AdaptiveDecisionEngine(DEFAULT_CONFIG);
    const metrics = new MetricsCollector(queueManager, sheddingPolicy, backpressure, adaptiveEngine);

    const now = Date.now();
    for (let i = 0; i < 50; i++) {
      metrics.recordIncomingEvent({ id: `ev_${i}`, type: 'ORDER', priority: 'CRITICAL', payload: {}, createdAt: now, queuedAt: now, status: 'QUEUED' });
    }

    expect(metrics.totalReceived).toBe(50);
    expect(metrics.runTotalReceived).toBe(50);
    expect(metrics.getRunDistribution().actual.CRITICAL).toBe(100);

    // Reset run for a new scenario
    metrics.resetRunCounters();

    expect(metrics.totalReceived).toBe(50); // Total remains intact
    expect(metrics.runTotalReceived).toBe(0); // Run counters reset
    expect(metrics.runOrderReceived).toBe(0);
    expect(metrics.getRunDistribution().actual.CRITICAL).toBe(0);

    // Record 20 INVENTORY events in the new run
    for (let i = 0; i < 20; i++) {
      metrics.recordIncomingEvent({ id: `inv_${i}`, type: 'INVENTORY', priority: 'HIGH', payload: {}, createdAt: now, queuedAt: now, status: 'QUEUED' });
    }

    expect(metrics.totalReceived).toBe(70);
    expect(metrics.runTotalReceived).toBe(20);
    expect(metrics.getRunDistribution().actual.HIGH).toBe(100);
    expect(metrics.getRunDistribution().actual.CRITICAL).toBe(0); // Isolated from prior run!
  });

  // -------------------------------------------------------------
  // Requirement 13: Invalid Scenario is Rejected
  // -------------------------------------------------------------
  it('13. Invalid scenario throws informative error and is rejected', () => {
    const simulator = new EventSimulator(DEFAULT_CONFIG, () => {});
    // @ts-expect-error test invalid scenario
    expect(() => simulator.setScenario('SUPER_CRITICAL')).toThrow(/Invalid workload scenario/i);
    // @ts-expect-error test invalid scenario
    expect(() => simulator.setScenario('')).toThrow(/Invalid workload scenario/i);
  });

  // -------------------------------------------------------------
  // Requirement 14: Pipeline Invariant Holds
  // RECEIVED = PROCESSED + QUEUED + SHED + IN_FLIGHT
  // -------------------------------------------------------------
  it('14. Accounting invariant holds: RECEIVED = PROCESSED + QUEUED + SHED + IN_FLIGHT', async () => {
    const queueManager = new QueueManager(DEFAULT_CONFIG);
    const sheddingPolicy = new SheddingPolicy();
    const backpressure = new BackpressureController(DEFAULT_CONFIG, queueManager);
    const adaptiveEngine = new AdaptiveDecisionEngine(DEFAULT_CONFIG);
    const metrics = new MetricsCollector(queueManager, sheddingPolicy, backpressure, adaptiveEngine);

    const router = new PriorityRouter(queueManager, sheddingPolicy, metrics);
    const workerPool = new WorkerPool(DEFAULT_CONFIG, queueManager, metrics, sheddingPolicy);

    // Feed 100 events across priorities
    const now = Date.now();
    for (let i = 0; i < 100; i++) {
      const type = sampleEventTypeForScenario('CRITICAL_HEAVY');
      const priority = classifyEvent(type);
      const event: PipelineEvent = {
        id: `inv_evt_${i}`,
        type,
        priority,
        payload: { test: true },
        createdAt: now,
        queuedAt: now,
        status: 'QUEUED',
      };
      metrics.recordIncomingEvent(event);
      router.route(event);
    }

    // Check invariant before worker processing
    const queuedCountBefore = queueManager.getTotalQueued();
    const shedCountBefore = sheddingPolicy.totalShedCount;
    const processedCountBefore = metrics.totalProcessed;
    const inFlightBefore = metrics.criticalInFlight;

    expect(metrics.totalReceived).toBe(processedCountBefore + queuedCountBefore + shedCountBefore + inFlightBefore);
  });

  // -------------------------------------------------------------
  // Requirements 15-18: Non-Regression of Other Systems
  // -------------------------------------------------------------
  it('15. Priority classification remains accurate for all event types', () => {
    expect(classifyEvent('PAYMENT')).toBe('CRITICAL');
    expect(classifyEvent('ORDER')).toBe('CRITICAL');
    expect(classifyEvent('INVENTORY')).toBe('HIGH');
    expect(classifyEvent('CLICK')).toBe('LOW');
    expect(classifyEvent('LOG')).toBe('LOW');
  });

  it('16. Duplicate detection still works with dynamic workload events', () => {
    const detector = new DuplicateDetector(60, 1000);
    const firstCheck = detector.checkAndRegister('EVT-WORKLOAD-101', 'PAYMENT', 'CRITICAL');
    expect(firstCheck.isDuplicate).toBe(false);

    const duplicateCheck = detector.checkAndRegister('EVT-WORKLOAD-101', 'PAYMENT', 'CRITICAL');
    expect(duplicateCheck.isDuplicate).toBe(true);
    expect(detector.duplicatesDetected).toBe(1);
    expect(detector.duplicatesPrevented).toBe(1);
  });

  it('17. Fault tolerance works with dynamically sampled events', () => {
    const queueManager = new QueueManager(DEFAULT_CONFIG);
    const retryController = new RetryController(DEFAULT_CONFIG, queueManager);
    retryController.armFailure();

    const event: PipelineEvent = {
      id: 'EVT-FT-1',
      type: 'ORDER',
      priority: 'CRITICAL',
      payload: {},
      createdAt: Date.now(),
      queuedAt: Date.now(),
      status: 'QUEUED',
    };

    const willFail = retryController.shouldSimulateFailure(event);
    expect(willFail).toBe(true);
    expect(retryController.isArmed()).toBe(false);
  });

  it('18. Dynamic worker scaler evaluates system state accurately', () => {
    const queueManager = new QueueManager(DEFAULT_CONFIG);
    const sheddingPolicy = new SheddingPolicy(queueManager);
    const metrics = new MetricsCollector(
      queueManager,
      sheddingPolicy,
      new BackpressureController(DEFAULT_CONFIG, queueManager),
      new AdaptiveDecisionEngine(DEFAULT_CONFIG, queueManager)
    );
    const workerPool = new WorkerPool(DEFAULT_CONFIG, queueManager, metrics, sheddingPolicy);
    workerPool.start();
    const scaler = new WorkerScaler(DEFAULT_CONFIG, workerPool, queueManager, metrics);

    const telemetry = scaler.getTelemetry();
    expect(telemetry.currentWorkers).toBe(2);
    expect(telemetry.minWorkers).toBe(2);
    expect(telemetry.maxWorkers).toBe(8);
    workerPool.stop();
  });

  // -------------------------------------------------------------
  // Requirement 19: Telemetry Snapshot Reflects Real Backend State
  // -------------------------------------------------------------
  it('19. Telemetry snapshot includes complete workload telemetry with configured vs actual', () => {
    const queueManager = new QueueManager(DEFAULT_CONFIG);
    const sheddingPolicy = new SheddingPolicy(queueManager);
    const backpressure = new BackpressureController(DEFAULT_CONFIG, queueManager);
    const adaptiveEngine = new AdaptiveDecisionEngine(DEFAULT_CONFIG, queueManager);
    const metrics = new MetricsCollector(queueManager, sheddingPolicy, backpressure, adaptiveEngine);
    const simulator = new EventSimulator(DEFAULT_CONFIG, () => {});
    metrics.registerSimulator(simulator);

    simulator.setScenario('HIGH_HEAVY');

    // Simulate 100 incoming events
    const now = Date.now();
    for (let i = 0; i < 60; i++) {
      metrics.recordIncomingEvent({ id: `inv_${i}`, type: 'INVENTORY', priority: 'HIGH', payload: {}, createdAt: now, queuedAt: now, status: 'QUEUED' });
    }
    for (let i = 0; i < 20; i++) {
      metrics.recordIncomingEvent({ id: `pay_${i}`, type: 'PAYMENT', priority: 'CRITICAL', payload: {}, createdAt: now, queuedAt: now, status: 'QUEUED' });
    }
    for (let i = 0; i < 20; i++) {
      metrics.recordIncomingEvent({ id: `clk_${i}`, type: 'CLICK', priority: 'LOW', payload: {}, createdAt: now, queuedAt: now, status: 'QUEUED' });
    }

    const snapshot = metrics.getSnapshot();
    expect(snapshot.workload).toBeDefined();
    expect(snapshot.workload?.activeWorkloadScenario).toBe('HIGH_HEAVY');
    expect(snapshot.workload?.configuredDistribution.HIGH).toBe(60);
    expect(snapshot.workload?.actualDistribution.HIGH).toBe(60.0);
    expect(snapshot.workload?.actualDistribution.CRITICAL).toBe(20.0);
    expect(snapshot.workload?.actualDistribution.LOW).toBe(20.0);
    expect(snapshot.workload?.runEventCounts.inventoryReceived).toBe(60);
    expect(snapshot.workload?.runEventCounts.totalRunReceived).toBe(100);
  });

  // -------------------------------------------------------------
  // HTTP REST API Endpoint Tests
  // -------------------------------------------------------------
  describe('HTTP API Endpoints: /api/simulator/workload', () => {
    let server: any;
    let baseUrl: string;
    let simulator: EventSimulator;
    let metricsCollector: MetricsCollector;

    beforeEach(async () => {
      const express = (await import('express')).default;
      const { createServer } = await import('http');
      const { createApiRouter } = await import('../src/api/routes.js');

      const app = express();
      app.use(express.json());

      const config = { ...DEFAULT_CONFIG };
      const queueManager = new QueueManager(config);
      const sheddingPolicy = new SheddingPolicy(queueManager);
      const backpressure = new BackpressureController(config, queueManager);
      const adaptiveEngine = new AdaptiveDecisionEngine(config, queueManager);
      metricsCollector = new MetricsCollector(queueManager, sheddingPolicy, backpressure, adaptiveEngine);
      simulator = new EventSimulator(config, () => {});
      metricsCollector.registerSimulator(simulator);

      app.use('/api', createApiRouter(simulator, metricsCollector, config));

      await new Promise<void>((resolve) => {
        server = createServer(app);
        server.listen(0, () => {
          const port = (server.address() as any).port;
          baseUrl = `http://localhost:${port}/api`;
          resolve();
        });
      });
    });

    afterEach(async () => {
      simulator.stop();
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('GET /api/simulator/workload returns active configuration and distributions', async () => {
      const res = await fetch(`${baseUrl}/simulator/workload`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.scenario).toBe('LOW_HEAVY');
      expect(body.configuredPriorityDistribution.LOW).toBe(60);
      expect(body.configuredEventDistribution.CLICK).toBe(30);
    });

    it('POST /api/simulator/workload updates scenario and resets run counters', async () => {
      // Record some prior event
      metricsCollector.recordIncomingEvent({
        id: 'prior_1',
        type: 'CLICK',
        priority: 'LOW',
        payload: {},
        createdAt: Date.now(),
        queuedAt: Date.now(),
        status: 'QUEUED',
      });
      expect(metricsCollector.runTotalReceived).toBe(1);

      const res = await fetch(`${baseUrl}/simulator/workload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: 'CRITICAL_HEAVY' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.scenario).toBe('CRITICAL_HEAVY');
      expect(body.configuredPriorityDistribution.CRITICAL).toBe(60);
      expect(simulator.getScenario()).toBe('CRITICAL_HEAVY');
      expect(metricsCollector.runTotalReceived).toBe(0); // Clean run reset
    });

    it('POST /api/simulator/workload rejects 409 Conflict when traffic is running', async () => {
      simulator.startNormal();
      expect(simulator.isRunning()).toBe(true);

      const res = await fetch(`${baseUrl}/simulator/workload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: 'HIGH_HEAVY' }),
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toMatch(/traffic is actively running/i);
    });

    it('POST /api/simulator/workload rejects 400 Bad Request on invalid scenario', async () => {
      const res = await fetch(`${baseUrl}/simulator/workload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario: 'UNKNOWN_SCENARIO' }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Invalid workload scenario/i);
    });

    it('POST /api/simulator/workload/reset resets run counters', async () => {
      metricsCollector.recordIncomingEvent({
        id: 'prior_2',
        type: 'ORDER',
        priority: 'CRITICAL',
        payload: {},
        createdAt: Date.now(),
        queuedAt: Date.now(),
        status: 'QUEUED',
      });
      expect(metricsCollector.runTotalReceived).toBe(1);

      const res = await fetch(`${baseUrl}/simulator/workload/reset`, {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      expect(metricsCollector.runTotalReceived).toBe(0);
    });
  });
});

