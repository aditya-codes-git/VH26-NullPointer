# PRD: Adaptive Event-Processing Pipeline for E-Commerce Flash Sales

**Hackathon:** 30-hour build
**Doc type:** Practical engineering PRD (not a startup/product doc)

---

## 1. Product Overview

A backend pipeline that ingests a mixed stream of e-commerce events (orders, payments, clicks, logs, inventory activity) and processes them intelligently: critical events (orders, payments) always get priority and are never silently dropped, while non-critical events (clicks, logs) adapt their processing strategy — streaming, batching, deferring, or shedding — based on real-time system load. A live dashboard shows judges the system adapting in real time when traffic spikes 20×.

## 2. Problem

A naive pipeline treats every event as equally urgent. During a flash sale, traffic can jump from ~1,000 events/min to ~20,000 events/min (20×). Processing everything immediately at that scale causes queue buildup, latency spikes, and system overload — including for business-critical events like payments and orders.

## 3. Goal

Build a pipeline that **prioritizes what matters** (orders, payments) and **adapts how it handles what doesn't** (clicks, logs) when the system is under pressure — without just adding more compute.

## 4. Target Use Case

An e-commerce backend during a flash-sale traffic spike, where limited processing capacity must be allocated so that critical business transactions stay fast and reliable while non-critical telemetry degrades gracefully.

## 5. Core User/System Requirements

*(PS-required)*
- The system must ingest a mixed event stream at variable rates (1,000–20,000 events/min).
- The system must classify events by priority.
- The system must adapt processing strategy based on load.
- The system must protect critical events from loss.
- The system must expose its behavior via a live dashboard.

## 6. Functional Requirements

*(PS-required unless marked [Our choice])*

1. Event simulator generating ≥3 event types, supporting normal (~1,000/min) and spike (~20,000/min) rates, with an on-demand trigger for the spike.
2. Event classifier tagging each event as critical or non-critical.
3. Priority router directing events to the correct queue/path.
4. Adaptive processing engine: stream for critical always; stream/batch/defer/shed for non-critical based on load.
5. Backpressure controller that monitors queue pressure and changes processing mode accordingly.
6. Shedding policy that drops/samples only non-critical events, always logged with a reason.
7. Metrics collection for all the dashboard fields listed in §15.
8. Dashboard rendering live metrics and current system mode. [Our choice: web-based, auto-refreshing]

## 7. Non-Functional Requirements

*(Mostly [Our choice], scoped to what's demonstrable in 30 hours)*
- Must run entirely in-memory/locally — no external infra dependencies.
- Must handle the 20× spike without crashing the process.
- Dashboard must update at a visible cadence (e.g., every 1 second) during the demo.
- Codebase should be simple enough that a judge's follow-up question can be answered by pointing at a specific function.

## 8. Event Types and Priority Model

| Event type | Priority | Source |
|---|---|---|
| Orders | Critical | PS-required |
| Payments | Critical | PS-required |
| Inventory/activity events | Non-critical (default) | [Our choice — PS lists as a type but doesn't fix its tier; we treat as non-critical unless time permits a "medium" tier] |
| User clicks | Non-critical | PS-required |
| Logs | Non-critical | PS-required |

Classification is deterministic (event `type` field → priority), not ML-based — explicitly required by the PS.

## 9. Processing Strategies

- **Critical events:** always processed individually/immediately, regardless of load. Never batched, deferred, or shed.
- **Non-critical events**, by load tier:
  - Normal load → stream (process individually)
  - Increasing pressure → micro-batch (e.g., group every N events or every X ms)
  - High pressure → defer (queue held back, processed when pressure drops)
  - Extreme pressure → shed/sample (drop or sample a fraction, always logged)

## 10. Adaptive Decision Logic

**MVP (PS-required, must be simple):** threshold/rule-based. Example thresholds [Our choice — tune during build]:

```
queue_length < T1        → stream
T1 ≤ queue_length < T2    → batch
T2 ≤ queue_length < T3    → defer
queue_length ≥ T3         → shed
```

Where `queue_length` refers to the non-critical queue only. Critical queue is never subject to this logic.

**Stretch goal (explicitly NOT MVP per PS):** a formal scoring function —
`ProcessingDecision = f(priority, queueSize, latency, workerLoad, dataSize, processingCost)`

## 11. Backpressure Policy

Backpressure = controlling the rate/handling of incoming non-critical work so queues don't grow unbounded. Implemented via the threshold tiers in §10. As pressure rises, the system progressively degrades non-critical handling (stream → batch → defer → shed) rather than accepting unlimited queue growth. [Our choice: implement via periodic queue-length sampling, not a full flow-control protocol — production-grade backpressure is explicitly out of scope per the PS.]

## 12. Shedding Policy

- Only triggers at the extreme-pressure tier.
- Only applies to non-critical events.
- Every shed/dropped event must be logged with: timestamp, event type, reason (e.g., "queue > T3"), and counted in dashboard metrics.
- Critical events are categorically excluded from shedding — this is a hard invariant, not a threshold behavior.

## 13. Critical-Event Guarantees

- Orders and payments are always routed to a dedicated high-priority path.
- Never batched, deferred, sampled, or dropped, under any load condition tested in the demo.
- The defensible claim (per PS): critical events get the *highest priority* and are *protected from loss* — not an unconditional latency guarantee under physically impossible load.

## 14. Queue/Worker Architecture

```
Event Simulator
      ↓
Event Classifier
      ↓
Priority Router
      ↓
 ┌───────────────┐
 │               │
High Queue    Low Queue
 │               │
 │          Decision Engine (thresholds)
 │               │
 │        ┌──────┼──────┐
 │        ↓      ↓      ↓
 │      Stream  Batch  Defer
 │                       ↓
 │                     Shed
 │
 └──────────┬────────────┘
            ↓
          Workers
            ↓
        Processing
            ↓
        Metrics
            ↓
        Dashboard
```

This is the PS's conceptual architecture, adopted as-is. [Our choice: implement queues as in-memory arrays/lists with simple worker loops — no external message broker.]

## 15. Dashboard Requirements

*(All PS-required minimums)*
- Incoming event rate
- Throughput
- Queue size by priority/tier
- Latency by priority/tier
- Number of processed events
- Number of batched events
- Number of deferred events
- Number of shed/dropped non-critical events
- Current processing mode/strategy

[Our choice: simple web page polling a metrics endpoint every 1s, plain charts — no need for a fancy frontend framework.]

## 16. Metrics and KPIs

- Critical-event p50/p95 latency
- Non-critical-event p50/p95 latency
- Events/min (in vs. processed vs. batched vs. deferred vs. shed)
- Queue depth over time, by tier
- Zero critical events lost (hard KPI — must hold true throughout demo)

## 17. Benchmark Methodology

Run two systems under identical simulated load (normal, then spike):

1. **Naive baseline:** single queue, no priority, no adaptation — every event processed in arrival order.
2. **Adaptive pipeline:** as designed above.

Compare: critical-event latency, non-critical latency, throughput, queue growth, dropped/deferred counts, resource utilization (CPU/memory if easy to capture). Goal: show the adaptive pipeline keeps critical latency low and bounded while the naive baseline degrades uniformly (including for payments/orders) under the 20× spike.

## 18. Failure/Edge Cases

- Spike triggered mid-batch — batching should flush or safely continue.
- Sustained max load — system should stabilize in the shed tier, not crash.
- Spike ends — system should ramp back down through the tiers (defer → batch → stream) as queue drains.
- Simulator misconfiguration (e.g., 0 events) — dashboard should show idle state without erroring.

## 19. MVP Scope (PS-required, must ship)

1. Event simulator (≥3 types, normal + on-demand 20× spike)
2. Priority-aware routing (critical vs non-critical, deterministic)
3. Adaptive stream-vs-batch processing for non-critical events
4. Backpressure with documented, logged shedding policy
5. Live observability dashboard with the fields in §15
6. Naive-baseline benchmark comparison

## 20. Stretch Goals (explicitly not MVP — only after MVP works)

1. Fault tolerance / idempotent retry
2. Dynamic worker scaling
3. Duplicate event detection
4. Formalized decision/scoring function (§10)
5. Cost estimation

## 21. Suggested Tech Stack

[Our choice, per PS's explicit scope constraints]
- **Language:** Node.js (fast to iterate, good for async event handling) or Python (simpler for teammates less familiar with async JS) — pick based on team strength
- **Queues:** in-memory arrays/lists, no Kafka/RabbitMQ
- **Workers:** simple async loops or worker threads/processes
- **Dashboard:** lightweight web server + polling frontend (plain HTML/JS or a minimal framework), no build pipeline needed
- **No:** real payment gateways, cloud infra, Kubernetes, LLM APIs, ML models

## 22. 30-Hour Implementation Plan

*(All [Our choice] — a suggested sequencing, not PS-mandated)*

| Hours | Focus |
|---|---|
| 0–3 | Repo setup, event simulator (types + rate control + spike trigger) |
| 3–7 | Classifier + priority router + two queues |
| 7–12 | Workers + stream processing for critical path (get critical path solid first) |
| 12–17 | Adaptive logic for non-critical: batch/defer/shed thresholds + logging |
| 17–21 | Metrics collection layer |
| 21–26 | Dashboard (live-updating) |
| 26–28 | Naive baseline implementation + benchmark run |
| 28–30 | Demo rehearsal, bug fixes, README/PRD alignment check |

## 23. Demo Flow

1. Start simulator at ~1,000 events/min — dashboard shows steady, all-stream processing.
2. Trigger the 20× spike on demand.
3. Narrate live: queue pressure rising → non-critical events shift to batching → then deferring → then shedding (if pressure is high enough).
4. Point out critical-event latency staying low and stable throughout.
5. Show the shed/dropped log — all entries are non-critical, all logged with reasons.
6. Show the benchmark comparison: naive baseline's critical latency degrading vs. the adaptive pipeline's staying protected.
7. Let the spike settle — show the system stepping back down through the tiers.

## 24. Acceptance Criteria

- [ ] Simulator produces ≥3 event types at both normal and 20× spike rates, spike triggerable on demand
- [ ] Every event is deterministically classified as critical/non-critical
- [ ] Critical events are never batched, deferred, or shed, at any load tested
- [ ] Non-critical events visibly shift processing mode as load increases
- [ ] All shed events are logged with a reason and counted on the dashboard
- [ ] Dashboard shows all §15 fields, updating live
- [ ] Naive-baseline benchmark run completed and compared against the adaptive pipeline
- [ ] System survives the full 20× spike without crashing

## 25. Risks and Possible Judge Questions

- **"What happens if payments spike, not just clicks?"** → Critical queue has no thresholds; it always streams. Worth stating this explicitly in the demo.
- **"Isn't this just a priority queue?"** → No — the differentiator is the *adaptive strategy switching* (stream/batch/defer/shed) for non-critical work, not just ordering.
- **"How do you know your thresholds are reasonable?"** → Be ready to show how T1/T2/T3 were chosen (even if just empirically tuned during the hackathon) and that they're configurable, not hardcoded magic numbers.
- **"What if the shed policy loses something important?"** → Reiterate the hard invariant: shedding is scoped only to non-critical events by design.
- **Risk:** Running out of time on the dashboard — mitigate by building metrics logging first (even console output) so the dashboard is just a rendering layer on top, addable last without touching core logic.
- **Risk:** Simulator not producing a convincing enough spike visually — test the on-demand trigger early, not at hour 29.
