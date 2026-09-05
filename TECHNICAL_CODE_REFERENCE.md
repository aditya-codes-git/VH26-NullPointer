# AdaptiFlow: Technical Code Reference & Hackathon Study Guide

> **Target Audience**: Core engineering team preparing for technical presentations, system architecture reviews, and deep-dive judge questioning.
> **Source of Truth**: Current production repository (`backend/src/`, `frontend/src/`, `traffic-generator/`).
> **Audit Status**: Real implementation verified with automated tests; genuine constraints, simulated aspects, and known bug edge cases are documented transparently.

---

# Table of Contents
1. [System Architecture](#1-system-architecture)
2. [End-to-End File-by-File Technical Breakdown](#2-end-to-end-file-by-file-technical-breakdown)
   - [backend/src/classifier/eventClassifier.ts](#backendsrcclassifiereventclassifierts)
   - [backend/src/router/priorityRouter.ts](#backendsrcrouterpriorityrouterts)
   - [backend/src/queues/boundedQueue.ts](#backendsrcqueuesboundedqueuets)
   - [backend/src/processing/workerPool.ts](#backendsrcprocessingworkerpoolts)
   - [backend/src/processing/batchProcessor.ts](#backendsrcprocessingbatchprocessorts)
   - [backend/src/decision-engine/adaptiveEngine.ts](#backendsrcdecision-engineadaptiveenginets)
   - [backend/src/decision-engine/formalizedDecisionEngine.ts](#backendsrcdecision-engineformalizeddecisionenginets)
   - [backend/src/workers/workerScaler.ts](#backendsrcworkersworkerscalerts)
   - [backend/src/backpressure/backpressureController.ts](#backendsrcbackpressurebackpressurecontrollerts)
   - [backend/src/backpressure/sheddingPolicy.ts](#backendsrcbackpressuresheddingpolicyts)
   - [backend/src/resilience/duplicateDetector.ts](#backendsrcresilienceduplicatedetectorts)
   - [backend/src/resilience/retryController.ts](#backendsrcresilienceretrycontrollerts)
   - [backend/src/metrics/metricsCollector.ts](#backendsrcmetricsmetricscollectorts)
   - [backend/src/simulator/eventSimulator.ts](#backendsrcsimulatoreventsimulatorts)
   - [backend/src/config/pipelineConfig.ts](#backendsrcconfigpipelineconfigts)
   - [backend/src/config/workloadConfig.ts](#backendsrcconfigworkloadconfigts)
   - [backend/src/api/routes.ts](#backendsrcapiroutests)
   - [backend/src/supabase/supabaseClient.ts](#backendsrcsupabasesupabaseclientts)
   - [backend/src/persistence/historyPersister.ts](#backendsrcpersistencehistorypersisterts)
   - [traffic-generator/traffic_generator.py](#traffic-generatortraffic_generatorpy)
   - [frontend/src/services/socketClient.ts & Dashboard Components](#frontend-telemetry--dashboard-components)
   - [frontend/src/services/supabaseClient.ts & Auth / History Views](#frontend-supabase-auth--history-views)
3. [Core Algorithms: Input → Logic → Output](#3-core-algorithms-input--logic--output)
4. [Important Formulas & Mathematical Thresholds](#4-important-formulas--mathematical-thresholds)
5. [Complete Event Lifecycle Walkthrough](#5-complete-event-lifecycle-walkthrough)
6. [Code Ownership & Provenance Categorization](#6-code-ownership--provenance-categorization)
7. [18 Core Code Snippets to Memorize](#7-18-core-code-snippets-to-memorize)
8. [20 Technical Judge Questions & Answers](#8-20-technical-judge-questions--answers)

---

# 1. System Architecture

The AdaptiFlow runtime pipeline executes on Node.js/TypeScript. Events enter either via external HTTP ingestion (`POST /api/ingest`), the Kafka consumer (`consumer.ts`), or the in-memory test simulator (`eventSimulator.ts`).

### Actual Wire Pipeline Flow

```
[External Traffic / Simulator]
          │
          ▼
1. INGESTION ENDPOINT: POST /api/ingest (routes.ts)
          │
          ▼
2. DUPLICATE DETECTOR (duplicateDetector.ts)
     ├── [If Event ID admitted in last 60s] ──► REJECT HTTP 409 (Telemetry++)
     └── [If NEW Event ID] ───────────────────► ADMIT
          │
          ▼
3. EVENT CLASSIFIER (eventClassifier.ts)
     ├── PAYMENT, ORDER   ──► Priority: CRITICAL
     ├── INVENTORY        ──► Priority: HIGH
     └── CLICK, LOG       ──► Priority: LOW
          │
          ▼
4. METRICS RECORDING: metricsCollector.recordIncomingEvent()
          │
          ▼
5. PRIORITY ROUTER (priorityRouter.ts)
     ├── CRITICAL ──► CriticalQueue (Cap: 2,000)
     ├── HIGH     ──► HighQueue (Cap: 2,000)
     └── LOW      ──► LowQueue (Cap: 3,000) ──► [If Full: SheddingPolicy.shedSingleEvent()]
          │
          ├───► BACKPRESSURE CONTROLLER: If CriticalQueue >= 85% ──► Pause Ingestion
          │
          ▼
6. ADAPTIVE DECISION ENGINE & SCALER (adaptiveEngine.ts & workerScaler.ts)
     ├── Reads LowQueue Pressure, Imbalance Ratio & Worker Utilization
     ├── Sets Low Strategy: STREAM (Pressure < 30%) | BATCH (30-70%) | DEFER (70-92%) | SHED (>92%)
     ├── Calculates Dynamic Batch Size: 10, 25, 50, 100, 200, 250
     └── WorkerScaler scales worker pool concurrency (2 -> 4 -> 6 -> 8 -> 2)
          │
          ▼
7. WORKER POOL LOOP (workerPool.ts)
     ├── Step 1: Drain CriticalQueue (Strict Priority: 100% compute if present)
     ├── Step 2: Drain HighQueue
     └── Step 3: Service LowQueue (STREAM single event OR BATCH via batchProcessor.ts)
          │
          ▼
8. EXECUTION & RESILIENCE (workerPool.ts / batchProcessor.ts / retryController.ts)
     ├── Single Event Service Time: 7ms | Micro-Batch Delay: 15ms
     ├── If worker failure simulated: Isolated to RetryController (Exponential Backoff + DLQ)
     └── Completed Event: Idempotency Ledger checked to prevent duplicate side effects
          │
          ├───► 9A. REAL-TIME TELEMETRY (metricsCollector.ts -> socketServer.ts)
          │         └── Emitted every 500ms via WebSocket to Live Pipeline Dashboard
          │
          └───► 9B. PERSISTENT HISTORY (historyPersister.ts -> Supabase PostgreSQL)
                    ├── Non-blocking in-memory ring buffer (zero hot-path delay)
                    ├── Flushes in async batches of 100 to user-owned tables
                    └── Enforces PostgreSQL Row Level Security (RLS) via auth.uid()
```

---

# 2. End-to-End File-by-File Technical Breakdown

---

### `backend/src/classifier/eventClassifier.ts`
- **Purpose**: Pure deterministic classification mapping raw event string types to strict business priority tiers.
- **Main Classes/Functions**:
  - `classifyEvent(type: EventType): EventPriority`
- **Core Code Snippet**:
  ```typescript
  // Lines 7-19
  export function classifyEvent(type: EventType): EventPriority {
    switch (type) {
      case 'PAYMENT':
      case 'ORDER':
        return 'CRITICAL';
      case 'INVENTORY':
        return 'HIGH';
      case 'CLICK':
      case 'LOG':
      default:
        return 'LOW';
    }
  }
  ```
- **How It Works**: Evaluates incoming `type`. Financial/transactional events are assigned `CRITICAL`, stock level state mutations are `HIGH`, and analytics/observability events are `LOW`.
- **Used By**: `routes.ts`, `priorityRouter.ts`, `eventSimulator.ts`, `traffic_generator.py`.
- **Why It Matters**: Prevents business-critical orders from competing with low-value clickstream logs for identical handling.

---

### `backend/src/router/priorityRouter.ts`
- **Purpose**: Routes classified events into their dedicated bounded FIFO queues, invoking admission shedding if the low-priority queue is full.
- **Main Classes/Functions**:
  - `PriorityRouter.route(event: PipelineEvent): RouteResult`
- **Core Code Snippet**:
  ```typescript
  // Lines 36-76
  public route(event: PipelineEvent): RouteResult {
    switch (event.priority) {
      case 'CRITICAL': {
        const enqueued = this.queueManager.criticalQueue.enqueue(event);
        if (!enqueued) {
          return { success: false, queueName: 'CRITICAL_QUEUE', dropped: false, reason: 'CRITICAL_QUEUE_SATURATED' };
        }
        return { success: true, queueName: 'CRITICAL_QUEUE', dropped: false };
      }
      case 'HIGH': {
        const enqueued = this.queueManager.highQueue.enqueue(event);
        if (!enqueued) {
          return { success: false, queueName: 'HIGH_QUEUE', dropped: true, reason: 'HIGH_QUEUE_CAPACITY_EXCEEDED' };
        }
        return { success: true, queueName: 'HIGH_QUEUE', dropped: false };
      }
      case 'LOW':
      default: {
        const enqueued = this.queueManager.lowQueue.enqueue(event);
        if (!enqueued) {
          if (event.priority === 'LOW' && this.sheddingPolicy) {
            this.sheddingPolicy.shedSingleEvent(event, 'Low-priority queue capacity saturated: excess event shed at admission');
          }
          return { success: false, queueName: 'LOW_QUEUE', dropped: true, reason: 'LOW_QUEUE_CAPACITY_EXCEEDED' };
        }
        return { success: true, queueName: 'LOW_QUEUE', dropped: false };
      }
    }
  }
  ```
- **How It Works**: Pushes to `criticalQueue`, `highQueue`, or `lowQueue`. If `lowQueue` is at 3,000 capacity, invokes `sheddingPolicy.shedSingleEvent()` to record admission shedding and prevent memory overflow.
- **Known Bug / Limitation**: On line 59, if `highQueue` exceeds 2,000 items, it returns `dropped: true`, but does **not** call `sheddingPolicy` or increment any drop metric, silently dropping the high-priority event from accounting!
- **Used By**: `server.ts`, `routes.ts`, `kafka/consumer.ts`, `eventSimulator.ts`.
- **Why It Matters**: Enforces physical queue isolation between tiers.

---

### `backend/src/queues/boundedQueue.ts`
- **Purpose**: Memory-bounded FIFO queue implementation with batch extraction support.
- **Main Classes/Functions**:
  - `BoundedQueue` (`enqueue`, `dequeue`, `dequeueBatch`, `getPressure`, `peek`, `size`)
- **Core Code Snippet**:
  ```typescript
  // Lines 16-39
  public enqueue(event: PipelineEvent): boolean {
    if (this.queue.length >= this.capacity) {
      return false; // Queue is at full capacity
    }
    event.queuedAt = Date.now();
    event.status = 'QUEUED';
    this.queue.push(event);
    this.totalEnqueued++;
    return true;
  }

  public dequeueBatch(batchSize: number): PipelineEvent[] {
    const batch = this.queue.splice(0, batchSize);
    this.totalDequeued += batch.length;
    return batch;
  }

  public getPressure(): number {
    return this.capacity > 0 ? this.queue.length / this.capacity : 0;
  }
  ```
- **How It Works**: Uses an in-memory array. Rejects `enqueue` once `length >= capacity`. `dequeueBatch(N)` slices off up to `N` events in $O(N)$ time.
- **Used By**: `QueueManager`, `PriorityRouter`, `WorkerPool`, `MetricsCollector`.
- **Why It Matters**: Prevents unconstrained memory growth during flash spikes.

---

### `backend/src/processing/workerPool.ts`
- **Purpose**: Autonomous concurrent worker thread-loop simulator that coordinates priority dispatching, single-event processing, micro-batch execution, and scale adjustments.
- **Main Classes/Functions**:
  - `WorkerPool.runWorkerLoop(workerId: string)`
  - `WorkerPool.processSingleEvent(event, strategy, workerId)`
  - `WorkerPool.scaleTo(targetCount, reason)`
- **Core Code Snippet**:
  ```typescript
  // Lines 239-290
  // STEP 1: Always check Critical Queue first (Highest Priority)
  const criticalEvent = this.queueManager.criticalQueue.dequeue();
  if (criticalEvent) {
    this.markBusy(workerState, `CRITICAL: ${criticalEvent.type} (${criticalEvent.id})`);
    try {
      await this.processSingleEvent(criticalEvent, 'STREAM', workerId);
      workerState.processedCount++;
    } finally {
      this.markActive(workerState);
    }
    didWork = true;
    continue; // Immediately loops back to check critical queue again
  }

  // STEP 2: Check High Queue
  const highEvent = this.queueManager.highQueue.dequeue();
  if (highEvent) {
    this.markBusy(workerState, `HIGH: ${highEvent.type} (${highEvent.id})`);
    try {
      await this.processSingleEvent(highEvent, 'STREAM', workerId);
      workerState.processedCount++;
    } finally {
      this.markActive(workerState);
    }
    didWork = true;
    continue;
  }

  // STEP 3: Handle Low Priority Queue based on active adaptive strategy
  switch (this.activeStrategy) {
    case 'STREAM': ...
    case 'BATCH':
    case 'DEFER':
    case 'DEFER + SHED':
    case 'SHED': {
      const targetBatchSize = this.adaptiveEngine ? this.adaptiveEngine.getCurrentBatchSize() : 250;
      const batchSize = Math.min(targetBatchSize, this.queueManager.lowQueue.size());
      if (batchSize > 0) {
        const batch = this.queueManager.lowQueue.dequeueBatch(batchSize);
        await this.batchProcessor.processBatch(batch, workerId);
      }
    }
  }
  ```
- **How It Works**: Each active worker runs an async loop. It checks `criticalQueue` first; if an item exists, it processes it and continues. If empty, it checks `highQueue`. Only when both are empty does it process `lowQueue` (as single items or micro-batches).
- **Known Bug / Starvation**: Lines 258 and 272 unconditionally `continue`. Even though `pipelineConfig.ts` defines `CRITICAL_WORKER_RATIO: 0.80` to prevent starvation, this variable is never used in `workerPool.ts`, causing 100% starvation of the LOW queue under high critical load!
- **Used By**: `server.ts`, `workerScaler.ts`, `socketServer.ts`.
- **Why It Matters**: Guarantees sub-millisecond execution priority for payment and order transactions.

---

### `backend/src/processing/batchProcessor.ts`
- **Purpose**: Amortizes execution overhead by grouping multiple low-priority events into a single micro-batch.
- **Main Classes/Functions**:
  - `BatchProcessor.processBatch(batch: PipelineEvent[], workerId)`
- **Core Code Snippet**:
  ```typescript
  // Lines 31-69
  public async processBatch(batch: PipelineEvent[], workerId = 'worker-batch'): Promise<BatchProcessingResult> {
    const startTime = Date.now();
    // Simulate batch processing delay (15ms total for whole batch)
    await new Promise((resolve) => setTimeout(resolve, this.config.BATCH_PROCESSING_DELAY_MS));

    const now = Date.now();
    const successfulEvents: PipelineEvent[] = [];
    const failedEvents: PipelineEvent[] = [];

    for (const event of batch) {
      // Individual event failure isolated!
      if (this.retryController && this.retryController.shouldSimulateFailure(event)) {
        failedEvents.push(event);
        this.retryController.handleFailedEvent(event, workerId, 'Simulated worker crash during batch processing');
        continue;
      }
      if (this.retryController) {
        this.retryController.applySideEffect(event, workerId);
      }
      event.processedAt = now;
      event.status = 'PROCESSED';
      event.strategy = 'BATCH';
      successfulEvents.push(event);
    }
    return { processedCount: successfulEvents.length, events: successfulEvents, durationMs: Date.now() - startTime, failedEvents };
  }
  ```
- **How It Works**: Awaits a fixed delay of `BATCH_PROCESSING_DELAY_MS` (15ms), then iterates through the events. If an event simulates worker failure, only that event is sent to `retryController`; all other 249 events in the batch succeed!
- **Why It Matters**: Increases pipeline throughput by over $116\times$ ($0.06\text{ms/event}$ vs $7\text{ms/event}$ in single stream).

---

### `backend/src/decision-engine/adaptiveEngine.ts`
- **Purpose**: The dynamic strategy state machine that governs low-priority queue adaptation (`STREAM` $\leftrightarrow$ `BATCH` $\leftrightarrow$ `DEFER` $\leftrightarrow$ `SHED`) with asymmetric hysteresis and dynamic batch tiering.
- **Main Classes/Functions**:
  - `AdaptiveDecisionEngine.evaluate(incomingRate, processingRate): DecisionEvaluation`
  - `AdaptiveDecisionEngine.calculateBatchSize(lowQueuePressure, backlogGrowth, workerLoad)`
- **Core Code Snippet**:
  ```typescript
  // Lines 133-167
  const isExtreme = lowQueuePressure >= 0.92;
  const exitExtreme = lowQueuePressure < 0.85;

  const isOverloaded = lowQueuePressure >= 0.70 || (lowQueuePressure >= 0.40 && rateImbalanceRatio > 1.8 && this.smoothedGrowthRate > 50);
  const exitOverloaded = lowQueuePressure < 0.60;

  const isPressured = lowQueuePressure >= 0.30 || (lowQueueSize > 50 && this.smoothedGrowthRate > 20) || rateImbalanceRatio > 1.3;
  const exitPressured = lowQueuePressure < 0.20 && rateImbalanceRatio <= 1.1;

  // Asymmetric transition: Upgrade immediately, downgrade requires dwell time (1000ms)
  if (this.currentStrategy === 'DEFER + SHED' || this.currentStrategy === 'SHED') {
    if (exitExtreme) targetStrategy = isOverloaded ? 'DEFER' : (isPressured ? 'BATCH' : 'STREAM');
  } else if (this.currentStrategy === 'DEFER') {
    if (isExtreme) targetStrategy = 'DEFER + SHED';
    else if (exitOverloaded) targetStrategy = isPressured ? 'BATCH' : 'STREAM';
  } else if (this.currentStrategy === 'BATCH') {
    if (isExtreme) targetStrategy = 'DEFER + SHED';
    else if (isOverloaded) targetStrategy = 'DEFER';
    else if (exitPressured) targetStrategy = 'STREAM';
  } else {
    if (isExtreme) targetStrategy = 'DEFER + SHED';
    else if (isOverloaded) targetStrategy = 'DEFER';
    else if (isPressured) targetStrategy = 'BATCH';
  }
  ```
- **How It Works**: Evaluates queue pressure, incoming/processing imbalance ratio, and queue growth rate. Upgrades immediately on load; requires a 10% deadband and 1,000ms dwell time before downgrading to prevent strategy flapping.
- **Used By**: `MetricsCollector`, `WorkerPool`, `routes.ts`.
- **Why It Matters**: Core intelligence preventing bufferbloat and system collapse under load spikes.

---

### `backend/src/decision-engine/formalizedDecisionEngine.ts`
- **Purpose**: Explainable, formalized scoring function that evaluates all 6 system dimensions to output a unified decision with score, weight contributions, and plain-English rationale.
- **Main Classes/Functions**:
  - `calculateDecision(rawInputs, customWeights): DecisionResult`
  - `normalizeInputs(raw): DecisionInputs`
  - `evaluateFromSystemState(priorityOverride): DecisionResult`
- **Core Code Snippet**:
  ```typescript
  // Lines 182-200
  const contributions: DecisionContributions = {
    queuePressure: Number((weights.queuePressure * inputs.queuePressure).toFixed(3)),
    workerUtilization: Number((weights.workerUtilization * inputs.workerUtilization).toFixed(3)),
    latency: Number((weights.latency * inputs.latency).toFixed(3)),
    dataSize: Number((weights.dataSize * inputs.dataSize).toFixed(3)),
    costPressure: Number((weights.costPressure * inputs.costPressure).toFixed(3)),
    priority: Number((weights.priority * inputs.priority).toFixed(3)),
  };

  const rawScore =
    contributions.queuePressure +
    contributions.workerUtilization +
    contributions.latency +
    contributions.dataSize +
    contributions.costPressure +
    contributions.priority;
  const score = Number(rawScore.toFixed(3));
  ```
- **How It Works**: Normalizes raw metrics to $[0.0, 1.0]$. Multiplies each by its weight ($W_Q=0.30, W_U=0.25, W_L=0.15, W_D=0.10, W_C=0.10, W_P=0.10$). Maps composite score: STREAM ($<0.35$), BATCH ($0.35-0.65$), DEFER ($0.65-0.85$), SHED ($\ge 0.85$).
- **Priority Override Invariants**:
  - CRITICAL priority has $W_P \times 0.0 = 0$ penalty and is **strictly locked to STREAM**.
  - HIGH priority may BATCH under load, but **never DEFER or SHED**.
- **Partially Implemented Detail**: Line 387 in `evaluateFromSystemState()` hardcodes `dataSizeBytes = 350` bytes rather than dynamically sampling real incoming payload sizes.
- **Used By**: `routes.ts`, `metricsCollector.ts`, frontend `DecisionEngineSection.tsx`.
- **Why It Matters**: Satisfies judges' demand for formal explainability: *"Why did the system choose this strategy right now?"*

---

### `backend/src/workers/workerScaler.ts`
- **Purpose**: Autonomous horizontal auto-scaler managing worker loop concurrency between 2 and 8 instances.
- **Main Classes/Functions**:
  - `WorkerScaler.evaluate()`
  - `WorkerScaler.executeScale(direction, previousWorkers, targetWorkers, reason)`
- **Core Code Snippet**:
  ```typescript
  // Lines 120-168
  // Scale-UP Condition: Sustained queue pressure >= 40% AND (backlog growing OR worker utilization >= 75%)
  const isScaleUpConditionMet =
    maxPressure >= (this.config.SCALE_UP_PRESSURE_THRESHOLD ?? 0.40) &&
    (this.smoothedBacklogGrowth > 0 || workerUtilization >= 75);

  // Scale-DOWN Condition: Sustained queue pressure < 15% AND backlog <= 10 AND worker utilization < 35%
  const isScaleDownConditionMet =
    maxPressure < (this.config.SCALE_DOWN_PRESSURE_THRESHOLD ?? 0.15) &&
    currentQueueSize <= 10 &&
    workerUtilization < 35;

  if (currentWorkers < maxWorkers && now - this.scaleUpConditionStart >= 1500 && now - this.lastScaleUpTime >= 3000) {
    const targetWorkers = Math.min(maxWorkers, currentWorkers + 2);
    await this.executeScale('UP', currentWorkers, targetWorkers, reason);
  }
  ```
- **How It Works**: Evaluates every 500ms. Scales up by +2 workers when pressure $\ge 40\%$ sustained for 1.5s (with a 3s cooldown). Scales down by -2 workers when pressure $< 15\%$ and backlog $\le 10$ sustained for 3.0s (with a 6s cooldown).
- **Used By**: `server.ts`, `metricsCollector.ts`, `routes.ts`.
- **Why It Matters**: Solves capacity saturation dynamically without over-provisioning baseline resources.

---

### `backend/src/backpressure/backpressureController.ts`
- **Purpose**: Admission flow-control valve that pauses event intake when the critical queue approaches physical saturation.
- **Main Classes/Functions**:
  - `BackpressureController.checkAndApply(): boolean`
- **Core Code Snippet**:
  ```typescript
  // Lines 20-43
  public checkAndApply(): boolean {
    const criticalPressure = this.queueManager.criticalQueue.getPressure();

    // Critical queue exceeds 85% capacity -> Pause ingestion admission
    if (criticalPressure >= this.config.CRITICAL_BACKPRESSURE_THRESHOLD) {
      if (!this.isBackpressureActive) {
        this.isBackpressureActive = true;
        if (this.simulator) this.simulator.setBackpressurePause(true);
      }
    } else if (criticalPressure < this.config.CRITICAL_BACKPRESSURE_THRESHOLD * 0.7) {
      // Hysteresis: resume admission once critical pressure drops below 60%
      if (this.isBackpressureActive) {
        this.isBackpressureActive = false;
        if (this.simulator) this.simulator.setBackpressurePause(false);
      }
    }
    return this.isBackpressureActive;
  }
  ```
- **How It Works**: Samples `criticalQueue.getPressure()`. When $\ge 85\%$ (1,700 items), triggers `isBackpressureActive = true` and halts the simulator loop. Resumes only when critical pressure drops below 60% (1,200 items).
- **Used By**: `metricsCollector.ts`, `server.ts`.
- **Why It Matters**: Prevents unrecoverable crashes under extreme sustained multi-fold traffic surges.

---

### `backend/src/backpressure/sheddingPolicy.ts`
- **Purpose**: Load shedding engine that discards non-critical events (`CLICK`, `LOG`) to prevent out-of-memory errors while preserving critical events.
- **Main Classes/Functions**:
  - `SheddingPolicy.shedSingleEvent(event, reason): ShedLogEntry | null`
  - `SheddingPolicy.executeShedding(countToShed, reason): SheddingResult`
- **Core Code Snippet**:
  ```typescript
  // Lines 31-45
  public shedSingleEvent(event: PipelineEvent, reason: string): ShedLogEntry | null {
    if (event.priority !== 'LOW') {
      this.totalSafetyViolations++;
      if (event.priority === 'CRITICAL') {
        this.queueManager.criticalQueue.enqueue(event);
      } else if (event.priority === 'HIGH') {
        this.queueManager.highQueue.enqueue(event);
      }
      return null;
    }

    event.status = 'SHED';
    event.dropReason = reason;
    this.totalShedCount++;
    return entry;
  }
  ```
- **How It Works**: If an event is `CRITICAL` or `HIGH`, it refuses to shed it, increments `totalSafetyViolations`, and re-queues it. Only `LOW` events are marked `SHED`.
- **Used By**: `priorityRouter.ts`, `workerPool.ts`, `metricsCollector.ts`.
- **Why It Matters**: Enforces the primary hackathon promise: **$0$ critical events shed or lost**.

---

### `backend/src/resilience/duplicateDetector.ts`
- **Purpose**: High-throughput in-memory LRU + TTL deduplication registry that intercepts and blocks duplicate external event submissions.
- **Main Classes/Functions**:
  - `DuplicateDetector.checkAndRegister(eventId, type, priority): CheckAndRegisterResult`
- **Core Code Snippet**:
  ```typescript
  // Lines 41-103
  public checkAndRegister(eventId: string, type: EventType, priority: EventPriority): CheckAndRegisterResult {
    const now = Date.now();
    const existing = this.registry.get(eventId);

    if (existing) {
      if (now - existing.registeredAt < this.ttlMs) {
        // Legitimate external duplicate detected within TTL (60s)
        this.duplicatesDetected++;
        this.duplicatesPrevented++;
        return { isDuplicate: true, reason: `Event ID '${eventId}' already admitted within 60s window` };
      } else {
        this.registry.delete(eventId); // Expired TTL
      }
    }

    // Bound LRU capacity to 10,000 entries
    if (this.registry.size >= this.maxCapacity) {
      const oldestKey = this.registry.keys().next().value;
      if (oldestKey) this.registry.delete(oldestKey);
    }

    this.registry.set(eventId, { registeredAt: now, type, priority });
    return { isDuplicate: false };
  }
  ```
- **How It Works**: Checks a JavaScript `Map`. If the ID exists and `now - registeredAt < 60s`, rejects with `isDuplicate = true`. Uses Map insertion-order iteration to evict the oldest key when capacity hits 10,000.
- **Used By**: `routes.ts`, `eventSimulator.ts`, `kafka/consumer.ts`.
- **Why It Matters**: Protects order processing systems from client-side double-submission or network packet replay.

---

### `backend/src/resilience/retryController.ts`
- **Purpose**: Fault-tolerance engine managing per-event exponential backoff retries, dead-letter queue (DLQ) transitions, and business side-effect idempotency.
- **Main Classes/Functions**:
  - `handleFailedEvent(event, workerId, error): boolean`
  - `applySideEffect(event, workerId): boolean`
  - `armFailure(targetType, mode)`
- **Core Code Snippet**:
  ```typescript
  // Lines 128-148 & 235-262
  public applySideEffect(event: PipelineEvent, workerId: string): boolean {
    if (this.completedEventIds.has(event.id)) {
      this.duplicatesPrevented++; // Idempotency protection engaged!
      return false;
    }
    this.completedEventIds.add(event.id);
    this.sideEffectLedger.set(event.id, { eventId: event.id, workerId, executedAt: Date.now(), executionCount: 1 });
    return true;
  }

  // Inside handleFailedEvent:
  if (event.retryCount > maxRetries) {
    event.status = 'PERMANENT_FAILURE'; // Exhausted -> DLQ
    this.permanentFailures++;
    return false;
  }

  const backoffMs = Math.min(1000, 100 * Math.pow(2, event.retryCount - 1));
  setTimeout(() => {
    this.requeueForRetry(event); // Re-enqueues ONLY the failed event with ORIGINAL Event ID
  }, backoffMs);
  ```
- **How It Works**: When a worker fails, only that single event is scheduled for retry after $100\text{ms} \times 2^{\text{attempt}-1}$. When retried, `applySideEffect()` verifies `completedEventIds` so retried transactions do not double-charge credit cards.
- **Used By**: `workerPool.ts`, `batchProcessor.ts`, `routes.ts`.
- **Why It Matters**: Eliminates blast radius: 1 failing event never crashes the entire batch or pipeline.

---

### `backend/src/metrics/metricsCollector.ts`
- **Purpose**: Centralized telemetry accumulator calculating real-time 1-second rolling rates, window distribution percentages, and the event accounting conservation invariant.
- **Main Classes/Functions**:
  - `recordIncomingEvent(event)`
  - `recordProcessedEvent(event, latencyMs)`
  - `recordBatchProcessed(events, durationMs)`
  - `getRollingWindowMetrics()`
  - `getSnapshot(): TelemetrySnapshot`
- **Core Code Snippet**:
  ```typescript
  // Lines 448-453
  // Event Conservation Accounting
  const criticalInQueue = this.queueManager.criticalQueue.size();
  const criticalAccountedFor = this.criticalProcessed + criticalInQueue + this.criticalInFlight;
  const calculatedCriticalLost = Math.max(0, this.criticalReceived - criticalAccountedFor);

  // Invariant verification across all priority tiers:
  // totalReceived == totalProcessed + queueManager.getTotalQueued() + shedCount + criticalInFlight
  ```
- **How It Works**: Maintains timestamp arrays for incoming and processed events over the last 1,000ms. Assembles a comprehensive snapshot every 500ms containing queue sizes, pressures, latency percentiles, worker statuses, and workload breakdown.
- **Used By**: `server.ts`, `socketServer.ts`, `routes.ts`.
- **Why It Matters**: Feeds live ground-truth telemetry directly into the frontend dashboard.

---

### `backend/src/simulator/eventSimulator.ts`
- **Purpose**: In-memory high-throughput traffic generation engine supporting Normal, Spike, and Custom rates with dynamic scenario distribution sampling.
- **Main Classes/Functions**:
  - `setRate(eventsPerMin: number)`
  - `setScenario(scenario: WorkloadScenario)`
  - `generateRandomEvent(): PipelineEvent`
- **Core Code Snippet**:
  ```typescript
  // Lines 121-163 & 166-170
  // 50ms accumulation tick for smooth micro-interval event emission
  const intervalMs = 50;
  const eventsPerIntervalFloat = (eventsPerMin / 60) / (1000 / intervalMs);
  let accumulator = 0;

  this.timer = setInterval(() => {
    if (this.isPausedByBackpressure) return; // Flow control active

    accumulator += eventsPerIntervalFloat;
    const countToSend = Math.floor(accumulator);
    accumulator -= countToSend;

    for (let i = 0; i < countToSend; i++) {
      const event = this.generateRandomEvent();
      this.onEventCallback(event);
    }
  }, intervalMs);

  private generateRandomEvent(): PipelineEvent {
    const type = sampleEventTypeForScenario(this.currentScenario);
    const priority = classifyEvent(type);
    ...
  }
  ```
- **How It Works**: Uses a 50ms timer with fractional floating-point accumulator to emit mathematically exact rates without jitter. Dynamically calls `sampleEventTypeForScenario()` on every event to adhere strictly to the selected workload profile.
- **Used By**: `server.ts`, `routes.ts`.
- **Why It Matters**: Allows instantaneous toggling of 20x flash-sale spikes (~20,000 events/min) during live hackathon demos.

---

### `backend/src/config/pipelineConfig.ts`
- **Purpose**: Static system configuration defining baseline thresholds, queue capacities, worker concurrency, and batch tiers.
- **Key Values**:
  - `NORMAL_RATE_PER_MIN`: 1,000 (~16.7 events/sec)
  - `SPIKE_RATE_PER_MIN`: 20,000 (~333.3 events/sec)
  - `CRITICAL_QUEUE_CAPACITY`: 2,000
  - `HIGH_QUEUE_CAPACITY`: 2,000
  - `LOW_QUEUE_CAPACITY`: 3,000
  - `BASE_PROCESSING_DELAY_MS`: 7ms (~140 events/sec per worker)
  - `BATCH_PROCESSING_DELAY_MS`: 15ms (flat amortized micro-batch delay)
  - `DYNAMIC_BATCH_TIERS`:
    - Pressure $\ge 0.95 \implies 250$
    - Pressure $\ge 0.85 \implies 200$
    - Pressure $\ge 0.70 \implies 100$
    - Pressure $\ge 0.50 \implies 50$
    - Pressure $\ge 0.30 \implies 25$
    - Nominal $\implies 10$
  - `CRITICAL_WORKER_RATIO`: 0.80 (*Configured but unreferenced in workerPool.ts*)

---

### `backend/src/config/workloadConfig.ts`
- **Purpose**: Single authoritative source of truth defining the event and priority percentage distributions for runtime workload scenarios.
- **Distributions**:
  ```typescript
  CRITICAL_HEAVY: {
    eventDistribution:    { PAYMENT: 30, ORDER: 30, INVENTORY: 20, CLICK: 10, LOG: 10 },
    priorityDistribution: { CRITICAL: 60, HIGH: 20, LOW: 20 }
  }
  HIGH_HEAVY: {
    eventDistribution:    { PAYMENT: 10, ORDER: 10, INVENTORY: 60, CLICK: 10, LOG: 10 },
    priorityDistribution: { CRITICAL: 20, HIGH: 60, LOW: 20 }
  }
  LOW_HEAVY: {
    eventDistribution:    { PAYMENT: 10, ORDER: 10, INVENTORY: 20, CLICK: 30, LOG: 30 },
    priorityDistribution: { CRITICAL: 20, HIGH: 20, LOW: 60 }
  }
  ```
- **How It Works**: `sampleEventTypeForScenario()` uses binary cumulative interval search across uniform random floats $[0, 1)$ to select event types matching the configured ratios.

---

### `backend/src/api/routes.ts`
- **Purpose**: Express REST router exposing simulation controls, workload configuration, fault injection, decision evaluations, and metric snapshots.
- **Key Endpoints**:
  - `GET /api/metrics` $\to$ Returns current `TelemetrySnapshot`.
  - `POST /api/ingest` $\to$ Direct external event entry point with duplicate check.
  - `GET /api/simulator/workload` $\to$ Returns active scenario and configured vs actual distribution.
  - `POST /api/simulator/workload` $\to$ Sets workload scenario (returns HTTP 409 if traffic is running).
  - `POST /api/simulator/spike` $\to$ Triggers 20,000 evt/min spike.
  - `POST /api/demo/failure` $\to$ Arms worker failure simulation for targeted retry demo.
  - `POST /api/demo/scale` $\to$ Triggers on-demand evaluation pass of `WorkerScaler`.
  - `POST /api/demo/duplicate` $\to$ Submits duplicate event ID to test immediate HTTP 409 rejection.
  - `POST /api/demo/decision` $\to$ Evaluates formalized decision function with real or custom inputs.
  - `GET /api/persistence/status` $\to$ Returns non-blocking buffer health, queued items, flushes, and error count.
  - `POST /api/runs/start` & `POST /api/runs/stop` $\to$ Authenticated run lifecycle controls linking events to user IDs.
  - `GET /api/history/runs`, `GET /api/history/events`, `GET /api/history/analytics` $\to$ Authenticated, paginated queries querying user history with RLS enforcement.

---

### `backend/src/supabase/supabaseClient.ts`
- **Purpose**: Centralized client factory and authentication middleware for Supabase integration, managing connection tokens, JWT verification, and Row Level Security scoping.
- **Main Classes/Functions**:
  - `getSupabaseClient()`: Returns the singleton anonymous Supabase client configured with environment URL and anon key.
  - `createScopedClient(token: string)`: Creates an authenticated client forwarding the user's JWT in the `Authorization: Bearer <token>` header so PostgreSQL Row Level Security (RLS) evaluates `auth.uid() = user_id`.
  - `authService.verifyUserToken(token: string)`: Validates JWT session with Supabase Auth API (`auth.getUser(token)`).
  - `requireAuthMiddleware(req, res, next)`: Express middleware enforcing valid Bearer tokens for private historical queries.
  - `optionalAuthMiddleware(req, res, next)`: Extracts user information if present, but permits anonymous pipeline simulation.
- **Core Code Snippet**:
  ```typescript
  export function createScopedClient(token: string): SupabaseClient {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
  }
  ```
- **How It Works**: Decouples client instantiation between global anonymous operations and per-request authenticated scopes. Passes the caller's JWT directly to PostgreSQL via PostgREST headers so Supabase evaluates RLS policies natively.
- **Used By**: `routes.ts`, `server.ts`, `historyPersister.ts`.
- **Why It Matters**: Prevents credential leakage while ensuring strict multi-tenant data isolation directly at the database engine level.

---

### `backend/src/persistence/historyPersister.ts`
- **Purpose**: High-throughput, non-blocking asynchronous persistence engine that buffers runtime events, retries, duplicates, and scaling transitions in an in-memory ring buffer and flushes them to Supabase PostgreSQL without stalling the hot event-processing path.
- **Main Classes/Functions**:
  - `recordEvent(event, executionDurationMs)`: Enqueues processed/shed event into the memory buffer.
  - `recordRetry(log)`: Enqueues retry audit record.
  - `recordDuplicate(log)`: Enqueues duplicate drop record.
  - `recordScaling(log)`: Enqueues worker scaling record.
  - `recordDecision(log)`: Enqueues decision engine evaluation record.
  - `startRun(userId, name, scenario, targetRate)`: Inserts a new row into `workload_runs` and activates run attribution.
  - `stopRun()`: Finalizes run metrics and marks run status as `COMPLETED`.
  - `flushBatch()`: Asynchronously sends up to 100 buffered records in single multi-row `insert()` queries.
- **Core Code Snippet**:
  ```typescript
  // Non-blocking write: WorkerPool calls recordEvent without awaiting I/O
  public recordEvent(event: PipelineEvent, executionDurationMs: number = 0): void {
    if (this.buffer.length >= this.maxBufferSize) {
      this.buffer.shift(); // Drop oldest to prevent memory leak if DB unavailable
      this.totalDroppedBufferItems++;
    }
    this.buffer.push({
      run_id: this.activeRun?.id || null,
      user_id: this.activeRun?.user_id || null,
      event_id: event.id,
      event_type: event.type,
      priority: event.priority,
      status: event.status,
      execution_duration_ms: executionDurationMs,
      timestamp: new Date(event.timestamp).toISOString()
    });
  }
  ```
- **How It Works**: Incoming events are immediately pushed to an in-memory queue. A background timer invokes `flushBatch()` every 1,000ms, slicing up to 100 items and executing bulk PostgreSQL inserts. If the database is slow or offline, buffer capacity caps at 5,000 items, shedding oldest items rather than crashing the Node.js event loop.
- **Used By**: `server.ts`, `workerPool.ts`, `retryController.ts`, `workerScaler.ts`, `duplicateDetector.ts`.
- **Why It Matters**: Guarantees zero latency penalty on real-time event routing. Ensures the live pipeline processes at full speed even under intermittent database network lag.

---

### `frontend/src/services/supabaseClient.ts & Auth / History Views`
- **Purpose**: Frontend authentication and persistent history visualization suite.
- **Key Modules**:
  - `frontend/src/services/supabaseClient.ts`: Singleton browser client maintaining local session storage and token refresh.
  - `frontend/src/components/AuthModal.tsx`: Sign Up / Sign In modal dialog with validation and error alerts.
  - `frontend/src/components/HistoricalViews.tsx`:
    - `EventHistoryView`: Paginated search table with filters for Priority, Strategy, Status, and Event Type.
    - `RunHistoryView`: List of completed workload runs with summary metrics and start/stop timestamps.
    - `HistoricalAnalyticsView`: Aggregate bar charts and metric cards across all user test runs.
    - `AccountView`: User profile card with active session metadata and token diagnostic details.
- **How It Works**: Uses Supabase JS SDK to subscribe to `onAuthStateChange`. When logged in, API requests automatically attach the session JWT Bearer token to read isolated user history.

---

### `traffic-generator/traffic_generator.py`
- **Purpose**: Standalone external multi-threaded Python traffic injection generator for load and stress testing.
- **Main Logic**:
  - Automatically queries `http://localhost:4000/api/simulator/workload` when `--workload AUTO` is passed, ensuring external traffic adheres to the dashboard's active scenario.
  - Generates events with randomized JSON payloads and submits via a 25-thread `ThreadPoolExecutor`.

---

### Frontend Telemetry & Dashboard Components
- **`frontend/src/services/socketClient.ts`**: Connects via Socket.IO client to `http://localhost:4000` (or `VITE_API_URL`), storing state in React hooks and dispatching REST control commands.
- **`frontend/src/components/WorkloadProfileSection.tsx`**: Renders dominant priority scenario toggle buttons (`CRITICAL_HEAVY`, `HIGH_HEAVY`, `LOW_HEAVY`), live 1-second window ingestion rates, and actual realized vs configured percentages.
- **`frontend/src/components/AdaptiveProcessing.tsx`**: Visualizes active adaptive strategy badges (`STREAM`, `BATCH`, `DEFER`, `SHED`) and batch size history.
- **`frontend/src/components/DecisionEngineSection.tsx`**: Renders the formal decision function spider/radar factor weights, score progress bar, and plain-English explanation.
- **`frontend/src/components/DynamicWorkerScalingSection.tsx`**: Displays real-time worker cards (Worker-1 through Worker-8), individual status (`ACTIVE`, `BUSY`, `RETIRING`), and scaling transition audit logs.
- **`frontend/src/components/FaultToleranceSection.tsx`**: Interactive failure injection trigger and visual retry lifecycle tracker (`FAILED` $\to$ `ISOLATED` $\to$ `RETRYING` $\to$ `RECOVERED`).

---

# 3. Core Algorithms: Input → Logic → Output

### 1. Priority Classification Algorithm
- **Input**: Event string `type` (`PAYMENT`, `ORDER`, `INVENTORY`, `CLICK`, `LOG`).
- **Logic**: Strict pattern match in `eventClassifier.ts`.
- **Output**: Priority tier (`CRITICAL`, `HIGH`, `LOW`).

### 2. Priority Routing Algorithm
- **Input**: Classified `PipelineEvent`.
- **Logic**: Enqueues to `criticalQueue`, `highQueue`, or `lowQueue`. If `lowQueue.size() >= 3000`, invokes `sheddingPolicy.shedSingleEvent()`.
- **Output**: `RouteResult` (`success: boolean`, `dropped: boolean`).

### 3. Bounded Queue Enqueue Algorithm
- **Input**: `event: PipelineEvent`, `capacity: number`.
- **Logic**: If `queue.length >= capacity`, return `false`. Else push to array and stamp `event.queuedAt = Date.now()`.
- **Output**: `boolean` (`true` if admitted, `false` if rejected).

### 4. Backpressure Ingestion Throttling
- **Input**: `criticalPressure = criticalQueue.size() / 2000`.
- **Logic**:
  $$\text{If } \text{criticalPressure} \ge 0.85 \implies \text{Pause Ingestion (Flow Control)}$$
  $$\text{If } \text{criticalPressure} < 0.60 \implies \text{Resume Ingestion (Hysteresis)}$$
- **Output**: `isBackpressureActive: boolean`.

### 5. Adaptive Strategy State Transition
- **Input**: `lowQueuePressure`, `rateImbalanceRatio` ($\text{in} / \text{proc}$), `smoothedGrowthRate` ($\Delta Q / \Delta t$).
- **Logic**:
  - `isExtreme` ($\ge 0.92$) $\implies$ `DEFER + SHED`
  - `isOverloaded` ($\ge 0.70$ or $\ge 0.40$ with growth $>50$) $\implies$ `DEFER`
  - `isPressured` ($\ge 0.30$ or imbalance $>1.3$) $\implies$ `BATCH`
  - Exit condition requires 10% deadband and 1,000ms dwell time.
- **Output**: `ProcessingStrategy` (`STREAM`, `BATCH`, `DEFER`, `SHED`).

### 6. Dynamic Batch Sizing Algorithm
- **Input**: `lowQueuePressure`, `backlogGrowthRate`, `workerLoadPercent`.
- **Logic**: Matches lowest applicable threshold in `DYNAMIC_BATCH_TIERS`. If backlog growth $>60/s$ and worker load $>70\%$, boosts batch size by $1.5\times$ up to 250.
- **Output**: `batchSize: number` (10, 25, 50, 100, 200, 250).

### 7. Strict Priority Worker Scheduling
- **Input**: Three isolated bounded queues.
- **Logic**: Check `criticalQueue.dequeue()`. If present $\to$ process and loop back. If empty $\to$ check `highQueue.dequeue()`. If empty $\to$ process `lowQueue` (as single event or batch).
- **Output**: Dequeued event(s) dispatched to simulated execution.

### 8. Dynamic Worker Auto-Scaling Ladder
- **Input**: `maxPressure`, `workerUtilization`, `backlogGrowth`, `currentQueueSize`.
- **Logic**:
  - **Scale Up**: If $\text{pressure} \ge 40\%$ and ($\text{growth} > 0$ or $\text{utilization} \ge 75\%$) sustained for 1.5s (3s cooldown) $\implies \text{workers} = \min(8, \text{current} + 2)$.
  - **Scale Down**: If $\text{pressure} < 15\%$, $\text{backlog} \le 10$, and $\text{utilization} < 35\%$ sustained for 3.0s (6s cooldown) $\implies \text{workers} = \max(2, \text{current} - 2)$.
- **Output**: New worker concurrency count (2, 4, 6, or 8).

### 9. Exponential Backoff Retry Scheduling
- **Input**: `event.retryCount` (1, 2, 3).
- **Logic**:
  $$\text{Delay} = \min(1000\text{ms}, 100\text{ms} \times 2^{\text{retryCount}-1})$$
  - Attempt 1: 100ms
  - Attempt 2: 200ms
  - Attempt 3: 400ms
  - If $\text{retryCount} > 3 \implies \text{PERMANENT\_FAILURE (DLQ)}$.
- **Output**: Timer scheduled to re-enqueue event into its priority queue with original Event ID.

### 10. Business Side-Effect Idempotency
- **Input**: `eventId: string`, `workerId: string`.
- **Logic**: Checks `completedEventIds.has(eventId)`. If exists $\to$ return `false` (duplicate prevented). Else add to Set and Map ledger $\to$ return `true`.
- **Output**: `boolean` (`true` if side effect executed, `false` if blocked).

### 11. External Duplicate Admission Detection
- **Input**: External `eventId: string`.
- **Logic**: Checks `registry.get(eventId)`. If present and $\text{now} - \text{registeredAt} < 60,000\text{ms} \implies \text{isDuplicate} = \text{true}$. Else registers in Map and evicts oldest key if size $> 10,000$.
- **Output**: `isDuplicate: boolean` (HTTP 409 if true).

### 12. Formal Decision Function Composite Score
- **Input**: 6 normalized metrics $x_i \in [0, 1]$.
- **Logic**:
  $$\text{Score} = 0.30 x_Q + 0.25 x_U + 0.15 x_L + 0.10 x_D + 0.10 x_C + 0.10 x_P$$
- **Output**: `score: number` $[0.0, 1.0]$, `decision: ProcessingStrategy`, `explanation: string`.

### 13. Dynamic Workload Event Sampling
- **Input**: `activeScenario: WorkloadScenario`.
- **Logic**: Generates uniform random float $r \in [0, 1)$. Performs cumulative interval lookup on `WORKLOAD_CONFIGS[scenario].eventDistribution`.
- **Output**: Sampled `EventType` (`PAYMENT`, `ORDER`, `INVENTORY`, `CLICK`, `LOG`).

### 14. Event Conservation Accounting Invariant
- **Input**: Metric counters and queue depths.
- **Logic**:
  $$\text{totalReceived} \equiv \text{totalProcessed} + \text{currentQueued} + \text{shedCount} + \text{criticalInFlight}$$
- **Output**: Identity assertion (discrepancy $>0 \implies$ silent drop bug).

---

# 4. Important Formulas & Mathematical Thresholds

### 1. Queue Pressure ($P_Q$)
$$P_Q = \frac{\text{Current Queue Length}}{\text{Total Queue Capacity}} \in [0.0, 1.0]$$
- Capacities: Critical = 2,000 | High = 2,000 | Low = 3,000.

### 2. Worker Utilization ($U_W$)
$$U_W = \frac{1}{N_{\text{samples}}} \sum_{i=1}^{N_{\text{samples}}} \left( \frac{\text{Busy Workers}_i}{\text{Total Workers}_i} \right) \times 100\%$$
- Measured over a rolling 2-second sampling window.

### 3. Decision Function Normalization Formulas
- **Latency**: $x_L = \min\left(1.0, \max\left(0.0, \frac{\text{latencyMs} - 10}{490}\right)\right)$
- **Data Size**: $x_D = \min\left(1.0, \max\left(0.0, \frac{\text{bytes} - 100}{2400}\right)\right)$
- **Cost Pressure**: $x_C = \min\left(1.0, 0.6 \times \frac{\text{workers} - 2}{6} + 0.4 \times P_{\text{LowQueue}}\right)$

### 4. Backlog Growth Rate ($G_Q$)
$$G_Q = 0.7 \times G_{\text{previous}} + 0.3 \times \left( \frac{Q_{\text{now}} - Q_{\text{previous}}}{\Delta t} \right)$$
- Exponential Moving Average (EMA) with $\alpha = 0.30$.

---

# 5. Complete Event Lifecycle Walkthrough

### Baseline Path: Standard `ORDER` Event
1. **Creation**: Simulator or HTTP client creates payload `{ id: "ord_987", type: "ORDER", amount: 150.00, timestamp: 1718000000000 }`.
2. **Ingestion**: Arrives at `POST /api/ingest`. `DuplicateDetector.checkAndRegister("ord_987")` confirms new ID and adds to registry.
3. **Classification**: `eventClassifier.classifyEvent("ORDER")` deterministically returns `'CRITICAL'`.
4. **Accounting**: `metricsCollector.recordIncomingEvent()` increments `totalReceived` and `criticalReceived`.
5. **Routing**: `priorityRouter.route()` pushes event to `queueManager.criticalQueue`.
6. **Scheduling**: A worker loop in `workerPool.ts` evaluates Step 1 (`criticalQueue.dequeue()`), marks worker `BUSY`, and sets `criticalInFlight = 1`.
7. **Execution**: `processSingleEvent()` pauses for 7ms (`BASE_PROCESSING_DELAY_MS`), invokes `retryController.applySideEffect("ord_987")` (records in ledger), and sets `event.status = 'PROCESSED'`.
8. **Telemetry**: Listener calls `metricsCollector.recordProcessedEvent()`, updates P50/P95 latencies, sets `criticalInFlight = 0`, and emits snapshot via Socket.IO.

### What Changes When:

- **The Queue is Full**:
  If `criticalQueue` reaches 2,000 items, `priorityRouter` returns `success: false, reason: 'CRITICAL_QUEUE_SATURATED'`. `backpressureController` activates, pausing simulator/Kafka ingestion until workers drain critical pressure below 60%. Event is never shed.
- **The Worker Fails**:
  If worker failure is armed, `retryController.shouldSimulateFailure()` returns `true`. The worker catches the failure, calls `handleFailedEvent()`, logs `FAILED` and `ISOLATED`, and schedules re-enqueue after exponential backoff (100ms). Surviving events in the batch continue unaffected. On retry, the event is re-dequeued and recovers.
- **The Event is Duplicated**:
  When a second request arrives with ID `"ord_987"` within 60s, `DuplicateDetector` returns `isDuplicate = true`. The API immediately halts execution and returns `HTTP 409 Conflict`. Zero pipeline admission occurs.
- **The System is Overloaded**:
  If low-priority traffic spikes, `AdaptiveDecisionEngine` escalates from `STREAM` to `BATCH` (size 250) or `DEFER + SHED`. Low-priority intake is paced. Order events remain completely unaffected because critical traffic is permanently locked to `STREAM`.
- **The System Scales Workers**:
  When sustained queue pressure exceeds 40% for 1.5s, `WorkerScaler` spawns +2 worker loops, expanding concurrency from 2 to 4, 6, up to 8. Capacity scales from $280\text{ ev/s} \to 1,142\text{ ev/s}$, draining backlogs in seconds.

---

# 6. Code Ownership & Provenance Categorization

| Category | Components / Files | Description & Engineering Evidence |
| :--- | :--- | :--- |
| **Core Proprietary Logic** | `adaptiveEngine.ts`<br>`formalizedDecisionEngine.ts`<br>`workerScaler.ts`<br>`workerPool.ts`<br>`retryController.ts`<br>`duplicateDetector.ts` | 100% project-specific algorithms: asymmetric hysteresis state machine, 6-input formal decision scoring, dynamic worker concurrency scaling, targeted single-event batch isolation, and in-memory LRU/TTL deduplication. |
| **Infrastructure / Plumbing** | `priorityRouter.ts`<br>`boundedQueue.ts`<br>`metricsCollector.ts`<br>`eventClassifier.ts` | Custom implementation of bounded ring-buffers, event routing, and rolling 1-second window percentile calculations. |
| **Framework & Libraries** | Express, Socket.IO, Vitest, KafkaJS | Standard open-source industry tooling used for HTTP routing, real-time WebSocket communication, and testing. |
| **Configuration** | `pipelineConfig.ts`<br>`workloadConfig.ts` | Static configuration constants, threshold numbers, batch tier arrays, and workload probability tables. |
| **Simulation / Demo Tools** | `eventSimulator.ts`<br>`traffic_generator.py`<br>`naiveBaseline.ts` | Demo instrumentation to simulate realistic user traffic, flash-sale spikes, and comparison against un-throttled naive pipelines. |

---

# 7. 18 Core Code Snippets to Memorize

### Snippet 1: Deterministic Priority Classification
**File**: [`backend/src/classifier/eventClassifier.ts`](file:///d:/VCET/VH26-NullPointer/backend/src/classifier/eventClassifier.ts#L7-L18)
```typescript
export function classifyEvent(type: EventType): EventPriority {
  switch (type) {
    case 'PAYMENT':
    case 'ORDER':
      return 'CRITICAL';
    case 'INVENTORY':
      return 'HIGH';
    case 'CLICK':
    case 'LOG':
    default:
      return 'LOW';
  }
}
```
*Meaning: Hard business rules map revenue-generating transactions to CRITICAL, inventory mutations to HIGH, and telemetry to LOW.*

---

### Snippet 2: Strict Priority Worker Dequeue
**File**: [`backend/src/processing/workerPool.ts`](file:///d:/VCET/VH26-NullPointer/backend/src/processing/workerPool.ts#L240-L260)
```typescript
const criticalEvent = this.queueManager.criticalQueue.dequeue();
if (criticalEvent) {
  await this.processSingleEvent(criticalEvent, 'STREAM', workerId);
  didWork = true;
  continue; // Immediately loop back to check critical queue again
}
```
*Meaning: Workers strictly prioritize the critical queue. If a critical event exists, it is processed immediately and the worker resets back to Step 1.*

---

### Snippet 3: Micro-Batch Overhead Amortization
**File**: [`backend/src/processing/batchProcessor.ts`](file:///d:/VCET/VH26-NullPointer/backend/src/processing/batchProcessor.ts#L34-L36)
```typescript
// Simulate batch processing delay (e.g. 15ms total for whole batch)
await new Promise((resolve) => setTimeout(resolve, this.config.BATCH_PROCESSING_DELAY_MS));
```
*Meaning: A batch of 250 items takes 15ms total ($0.06\text{ms/item}$) instead of 7ms per item ($1,750\text{ms}$), multiplying throughput by over 100x.*

---

### Snippet 4: Adaptive Hysteresis Thresholds
**File**: [`backend/src/decision-engine/adaptiveEngine.ts`](file:///d:/VCET/VH26-NullPointer/backend/src/decision-engine/adaptiveEngine.ts#L133-L140)
```typescript
const isExtreme = lowQueuePressure >= 0.92;
const exitExtreme = lowQueuePressure < 0.85;

const isOverloaded = lowQueuePressure >= 0.70 || (lowQueuePressure >= 0.40 && rateImbalanceRatio > 1.8 && this.smoothedGrowthRate > 50);
const exitOverloaded = lowQueuePressure < 0.60;

const isPressured = lowQueuePressure >= 0.30 || (lowQueueSize > 50 && this.smoothedGrowthRate > 20) || rateImbalanceRatio > 1.3;
const exitPressured = lowQueuePressure < 0.20 && rateImbalanceRatio <= 1.1;
```
*Meaning: Asymmetric entry and exit thresholds (10% deadband) prevent strategy flapping around boundary edges.*

---

### Snippet 5: Dynamic Batch Size Tiering
**File**: [`backend/src/decision-engine/adaptiveEngine.ts`](file:///d:/VCET/VH26-NullPointer/backend/src/decision-engine/adaptiveEngine.ts#L75-L81)
```typescript
let baseBatchSize = 10;
for (const tier of this.config.DYNAMIC_BATCH_TIERS) {
  if (lowQueuePressure >= tier.minPressure) {
    baseBatchSize = tier.batchSize;
    break;
  }
}
```
*Meaning: Automatically steps batch sizes from 10 up to 250 as queue pressure rises.*

---

### Snippet 6: Ingestion Backpressure Valve
**File**: [`backend/src/backpressure/backpressureController.ts`](file:///d:/VCET/VH26-NullPointer/backend/src/backpressure/backpressureController.ts#L25-L39)
```typescript
if (criticalPressure >= this.config.CRITICAL_BACKPRESSURE_THRESHOLD) { // 0.85
  if (!this.isBackpressureActive) {
    this.isBackpressureActive = true;
    if (this.simulator) this.simulator.setBackpressurePause(true);
  }
} else if (criticalPressure < this.config.CRITICAL_BACKPRESSURE_THRESHOLD * 0.7) { // 0.60
  if (this.isBackpressureActive) {
    this.isBackpressureActive = false;
    if (this.simulator) this.simulator.setBackpressurePause(false);
  }
}
```
*Meaning: Freezes incoming ingestion when the critical queue hits 85% capacity, unfreezing only when pressure drops below 60%.*

---

### Snippet 7: Critical Safety Invariant in Shedding
**File**: [`backend/src/backpressure/sheddingPolicy.ts`](file:///d:/VCET/VH26-NullPointer/backend/src/backpressure/sheddingPolicy.ts#L32-L40)
```typescript
if (event.priority !== 'LOW') {
  this.totalSafetyViolations++;
  if (event.priority === 'CRITICAL') {
    this.queueManager.criticalQueue.enqueue(event);
  } else if (event.priority === 'HIGH') {
    this.queueManager.highQueue.enqueue(event);
  }
  return null;
}
```
*Meaning: Hard defensive assertion: If a critical or high event ever arrives at the shedding policy, it is rejected from shedding and re-enqueued.*

---

### Snippet 8: In-Memory Deduplication Check
**File**: [`backend/src/resilience/duplicateDetector.ts`](file:///d:/VCET/VH26-NullPointer/backend/src/resilience/duplicateDetector.ts#L49-L57)
```typescript
const existing = this.registry.get(eventId);
if (existing) {
  if (now - existing.registeredAt < this.ttlMs) {
    this.duplicatesDetected++;
    this.duplicatesPrevented++;
    return { isDuplicate: true, reason: `Event ID '${eventId}' already admitted within 60s window` };
  }
}
```
*Meaning: Synchronous Map lookup that blocks duplicate submissions within a 60-second TTL window.*

---

### Snippet 9: LRU Eviction Under Max Registry Capacity
**File**: [`backend/src/resilience/duplicateDetector.ts`](file:///d:/VCET/VH26-NullPointer/backend/src/resilience/duplicateDetector.ts#L88-L93)
```typescript
if (this.registry.size >= this.maxCapacity) {
  const oldestKey = this.registry.keys().next().value;
  if (oldestKey) {
    this.registry.delete(oldestKey);
  }
}
```
*Meaning: Preserves memory by evicting the oldest key once the registry reaches 10,000 entries.*

---

### Snippet 10: Business Side-Effect Idempotency
**File**: [`backend/src/resilience/retryController.ts`](file:///d:/VCET/VH26-NullPointer/backend/src/resilience/retryController.ts#L129-L139)
```typescript
if (this.completedEventIds.has(event.id)) {
  this.duplicatesPrevented++;
  return false;
}
this.completedEventIds.add(event.id);
this.sideEffectLedger.set(event.id, { eventId: event.id, workerId, executedAt: Date.now(), executionCount: 1 });
return true;
```
*Meaning: Ensures that even if an event is processed multiple times during retries, its real-world business side effect executes exactly once.*

---

### Snippet 11: Targeted Failure Isolation in Batches
**File**: [`backend/src/processing/batchProcessor.ts`](file:///d:/VCET/VH26-NullPointer/backend/src/processing/batchProcessor.ts#L43-L48)
```typescript
if (this.retryController && this.retryController.shouldSimulateFailure(event)) {
  failedEvents.push(event);
  this.retryController.handleFailedEvent(event, workerId, 'Simulated worker crash during batch processing');
  continue;
}
successfulEvents.push(event);
```
*Meaning: If 1 event fails inside a batch of 250, only that 1 event is routed to retry; the other 249 succeed.*

---

### Snippet 12: Exponential Backoff Scheduling
**File**: [`backend/src/resilience/retryController.ts`](file:///d:/VCET/VH26-NullPointer/backend/src/resilience/retryController.ts#L238-L260)
```typescript
const backoffMs = Math.min(1000, 100 * Math.pow(2, event.retryCount - 1));
setTimeout(() => {
  this.requeueForRetry(event);
}, backoffMs);
```
*Meaning: Exponentially increases delays between retries ($100\text{ms} \to 200\text{ms} \to 400\text{ms}$) before re-enqueuing with original Event ID.*

---

### Snippet 13: Dead Letter Queue (DLQ) Exhaustion
**File**: [`backend/src/resilience/retryController.ts`](file:///d:/VCET/VH26-NullPointer/backend/src/resilience/retryController.ts#L196-L202)
```typescript
if (event.retryCount > maxRetries) {
  event.status = 'PERMANENT_FAILURE';
  event.dropReason = `Exceeded max retry limit (${maxRetries}): ${errorMsg}`;
  this.permanentFailures++;
  return false;
}
```
*Meaning: Marks unrecoverable events as PERMANENT_FAILURE after 3 failed attempts, isolating them in the DLQ.*

---

### Snippet 14: Worker Scale-Up Evaluation
**File**: [`backend/src/workers/workerScaler.ts`](file:///d:/VCET/VH26-NullPointer/backend/src/workers/workerScaler.ts#L123-L125)
```typescript
const isScaleUpConditionMet =
  maxPressure >= (this.config.SCALE_UP_PRESSURE_THRESHOLD ?? 0.40) &&
  (this.smoothedBacklogGrowth > 0 || workerUtilization >= 75);
```
*Meaning: Triggers scale-up when any queue exceeds 40% pressure and worker utilization is $\ge 75\%$ or backlog is actively growing.*

---

### Snippet 15: Formal Decision Composite Score
**File**: [`backend/src/decision-engine/formalizedDecisionEngine.ts`](file:///d:/VCET/VH26-NullPointer/backend/src/decision-engine/formalizedDecisionEngine.ts#L192-L199)
```typescript
const rawScore =
  contributions.queuePressure +
  contributions.workerUtilization +
  contributions.latency +
  contributions.dataSize +
  contributions.costPressure +
  contributions.priority;
const score = Number(rawScore.toFixed(3));
```
*Meaning: Mathematical summation of weighted normalized metrics producing the formal explainability score.*

---

### Snippet 16: Critical Decision Invariant
**File**: [`backend/src/decision-engine/formalizedDecisionEngine.ts`](file:///d:/VCET/VH26-NullPointer/backend/src/decision-engine/formalizedDecisionEngine.ts#L204-L206)
```typescript
if (inputs.priorityName === 'CRITICAL') {
  // Invariant: CRITICAL events are ALWAYS STREAM (zero-drop, protected)
  decision = 'STREAM';
}
```
*Meaning: Hardcode guarantee that the decision engine will never choose BATCH, DEFER, or SHED for a critical transaction.*

---

### Snippet 17: Dynamic Workload Cumulative Sampling
**File**: [`backend/src/config/workloadConfig.ts`](file:///d:/VCET/VH26-NullPointer/backend/src/config/workloadConfig.ts#L79-L93)
```typescript
const rand = Math.random() * 100;
let cumulative = 0;
for (const [type, pct] of Object.entries(dist)) {
  cumulative += pct;
  if (rand < cumulative) {
    return type as EventType;
  }
}
```
*Meaning: Probabilistic selection of event types guaranteeing that generated traffic matches the selected workload scenario.*

---

### Snippet 18: Fractional Accumulator for Exact Ingestion Rates
**File**: [`backend/src/simulator/eventSimulator.ts`](file:///d:/VCET/VH26-NullPointer/backend/src/simulator/eventSimulator.ts#L132-L135)
```typescript
accumulator += eventsPerIntervalFloat;
const countToSend = Math.floor(accumulator);
accumulator -= countToSend;
```
*Meaning: Eliminates integer rounding drift, allowing smooth, exact rate generation (e.g. 16.7 evt/s or 333.3 evt/s).*

---

# 8. 20 Technical Judge Questions & Answers

#### Q1: "How do you guarantee that critical transactions like payments are never dropped or delayed?"
**Answer**: Through physical queue isolation and strict priority scheduling. `eventClassifier.ts` routes payments to `criticalQueue`. In `workerPool.ts` (lines 240–258), workers check `criticalQueue` first on every iteration. In `sheddingPolicy.ts` (line 32), shedding explicitly rejects non-LOW events with a safety violation counter.

#### Q2: "What is your event accounting invariant and how do you prove zero data loss?"
**Answer**: We enforce $\text{RECEIVED} = \text{PROCESSED} + \text{QUEUED} + \text{SHED} + \text{IN\_FLIGHT}$. `metricsCollector.ts` (lines 448–452) verifies this identity on every 500ms telemetry snapshot. Any discrepancy is flagged as data loss.

#### Q3: "Why did your LOW queue build up during the 20x spike and then suddenly drop to 0?"
**Answer**: In `workerPool.ts`, workers strictly prioritize CRITICAL and HIGH queues. Under a 333 evt/s spike, 2 workers spend 100% of their compute on critical events, temporarily starving the LOW queue. Once `workerScaler.ts` auto-scales the pool to 8 workers and critical queues clear, all 8 workers dequeue the LOW queue in micro-batches of 250 (`batchProcessor.ts`). Processing a batch takes 15ms, draining 3,000 events in ~30ms.

#### Q4: "How do you prevent strategy flapping between STREAM and BATCH?"
**Answer**: In `adaptiveEngine.ts` (lines 133–184), we implement asymmetric hysteresis. Upgrading under load occurs immediately, but downgrading requires dropping below a 10% deadband (e.g. exit pressured at $<20\%$ when entry is $\ge 30\%$) and sustaining that condition for a 1,000ms dwell window.

#### Q5: "How does micro-batching improve system throughput?"
**Answer**: By amortizing processing overhead. In `batchProcessor.ts` (line 35), processing 250 events in a batch incurs a flat 15ms delay ($0.06\text{ms/event}$), compared to 7ms per event in stream mode. This increases throughput by over $116\times$.

#### Q6: "If 1 event fails inside a micro-batch of 250, does the entire batch fail?"
**Answer**: No. In `batchProcessor.ts` (lines 43–48), failures are isolated to the specific event. Only the failing event is dispatched to `retryController.ts`, while the other 249 events in the batch commit successfully.

#### Q7: "How do you prevent a retried event from charging a user's credit card twice?"
**Answer**: In `retryController.ts` (lines 128–147), we maintain an idempotency ledger `completedEventIds`. When an event is retried, `applySideEffect()` verifies whether the ID has already executed. If so, it increments `duplicatesPrevented` and skips execution.

#### Q8: "What happens when an external client sends duplicate HTTP requests?"
**Answer**: In `duplicateDetector.ts` (lines 41–85), an in-memory TTL registry intercepts the request at admission. If the Event ID was admitted within the last 60 seconds, it returns `HTTP 409 Conflict`, blocking pipeline ingestion entirely.

#### Q9: "How does your duplicate detector avoid consuming unbounded memory?"
**Answer**: In `duplicateDetector.ts` (lines 88–93), the registry is capped at 10,000 entries. When capacity is reached, it uses LRU eviction (Map key iterator) to discard the oldest entry.

#### Q10: "What triggers dynamic worker auto-scaling and how do you prevent scaling thrash?"
**Answer**: In `workerScaler.ts` (lines 120–168), scale-up requires queue pressure $\ge 40\%$ sustained for 1.5s (with a 3s cooldown). Scale-down requires pressure $< 15\%$ and backlog $\le 10$ sustained for 3.0s (with a 6s cooldown).

#### Q11: "What are the 6 inputs to your formal decision function and their weights?"
**Answer**: In `formalizedDecisionEngine.ts` (lines 17–24): Queue Pressure (0.30), Worker Utilization (0.25), Latency (0.15), Data Size (0.10), Cost Pressure (0.10), and Priority (0.10). The weights sum to exactly 1.0.

#### Q12: "Can the decision function ever decide to shed a HIGH-priority event?"
**Answer**: No. In `formalizedDecisionEngine.ts` (lines 207–213), an invariant enforces that HIGH priority may only select STREAM or BATCH, and is programmatically barred from DEFER or SHED.

#### Q13: "What happens when an event fails 3 consecutive retries?"
**Answer**: In `retryController.ts` (lines 196–216), once `retryCount > MAX_RETRIES` (3), the event transitions to `PERMANENT_FAILURE`, increments `permanentFailures`, logs an audit entry, and moves to the Dead Letter Queue (DLQ).

#### Q14: "What backpressure mechanism prevents memory exhaustion during flash sales?"
**Answer**: In `backpressureController.ts` (lines 20–43), if the critical queue exceeds 85% capacity, ingestion admission is paused via `simulator.setBackpressurePause(true)` until pressure drops below 60%.

#### Q15: "How do your runtime workload scenarios affect the event generator?"
**Answer**: In `eventSimulator.ts` (lines 166–170) and `workloadConfig.ts`, every event is sampled via `sampleEventTypeForScenario(currentScenario)` using cumulative probability distributions (`CRITICAL_HEAVY` = 60% crit, `HIGH_HEAVY` = 60% high, `LOW_HEAVY` = 60% low).

#### Q16: "Can a user switch workload scenarios while traffic is actively running?"
**Answer**: No. In `routes.ts` (lines 229–235), `POST /api/simulator/workload` returns `HTTP 409 Conflict` if `simulator.isRunning()`, ensuring statistical validity of active test runs.

#### Q17: "Does the frontend dashboard generate or fake any telemetry metrics?"
**Answer**: No. `frontend/src/services/socketClient.ts` listens directly to WebSocket `telemetry` events emitted every 500ms by `socketServer.ts`, which reads live values from `metricsCollector.getSnapshot()`.

#### Q18: "What known bugs or limitations exist in the current implementation?"
**Answer**: Two specific edge cases were discovered by our automated tests:
1. `CRITICAL_WORKER_RATIO: 0.80` is configured in `pipelineConfig.ts` but omitted in `workerPool.ts`, causing 100% starvation of low-priority events during critical backlogs.
2. If the `highQueue` exceeds 2,000 items, `priorityRouter.ts` drops the event without recording it in `sheddingPolicy`, creating a 1-event discrepancy in the accounting invariant.

#### Q19: "How is exponential backoff calculated for retries?"
**Answer**: In `retryController.ts` (line 238): $\text{Delay} = \min(1000\text{ms}, 100\text{ms} \times 2^{\text{retryCount}-1})$. Retry 1 waits 100ms, Retry 2 waits 200ms, and Retry 3 waits 400ms.

#### Q20: "Why is AdaptiFlow superior to a static thread pool with standard priority queues?"
**Answer**: A static priority queue either starves low-priority events or crashes under multi-fold spikes. AdaptiFlow combines micro-batch amortization ($116\times$ speedup), autonomous horizontal worker scaling (2 to 8), admission deduplication (60s TTL), and explainable dynamic strategy shifting (`STREAM` $\leftrightarrow$ `BATCH` $\leftrightarrow$ `DEFER` $\leftrightarrow$ `SHED`).
