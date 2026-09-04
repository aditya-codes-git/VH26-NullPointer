import { Producer } from 'kafkajs';
import { kafka, KAFKA_CONFIG, setKafkaState, isProducerReady } from './kafkaClient.js';

export interface IngestionEventPayload {
  id: string;
  type: string;
  timestamp: number;
  payload?: Record<string, any>;
  [key: string]: any;
}

export class KafkaEventProducer {
  private producer: Producer;
  private publishedCount = 0;

  constructor() {
    this.producer = kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });
  }

  public async start(): Promise<void> {
    try {
      await this.producer.connect();
      setKafkaState({ producerReady: true });
      console.log(`[KAFKA PRODUCER] Connected to Kafka brokers (${KAFKA_CONFIG.brokers.join(',')})`);
    } catch (err: any) {
      setKafkaState({ producerReady: false });
      console.error(`[KAFKA PRODUCER] Failed to connect to Kafka brokers: ${err.message}`);
    }
  }

  public async publish(event: IngestionEventPayload): Promise<void> {
    if (!isProducerReady()) {
      throw new Error('Kafka producer is not connected to any broker');
    }

    const value = JSON.stringify({
      id: event.id,
      type: event.type,
      timestamp: event.timestamp || Date.now(),
      payload: event.payload || {},
    });

    await this.producer.send({
      topic: KAFKA_CONFIG.topic,
      messages: [{ key: event.id, value }],
    });

    this.publishedCount++;
    // Sampled logging to avoid terminal flooding
    if (this.publishedCount <= 5 || this.publishedCount % 250 === 0) {
      console.log(`[KAFKA PRODUCER] Published ${event.id} (${event.type}) [Total: ${this.publishedCount}]`);
    }
  }

  public async stop(): Promise<void> {
    try {
      await this.producer.disconnect();
      setKafkaState({ producerReady: false });
      console.log('[KAFKA PRODUCER] Disconnected');
    } catch (err: any) {
      console.error(`[KAFKA PRODUCER] Error disconnecting: ${err.message}`);
    }
  }

  public getPublishedCount(): number {
    return this.publishedCount;
  }
}
