import { Kafka, logLevel } from 'kafkajs';

export const KAFKA_CONFIG = {
  brokers: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(',') : ['localhost:9092'],
  clientId: process.env.KAFKA_CLIENT_ID || 'adaptive-pipeline',
  topic: process.env.KAFKA_TOPIC || 'ecommerce-events',
  groupId: process.env.KAFKA_GROUP_ID || 'pipeline-consumer-group',
};

export const kafka = new Kafka({
  clientId: KAFKA_CONFIG.clientId,
  brokers: KAFKA_CONFIG.brokers,
  logLevel: logLevel.WARN,
  retry: {
    initialRetryTime: 300,
    retries: 5,
  },
});

interface KafkaStatus {
  connected: boolean;
  producerReady: boolean;
  consumerReady: boolean;
  brokers: string[];
  topic: string;
}

const status: KafkaStatus = {
  connected: false,
  producerReady: false,
  consumerReady: false,
  brokers: KAFKA_CONFIG.brokers,
  topic: KAFKA_CONFIG.topic,
};

export function setKafkaState(update: Partial<KafkaStatus>): void {
  Object.assign(status, update);
  status.connected = status.producerReady && status.consumerReady;
}

export function getKafkaStatus(): KafkaStatus {
  return { ...status };
}

export function isProducerReady(): boolean {
  return status.producerReady;
}

export function isConsumerReady(): boolean {
  return status.consumerReady;
}

export async function ensureTopicExists(topic: string, partitions = 3): Promise<void> {
  const admin = kafka.admin();
  try {
    await admin.connect();
    const existingTopics = await admin.listTopics();
    if (!existingTopics.includes(topic)) {
      console.log(`[KAFKA ADMIN] Creating topic '${topic}' with ${partitions} partitions...`);
      await admin.createTopics({
        topics: [
          {
            topic,
            numPartitions: partitions,
            replicationFactor: 1,
          },
        ],
        waitForLeaders: true,
      });
      console.log(`[KAFKA ADMIN] Topic '${topic}' created successfully.`);
    }
    // Verify partition leader metadata is available
    await admin.fetchTopicMetadata({ topics: [topic] });
  } finally {
    await admin.disconnect().catch(() => {});
  }
}
