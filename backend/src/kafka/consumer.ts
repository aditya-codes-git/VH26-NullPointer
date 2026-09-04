import { Consumer } from 'kafkajs';
import { kafka, KAFKA_CONFIG, setKafkaState } from './kafkaClient.js';
import { classifyEvent } from '../classifier/eventClassifier.js';
import { PriorityRouter } from '../router/priorityRouter.js';
import { MetricsCollector } from '../metrics/metricsCollector.js';
import { PipelineEvent, EventType } from '../models/event.js';

export class KafkaEventConsumer {
  private consumer: Consumer;
  private priorityRouter: PriorityRouter;
  private metricsCollector: MetricsCollector;
  private consumedCount = 0;
  private isRunning = false;

  constructor(priorityRouter: PriorityRouter, metricsCollector: MetricsCollector) {
    this.priorityRouter = priorityRouter;
    this.metricsCollector = metricsCollector;
    this.consumer = kafka.consumer({
      groupId: KAFKA_CONFIG.groupId,
      retry: {
        initialRetryTime: 300,
        retries: 5,
      },
    });
  }

  public async start(): Promise<void> {
    try {
      await this.consumer.connect();
      await this.consumer.subscribe({
        topic: KAFKA_CONFIG.topic,
        fromBeginning: false,
      });

      setKafkaState({ consumerReady: true });
      this.isRunning = true;
      console.log(`[KAFKA CONSUMER] Connected & subscribed to '${KAFKA_CONFIG.topic}' (group: ${KAFKA_CONFIG.groupId})`);

      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          if (!message.value) return;

          try {
            const raw = JSON.parse(message.value.toString());
            this.consumedCount++;

            // 1. Deterministic classification via existing EventClassifier
            const type = (raw.type as EventType) || 'LOG';
            const priority = classifyEvent(type);

            const pipelineEvent: PipelineEvent = {
              id: raw.id || `evt_${Date.now()}`,
              type,
              priority,
              payload: raw.payload || {},
              createdAt: Number(raw.timestamp) || Date.now(),
              queuedAt: Date.now(),
              status: 'QUEUED',
            };

            // 2. Sampled logging for high-volume scenarios
            if (this.consumedCount <= 5 || this.consumedCount % 250 === 0) {
              console.log(`[KAFKA CONSUMER] Consumed ${pipelineEvent.id} (${pipelineEvent.type})`);
              console.log(`[PIPELINE] ${pipelineEvent.id} → ${pipelineEvent.priority}`);
            }

            // 3. Record incoming telemetry metric
            this.metricsCollector.recordIncomingEvent(pipelineEvent);

            // 4. Route into isolated priority queues (Let downstream adaptive engine manage flow)
            this.priorityRouter.route(pipelineEvent);
          } catch (err: any) {
            console.error(`[KAFKA CONSUMER] Error processing message from partition ${partition}: ${err.message}`);
          }
        },
      });
    } catch (err: any) {
      setKafkaState({ consumerReady: false });
      console.error(`[KAFKA CONSUMER] Failed to connect/start consumer: ${err.message}`);
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    try {
      this.isRunning = false;
      await this.consumer.disconnect();
      setKafkaState({ consumerReady: false });
      console.log('[KAFKA CONSUMER] Disconnected');
    } catch (err: any) {
      console.error(`[KAFKA CONSUMER] Error disconnecting: ${err.message}`);
    }
  }

  public getConsumedCount(): number {
    return this.consumedCount;
  }
}
