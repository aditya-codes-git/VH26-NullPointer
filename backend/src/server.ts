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
import { EventSimulator } from './simulator/eventSimulator.js';
import { createApiRouter } from './api/routes.js';
import { setupSocketServer } from './websocket/socketServer.js';

const app = express();
app.use(cors());
app.use(express.json());

const config = { ...DEFAULT_CONFIG };
const queueManager = new QueueManager(config);
const priorityRouter = new PriorityRouter(queueManager);
const batchProcessor = new BatchProcessor(config);
const sheddingPolicy = new SheddingPolicy(queueManager);
const backpressureController = new BackpressureController(config, queueManager);
const adaptiveEngine = new AdaptiveDecisionEngine(config, queueManager);

const metricsCollector = new MetricsCollector(
  queueManager,
  sheddingPolicy,
  backpressureController,
  adaptiveEngine
);

const workerPool = new WorkerPool(
  config,
  queueManager,
  batchProcessor,
  sheddingPolicy
);
workerPool.registerMetricsCollector(metricsCollector);

// Wire worker completion to metrics
workerPool.setListeners(
  ({ event, latencyMs }) => {
    metricsCollector.recordProcessedEvent(event, latencyMs);
  },
  (events, durationMs) => {
    metricsCollector.recordBatchProcessed(events, durationMs);
  }
);

// Initialize Simulator
const simulator = new EventSimulator(config, (event) => {
  metricsCollector.recordIncomingEvent(event);
  const routeResult = priorityRouter.route(event);

  if (routeResult.dropped) {
    sheddingPolicy.executeShedding(1, routeResult.reason || 'CAPACITY_REJECT');
  }
});

metricsCollector.registerSimulator(simulator);
backpressureController.registerSimulator(simulator);

// Start workers
workerPool.start();

// Mount API routes
app.use('/api', createApiRouter(simulator, metricsCollector, config));

const httpServer = createServer(app);
setupSocketServer(httpServer, metricsCollector, workerPool);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`[AdaptiFlow Backend] Server running on http://localhost:${PORT}`);
  console.log(`[AdaptiFlow Backend] Normal Rate: ${config.NORMAL_RATE_PER_MIN}/min | Spike Rate: ${config.SPIKE_RATE_PER_MIN}/min`);
  console.log(`[AdaptiFlow Backend] Worker service time: ${config.BASE_PROCESSING_DELAY_MS}ms per event`);
});
