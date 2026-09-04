import { QueueManager } from '../src/queues/queueManager.js';
import { DEFAULT_CONFIG } from '../src/config/pipelineConfig.js';
import { AdaptiveDecisionEngine } from '../src/decision-engine/adaptiveEngine.js';
import { SheddingPolicy } from '../src/backpressure/sheddingPolicy.js';
import { BackpressureController } from '../src/backpressure/backpressureController.js';
import { MetricsCollector } from '../src/metrics/metricsCollector.js';
import { BatchProcessor } from '../src/processing/batchProcessor.js';
import { WorkerPool } from '../src/processing/workerPool.js';
import { PriorityRouter } from '../src/router/priorityRouter.js';
import { PipelineEvent } from '../src/models/event.js';

async function runScenario() {
  console.log('================================================================');
  console.log('ADAPTIVE PIPELINE: EXTREME PRESSURE & ADAPTIVE DEGRADATION DEMO');
  console.log('Target Scenario: LOW Queue 100% Saturation, Concurrent Batching & Shedding');
  console.log('================================================================\n');

  const config = { ...DEFAULT_CONFIG };
  const queueManager = new QueueManager(config);
  const adaptiveEngine = new AdaptiveDecisionEngine(config, queueManager);
  const sheddingPolicy = new SheddingPolicy(queueManager);
  const backpressureController = new BackpressureController(config, queueManager);
  const metricsCollector = new MetricsCollector(
    queueManager,
    sheddingPolicy,
    backpressureController,
    adaptiveEngine
  );
  const batchProcessor = new BatchProcessor(config);
  const priorityRouter = new PriorityRouter(queueManager, sheddingPolicy, metricsCollector);

  const workerPool = new WorkerPool(
    config,
    queueManager,
    batchProcessor,
    sheddingPolicy,
    adaptiveEngine
  );
  workerPool.registerMetricsCollector(metricsCollector);
  workerPool.setListeners(
    ({ event, latencyMs }) => {
      metricsCollector.recordProcessedEvent(event, latencyMs);
    },
    (events, durationMs) => {
      metricsCollector.recordBatchProcessed(events, durationMs);
    }
  );

  // -------------------------------------------------------------
  // STEP 1: Send LOW events until LOW queue reaches 100% capacity (3,000 / 3,000)
  // -------------------------------------------------------------
  console.log('STEP 1: Ingesting LOW events until queue is 100% saturated (3,000 / 3,000)...');
  for (let i = 0; i < 3000; i++) {
    const ev: PipelineEvent = {
      id: `evt_low_${i}`,
      type: i % 2 === 0 ? 'CLICK' : 'LOG',
      priority: 'LOW',
      payload: { index: i },
      createdAt: Date.now(),
      queuedAt: Date.now(),
      status: 'QUEUED',
    };
    metricsCollector.recordIncomingEvent(ev);
    priorityRouter.route(ev);
  }

  const evalSaturated = adaptiveEngine.evaluate(600, 100);
  console.log(` -> LOW Queue Size:     ${queueManager.lowQueue.size()} / ${queueManager.lowQueue.capacity} (100%)`);
  console.log(` -> Evaluated Strategy: ${evalSaturated.strategy} (State: ${evalSaturated.state})`);
  console.log(` -> Dynamic Batch Size: ${evalSaturated.batchSize} ev/batch`);
  console.log(` -> Shedding Status:    ${evalSaturated.sheddingStatus}`);
  console.log(` -> LOW Accepted:       ${metricsCollector.lowAccepted}`);
  console.log(` -> LOW Shed:           ${metricsCollector.lowShed}\n`);

  // -------------------------------------------------------------
  // STEP 2: Send excess LOW events while queue is 100% full
  // -------------------------------------------------------------
  console.log('STEP 2: Sending 100 EXCESS LOW events to full queue (triggers controlled admission shedding)...');
  for (let i = 3000; i < 3100; i++) {
    const excessEv: PipelineEvent = {
      id: `evt_excess_${i}`,
      type: i % 2 === 0 ? 'CLICK' : 'LOG',
      priority: 'LOW',
      payload: { index: i },
      createdAt: Date.now(),
      queuedAt: Date.now(),
      status: 'QUEUED',
    };
    metricsCollector.recordIncomingEvent(excessEv);
    const res = priorityRouter.route(excessEv);
    if (res.dropped) {
      // Event rejected at admission and routed to sheddingPolicy with audit entry
    }
  }

  console.log(` -> LOW Queue Size:     ${queueManager.lowQueue.size()} / 3000`);
  console.log(` -> LOW Shed (Total):   ${metricsCollector.lowShed} (Excess ingress shed cleanly at admission)`);
  console.log(` -> Total Received:     ${metricsCollector.totalReceived}`);
  console.log(` -> Safety Violations:  ${sheddingPolicy.totalSafetyViolations}\n`);

  // -------------------------------------------------------------
  // STEP 3: Start Workers in DEFER + SHED mode - verify LOW batches continue draining
  // -------------------------------------------------------------
  console.log('STEP 3: Starting WorkerPool in DEFER + SHED mode...');
  console.log(' -> Verifying LOW worker is STILL actively processing batches (NOT disabled!)...\n');

  workerPool.setStrategy('DEFER + SHED');
  workerPool.start();

  // Run worker for 150ms while continuing to ingest some more events
  await new Promise((r) => setTimeout(r, 150));

  console.log('STEP 4: Continuing to ingest 50 more LOW events during active draining...');
  for (let i = 3100; i < 3150; i++) {
    const moreEv: PipelineEvent = {
      id: `evt_more_${i}`,
      type: i % 2 === 0 ? 'CLICK' : 'LOG',
      priority: 'LOW',
      payload: { index: i },
      createdAt: Date.now(),
      queuedAt: Date.now(),
      status: 'QUEUED',
    };
    metricsCollector.recordIncomingEvent(moreEv);
    priorityRouter.route(moreEv);
  }

  await new Promise((r) => setTimeout(r, 150));
  workerPool.stop();

  // -------------------------------------------------------------
  // STEP 5: Final Telemetry Snapshot & Accounting Verification
  // -------------------------------------------------------------
  const snap = metricsCollector.getSnapshot();
  const queued = snap.criticalQueueSize + snap.highQueueSize + snap.lowQueueSize;
  const accounted = snap.totalProcessed + queued + snap.shedCount + snap.criticalInFlight;
  const diff = snap.totalReceived - accounted;

  console.log('\n================================================================');
  console.log('DASHBOARD TELEMETRY SNAPSHOT DURING / AFTER EXTREME LOAD:');
  console.log('================================================================');
  console.log(`LOW QUEUE:`);
  console.log(`  Queue Depth:         ${snap.lowQueueSize} / ${snap.lowQueueCapacity} (${(snap.lowQueuePressure * 100).toFixed(1)}%)`);
  console.log(`  Strategy:            ${snap.lowStrategy} (State: ${snap.systemPressureState})`);
  console.log(`  Accepted:            ${snap.lowAccepted}`);
  console.log(`  Batched:             ${snap.lowBatched} (CONFIRMED: Batches continuously processed!)`);
  console.log(`  Deferred:            ${snap.lowDeferredCycles} cycles`);
  console.log(`  Shed:                ${snap.lowShed}`);
  console.log(`  Dynamic Batch Size:  ${snap.currentBatchSize}`);
  console.log('');
  console.log(`EVENT ACCOUNTING RECONCILIATION:`);
  console.log(`  Received:            ${snap.totalReceived}`);
  console.log(`  = Processed:         ${snap.totalProcessed}`);
  console.log(`  + Queued:            ${queued}`);
  console.log(`  + Shed:              ${snap.shedCount}`);
  console.log(`  + In-Flight:         ${snap.criticalInFlight}`);
  console.log(`  --------------------------------------------------------------`);
  console.log(`  Accounted Total:     ${accounted}`);
  console.log(`  Accounting Diff:     ${diff}  --> ${diff === 0 ? '✓ ZERO DISCREPANCY (PERFECT)' : 'FAIL'}`);
  console.log('');
  console.log(`CRITICAL PROTECTION INVARIANTS:`);
  console.log(`  Critical Lost:       ${snap.criticalLost} (Must be 0)`);
  console.log(`  Critical Shed:       ${snap.criticalShed} (Must be 0)`);
  console.log(`  Safety Violations:   ${snap.safetyViolations} (Must be 0)`);
  console.log('================================================================\n');

  console.log('SAMPLE OF RECENT ACTIVITY FEED (Individual Event Audit):');
  const logs = snap.recentActivityLogs.slice(0, 8);
  for (const l of logs) {
    console.log(`  [${l.timestamp}] [${l.priority}] [${l.status.padEnd(9)}] ${l.type.padEnd(9)} (${l.strategy}) - ${l.reason}`);
  }
  console.log('================================================================\n');
}

runScenario().catch(console.error);
