import { Router } from 'express';
import { EventSimulator } from '../simulator/eventSimulator.js';
import { MetricsCollector } from '../metrics/metricsCollector.js';
import { runBenchmarkComparison } from '../benchmark/naiveBaseline.js';
import { PipelineConfig } from '../config/pipelineConfig.js';
import { broadcastTelemetryNow } from '../websocket/socketServer.js';
import { KafkaEventProducer } from '../kafka/producer.js';
import { getKafkaStatus, isProducerReady, KAFKA_CONFIG } from '../kafka/kafkaClient.js';
import { RetryController } from '../resilience/retryController.js';
import { WorkerScaler } from '../workers/workerScaler.js';
import { DuplicateDetector } from '../resilience/duplicateDetector.js';
import { PriorityRouter } from '../router/priorityRouter.js';
import { classifyEvent } from '../classifier/eventClassifier.js';
import { EventType } from '../models/event.js';

export function createApiRouter(
  simulator: EventSimulator,
  metricsCollector: MetricsCollector,
  config: PipelineConfig,
  kafkaProducer?: KafkaEventProducer,
  retryController?: RetryController,
  workerScaler?: WorkerScaler,
  duplicateDetector?: DuplicateDetector,
  priorityRouter?: PriorityRouter
): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    const kafkaStatus = getKafkaStatus();
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      kafka: {
        connected: kafkaStatus.connected,
        producerReady: kafkaStatus.producerReady,
        consumerReady: kafkaStatus.consumerReady,
        brokers: kafkaStatus.brokers,
        topic: kafkaStatus.topic,
      },
    });
  });

  router.get('/metrics', (_req, res) => {
    res.json(metricsCollector.getSnapshot());
  });

  // ==========================================================
  // Ingestion API: External Entry Point -> Kafka Producer
  // ==========================================================
  router.post('/ingest', async (req, res) => {
    const { id, type, timestamp, payload } = req.body || {};

    // 1. Minimum schema validation
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid required field: id (string)' });
    }

    const validTypes = ['ORDER', 'PAYMENT', 'INVENTORY', 'CLICK', 'LOG'];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({
        error: `Missing or invalid required field: type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    if (!timestamp || typeof timestamp !== 'number') {
      return res.status(400).json({ error: 'Missing or invalid required field: timestamp (unix timestamp number)' });
    }

    // 2. Routing: Kafka ingestion if available, or direct priority router fallback
    if (kafkaProducer && isProducerReady()) {
      try {
        await kafkaProducer.publish({
          id,
          type,
          timestamp,
          payload: payload || {},
        });

        return res.status(202).json({
          status: 'accepted',
          eventId: id,
          topic: KAFKA_CONFIG.topic,
        });
      } catch (err: any) {
        return res.status(500).json({
          status: 'rejected',
          error: `Failed to publish event to Kafka: ${err.message}`,
          eventId: id,
        });
      }
    } else if (priorityRouter) {
      // Direct pipeline admission (e.g. offline demo or direct ingestion mode)
      const priority = classifyEvent(type as EventType);
      if (duplicateDetector) {
        const check = duplicateDetector.checkAndRegister(id, type as EventType, priority);
        if (check.isDuplicate) {
          broadcastTelemetryNow();
          return res.status(409).json({
            status: 'rejected',
            reason: 'duplicate_blocked',
            eventId: id,
            message: check.reason,
          });
        }
      }

      const pipelineEvent = {
        id,
        type: type as EventType,
        priority,
        payload: payload || {},
        createdAt: timestamp,
        queuedAt: Date.now(),
        status: 'QUEUED' as const,
      };

      metricsCollector.recordIncomingEvent(pipelineEvent);
      priorityRouter.route(pipelineEvent);
      broadcastTelemetryNow();

      return res.status(200).json({
        status: 'admitted',
        eventId: id,
      });
    } else {
      return res.status(503).json({
        status: 'rejected',
        error: 'Kafka ingestion unavailable: broker not connected',
        eventId: id,
      });
    }
  });

  // ==========================================================
  // Simulation Controls (Compatible with Dashboard)
  // ==========================================================
  router.post('/simulator/start', (_req, res) => {
    simulator.startNormal();
    broadcastTelemetryNow();
    res.json({ message: 'Simulator started at normal rate (~1,000 events/min)', mode: 'NORMAL' });
  });

  router.post('/simulator/rate', (req, res) => {
    const rate = Number(req.body?.rate ?? req.body?.eventsPerMin);
    if (!rate || isNaN(rate) || rate < 100 || rate > 100000) {
      return res.status(400).json({ error: 'Invalid rate. Must be a number between 100 and 100,000.' });
    }
    simulator.setRate(rate);
    broadcastTelemetryNow();
    res.json({
      message: `Simulator rate set to ${rate.toLocaleString()} events/min`,
      rate,
      mode: simulator.getMode(),
    });
  });

  router.post('/simulator/spike', (req, res) => {
    const customRate = Number(req.body?.rate ?? req.body?.eventsPerMin);
    if (customRate && !isNaN(customRate) && customRate >= 100) {
      simulator.setRate(customRate);
      broadcastTelemetryNow();
      return res.json({
        message: `Traffic rate set to ${customRate.toLocaleString()} events/min`,
        rate: customRate,
        mode: simulator.getMode(),
      });
    }
    simulator.triggerSpike();
    broadcastTelemetryNow();
    res.json({ message: '20x Flash-sale spike triggered (~20,000 events/min)', mode: 'SPIKE' });
  });

  router.post('/simulator/normal', (_req, res) => {
    simulator.startNormal();
    broadcastTelemetryNow();
    res.json({ message: 'Returned to normal load (~1,000 events/min)', mode: 'NORMAL' });
  });

  router.post('/simulator/stop', (_req, res) => {
    simulator.stop();
    broadcastTelemetryNow();
    res.json({ message: 'Simulator stopped', mode: 'STOPPED' });
  });

  router.post('/simulator/reset', (_req, res) => {
    simulator.stop();
    metricsCollector.reset();
    broadcastTelemetryNow();
    res.json({ message: 'Pipeline and counters reset', status: 'IDLE' });
  });

  router.post('/benchmark/run', async (req, res) => {
    try {
      const eventCount = Number(req.body?.eventCount) || 1500;
      const comparison = await runBenchmarkComparison(eventCount);
      res.json(comparison);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Benchmark execution failed' });
    }
  });

  router.get('/config', (_req, res) => {
    res.json(config);
  });

  // ==========================================================
  // Stretch Goal 1: Fault Tolerance with Idempotent Retry Demo
  // ==========================================================
  router.post('/demo/failure', (req, res) => {
    if (!retryController) {
      return res.status(500).json({ error: 'RetryController not registered on API router' });
    }
    const targetType = req.body?.type;
    const mode = req.body?.mode || 'single';
    retryController.armFailure(targetType, mode);
    broadcastTelemetryNow();
    res.json({
      armed: true,
      mode,
      message: `Worker failure simulation armed (mode: ${mode}) for next eligible event`,
      targetType: targetType || 'ANY',
    });
  });

  router.get('/demo/fault-tolerance', (_req, res) => {
    if (!retryController) {
      return res.status(500).json({ error: 'RetryController not registered' });
    }
    res.json(retryController.getTelemetry());
  });

  // ==========================================================
  // Stretch Goal 2: Dynamic Worker Scaling Demo Endpoints
  // ==========================================================
  router.get('/demo/worker-scaling', (_req, res) => {
    if (!workerScaler) {
      return res.status(500).json({ error: 'WorkerScaler not registered' });
    }
    res.json(workerScaler.getTelemetry());
  });

  /**
   * Stimulates real scaling evaluation: runs an evaluation pass after applying
   * or checking genuine queue metrics. The WorkerScaler independently decides
   * whether to scale up/down/stay.
   */
  router.post('/demo/scale', async (_req, res) => {
    if (!workerScaler) {
      return res.status(500).json({ error: 'WorkerScaler not registered' });
    }
    await workerScaler.evaluate();
    broadcastTelemetryNow();
    res.json({
      message: 'WorkerScaler evaluation completed',
      telemetry: workerScaler.getTelemetry(),
    });
  });

  // ==========================================================
  // Stretch Goal 3: Duplicate Event Detection Demo Endpoints
  // ==========================================================
  router.get('/demo/duplicates', (_req, res) => {
    if (!duplicateDetector) {
      return res.status(500).json({ error: 'DuplicateDetector not registered' });
    }
    res.json(duplicateDetector.getTelemetry());
  });

  /**
   * Demo test: Submits an initial event (accepted as NEW),
   * then immediately attempts to submit the exact same Event ID (blocked as DUPLICATE).
   */
  router.post('/demo/duplicate', (req, res) => {
    if (!duplicateDetector) {
      return res.status(500).json({ error: 'DuplicateDetector not registered' });
    }

    const testEventId = req.body?.eventId || `ORD-DUP-${Math.floor(100000 + Math.random() * 900000)}`;
    const eventType: EventType = (req.body?.type as EventType) || 'ORDER';
    const priority = classifyEvent(eventType);
    const now = Date.now();

    // 1. Initial submission -> NEW (admit)
    const check1 = duplicateDetector.checkAndRegister(testEventId, eventType, priority);
    let admittedEvent = false;

    if (!check1.isDuplicate) {
      admittedEvent = true;
      if (priorityRouter) {
        const pipelineEvent = {
          id: testEventId,
          type: eventType,
          priority,
          payload: req.body?.payload || { item: 'Wireless Headphones', amount: 89.99 },
          createdAt: now,
          queuedAt: now,
          status: 'QUEUED' as const,
        };
        metricsCollector.recordIncomingEvent(pipelineEvent);
        priorityRouter.route(pipelineEvent);
      }
    }

    // 2. Duplicate submission -> DUPLICATE (reject immediately, no admission to pipeline)
    const check2 = duplicateDetector.checkAndRegister(testEventId, eventType, priority);

    // Broadcast updated duplicate detection telemetry via Socket.IO
    broadcastTelemetryNow();

    return res.json({
      message: 'Duplicate event admission test executed',
      firstSubmission: {
        eventId: testEventId,
        type: eventType,
        priority,
        status: admittedEvent ? 'ADMITTED' : 'ALREADY_EXISTS',
        isDuplicate: check1.isDuplicate,
      },
      secondSubmission: {
        eventId: testEventId,
        type: eventType,
        priority,
        status: 'REJECTED',
        isDuplicate: check2.isDuplicate,
        reason: check2.reason,
      },
      telemetry: duplicateDetector.getTelemetry(),
    });
  });

  return router;
}
