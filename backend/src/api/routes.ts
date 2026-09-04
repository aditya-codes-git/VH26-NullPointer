import { Router } from 'express';
import { EventSimulator } from '../simulator/eventSimulator.js';
import { MetricsCollector } from '../metrics/metricsCollector.js';
import { runBenchmarkComparison } from '../benchmark/naiveBaseline.js';
import { PipelineConfig } from '../config/pipelineConfig.js';
import { broadcastTelemetryNow } from '../websocket/socketServer.js';
import { KafkaEventProducer } from '../kafka/producer.js';
import { getKafkaStatus, isProducerReady, KAFKA_CONFIG } from '../kafka/kafkaClient.js';

export function createApiRouter(
  simulator: EventSimulator,
  metricsCollector: MetricsCollector,
  config: PipelineConfig,
  kafkaProducer?: KafkaEventProducer
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

    // 2. Strict 503 if Kafka broker is unavailable (No silent fallback for external ingestion)
    if (!kafkaProducer || !isProducerReady()) {
      return res.status(503).json({
        status: 'rejected',
        error: 'Kafka ingestion unavailable: broker not connected',
        eventId: id,
      });
    }

    // 3. Publish to Kafka topic
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
  });

  // ==========================================================
  // Simulation Controls (Compatible with Dashboard)
  // ==========================================================
  router.post('/simulator/start', (_req, res) => {
    simulator.startNormal();
    broadcastTelemetryNow();
    res.json({ message: 'Simulator started at normal rate (~1,000 events/min)', mode: 'NORMAL' });
  });

  router.post('/simulator/spike', (_req, res) => {
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

  return router;
}
