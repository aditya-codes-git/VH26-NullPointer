import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { DEFAULT_CONFIG } from './config/pipelineConfig.js';
import { QueueManager } from './queues/queueManager.js';
import { PriorityRouter } from './router/priorityRouter.js';
import { BatchProcessor } from './processing/batchProcessor.js';
import { SheddingPolicy } from './backpressure/sheddingPolicy.js';
import { BackpressureController } from './backpressure/backpressureController.js';
import { AdaptiveDecisionEngine } from './decision-engine/adaptiveEngine.js';
import { WorkerPool } from './processing/workerPool.js';
import { MetricsCollector } from './metrics/metricsCollector.js';
import { RetryController } from './resilience/retryController.js';
import { EventSimulator } from './simulator/eventSimulator.js';
import { createApiRouter } from './api/routes.js';
import { setupSocketServer, broadcastTelemetryNow } from './websocket/socketServer.js';
import { KafkaEventProducer } from './kafka/producer.js';
import { KafkaEventConsumer } from './kafka/consumer.js';
import { ensureTopicExists, KAFKA_CONFIG } from './kafka/kafkaClient.js';

import { WorkerScaler } from './workers/workerScaler.js';
import { DuplicateDetector } from './resilience/duplicateDetector.js';
import { FormalizedDecisionEngine } from './decision-engine/formalizedDecisionEngine.js';
import { HistoryPersister } from './persistence/historyPersister.js';

const app = express();
app.use(cors());
app.use(express.json());

const config = { ...DEFAULT_CONFIG };
const queueManager = new QueueManager(config);
const retryController = new RetryController(config, queueManager);
const batchProcessor = new BatchProcessor(config, retryController);
const sheddingPolicy = new SheddingPolicy(queueManager);
const backpressureController = new BackpressureController(config, queueManager);
const adaptiveEngine = new AdaptiveDecisionEngine(config, queueManager);
const duplicateDetector = new DuplicateDetector(60, 10000);

const metricsCollector = new MetricsCollector(
  queueManager,
  sheddingPolicy,
  backpressureController,
  adaptiveEngine,
  retryController
);
metricsCollector.registerDuplicateDetector(duplicateDetector);

const priorityRouter = new PriorityRouter(
  queueManager,
  sheddingPolicy,
  metricsCollector
);

const workerPool = new WorkerPool(
  config,
  queueManager,
  batchProcessor,
  sheddingPolicy,
  adaptiveEngine,
  retryController
);
workerPool.registerMetricsCollector(metricsCollector);

const historyPersister = new HistoryPersister();

// Dynamic Worker Scaler
const workerScaler = new WorkerScaler(
  config,
  workerPool,
  queueManager,
  metricsCollector,
  () => {
    broadcastTelemetryNow();
  }
);
workerScaler.onScalingAction = (action) => historyPersister.recordScaling(action);
metricsCollector.registerWorkerScaler(workerScaler);

// Formalized Decision Engine
const formalizedDecisionEngine = new FormalizedDecisionEngine(
  config,
  queueManager,
  adaptiveEngine,
  workerPool,
  workerScaler,
  metricsCollector
);
formalizedDecisionEngine.onDecision = (entry) => historyPersister.recordDecision(entry);
metricsCollector.registerDecisionEngine(formalizedDecisionEngine);

// Register persistence callbacks
retryController.onAuditLog = (entry) => historyPersister.recordRetry(entry);
duplicateDetector.onDuplicate = (entry) => historyPersister.recordDuplicate(entry);

// Wire worker completion to metrics and persistent history
workerPool.setListeners(
  ({ event, latencyMs }) => {
    metricsCollector.recordProcessedEvent(event, latencyMs);
    historyPersister.recordEvent(event, latencyMs);
  },
  (events, durationMs) => {
    metricsCollector.recordBatchProcessed(events, durationMs);
    const avgLatency = durationMs / (events.length || 1);
    for (const e of events) {
      historyPersister.recordEvent(e, avgLatency);
    }
  }
);

// Initialize Kafka Producer & Consumer
const kafkaProducer = new KafkaEventProducer();
const kafkaConsumer = new KafkaEventConsumer(priorityRouter, metricsCollector, duplicateDetector);

// Initialize Simulator (uses Kafka when available, falls back to direct pipeline for offline dashboard demo)
const simulator = new EventSimulator(
  config,
  (event) => {
    metricsCollector.recordIncomingEvent(event);
    priorityRouter.route(event);
  },
  kafkaProducer,
  duplicateDetector
);

metricsCollector.registerSimulator(simulator);
backpressureController.registerSimulator(simulator);

// Start workers and scaler
workerPool.start();
workerScaler.start();

// Mount API routes (including POST /api/ingest and Supabase historical routes)
app.use(
  '/api',
  createApiRouter(
    simulator,
    metricsCollector,
    config,
    kafkaProducer,
    retryController,
    workerScaler,
    duplicateDetector,
    priorityRouter,
    formalizedDecisionEngine,
    historyPersister
  )
);

const httpServer = createServer(app);
setupSocketServer(httpServer, metricsCollector, workerPool);

// Start Kafka connectivity with strict sequencing and robust retry
async function startKafkaSubsystem(retries = 10, delayMs = 3000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[KAFKA] Initializing Kafka subsystem (attempt ${attempt}/${retries})...`);

      // 1. Connect Producer
      await kafkaProducer.start();

      // 2. Ensure topic exists with 3 partitions and partition metadata is ready
      await ensureTopicExists(KAFKA_CONFIG.topic, 3);

      // 3. Connect Consumer and join consumer group
      await kafkaConsumer.start();

      console.log(
        `[KAFKA] Subsystem fully initialized: Producer ready, topic '${KAFKA_CONFIG.topic}' ready, consumer joined '${KAFKA_CONFIG.groupId}'.`
      );
      return;
    } catch (err: any) {
      console.warn(`[KAFKA] Subsystem init attempt ${attempt} failed: ${err.message}`);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        console.error(`[KAFKA] Could not connect to Kafka after ${retries} attempts. Running in standalone fallback mode.`);
      }
    }
  }
}

startKafkaSubsystem().catch(() => {});

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`[AdaptiFlow Backend] Server running on http://localhost:${PORT}`);
  console.log(`[AdaptiFlow Backend] Ingestion API available at POST http://localhost:${PORT}/api/ingest`);
  console.log(`[AdaptiFlow Backend] Normal Rate: ${config.NORMAL_RATE_PER_MIN}/min | Spike Rate: ${config.SPIKE_RATE_PER_MIN}/min`);
  console.log(`[AdaptiFlow Backend] Worker service time: ${config.BASE_PROCESSING_DELAY_MS}ms per event`);
});

// Graceful shutdown handling
const handleShutdown = async () => {
  console.log('\n[SERVER] Gracefully shutting down...');
  try {
    await kafkaConsumer.stop();
    await kafkaProducer.stop();
  } catch {}
  workerScaler.stop();
  workerPool.stop();
  process.exit(0);
};

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);
