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
  private isJoined = false;

  constructor(priorityRouter: PriorityRouter, metricsCollector: MetricsCollector) {
    this.priorityRouter = priorityRouter;
    this.metricsCollector = metricsCollector;
    this.consumer = kafka.consumer({
      groupId: KAFKA_CONFIG.groupId,
      retry: {
        initialRetryTime: 300,
        retries: 8,
      },
    });

    this.registerEventListeners();
  }

  private registerEventListeners(): void {
    // Strictly mark consumerReady = true ONLY when Kafka confirms group join
    this.consumer.on(this.consumer.events.GROUP_JOIN, (event) => {
      this.isJoined = true;
      setKafkaState({ consumerReady: true });
      console.log(
        `[KAFKA CONSUMER] Joined group '${event.payload.groupId}' (member: ${event.payload.memberId}) | Partitions: ${JSON.stringify(event.payload.memberAssignment)}`
      );
    });

    this.consumer.on(this.consumer.events.CRASH, (event) => {
      this.isJoined = false;
      setKafkaState({ consumerReady: false });
      console.error(`[KAFKA CONSUMER] Consumer crashed: ${event.payload.error?.message}`);
    });

    this.consumer.on(this.consumer.events.DISCONNECT, () => {
      this.isJoined = false;
      setKafkaState({ consumerReady: false });
      console.log('[KAFKA CONSUMER] Disconnected from broker');
    });

    this.consumer.on(this.consumer.events.STOP, () => {
      this.isJoined = false;
      setKafkaState({ consumerReady: false });
    });
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;

    try {
      console.log(`[KAFKA CONSUMER] Connecting to broker...`);
      await this.consumer.connect();

      console.log(`[KAFKA CONSUMER] Subscribing to topic '${KAFKA_CONFIG.topic}'...`);
      await this.consumer.subscribe({
        topic: KAFKA_CONFIG.topic,
        fromBeginning: false,
      });

      this.isRunning = true;

      // Start message consumption loop (KafkaJS joins group asynchronously)
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
              console.log(`[KAFKA CONSUMER] Consumed ${pipelineEvent.id} (${pipelineEvent.type}) from partition ${partition}`);
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

      // Wait until the group join has actually occurred before returning
      await this.waitForGroupJoin(10000);
      console.log(`[KAFKA CONSUMER] Connected & joined '${KAFKA_CONFIG.groupId}' on '${KAFKA_CONFIG.topic}'`);
    } catch (err: any) {
      this.isRunning = false;
      this.isJoined = false;
      setKafkaState({ consumerReady: false });
      console.error(`[KAFKA CONSUMER] Failed to start/join group: ${err.message}`);
      throw err;
    }
  }

  private async waitForGroupJoin(timeoutMs = 10000): Promise<void> {
    const start = Date.now();
    while (!this.isJoined && Date.now() - start < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (!this.isJoined) {
      throw new Error(`Consumer did not receive GROUP_JOIN for '${KAFKA_CONFIG.groupId}' within ${timeoutMs}ms`);
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    try {
      this.isRunning = false;
      this.isJoined = false;
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

