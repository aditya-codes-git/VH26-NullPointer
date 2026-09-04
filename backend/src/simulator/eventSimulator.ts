import { nanoid } from 'nanoid';
import { EventType, PipelineEvent } from '../models/event.js';
import { classifyEvent } from '../classifier/eventClassifier.js';
import { PipelineConfig } from '../config/pipelineConfig.js';
import { KafkaEventProducer } from '../kafka/producer.js';
import { isProducerReady } from '../kafka/kafkaClient.js';

export type SimulatorMode = 'STOPPED' | 'NORMAL' | 'SPIKE';

export class EventSimulator {
  private mode: SimulatorMode = 'STOPPED';
  private timer: NodeJS.Timeout | null = null;
  private config: PipelineConfig;
  private onEventCallback: (event: PipelineEvent) => void;
  private kafkaProducer?: KafkaEventProducer;
  private isPausedByBackpressure = false;

  constructor(
    config: PipelineConfig,
    onEventCallback: (event: PipelineEvent) => void,
    kafkaProducer?: KafkaEventProducer
  ) {
    this.config = config;
    this.onEventCallback = onEventCallback;
    this.kafkaProducer = kafkaProducer;
  }

  public setKafkaProducer(producer: KafkaEventProducer): void {
    this.kafkaProducer = producer;
  }

  public getMode(): SimulatorMode {
    return this.mode;
  }

  public isPaused(): boolean {
    return this.isPausedByBackpressure;
  }

  public setBackpressurePause(paused: boolean): void {
    this.isPausedByBackpressure = paused;
  }

  public startNormal(): void {
    this.setMode('NORMAL');
  }

  public triggerSpike(): void {
    this.setMode('SPIKE');
  }

  public stop(): void {
    this.setMode('STOPPED');
  }

  public setMode(mode: SimulatorMode): void {
    this.mode = mode;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (mode === 'STOPPED') {
      return;
    }

    const eventsPerMin =
      mode === 'SPIKE' ? this.config.SPIKE_RATE_PER_MIN : this.config.NORMAL_RATE_PER_MIN;

    // Emit events in tight intervals (50ms) to ensure realistic streaming
    const intervalMs = 50;
    const intervalsPerMinute = (60 * 1000) / intervalMs;
    const eventsPerInterval = Math.max(1, Math.round(eventsPerMin / intervalsPerMinute));

    this.timer = setInterval(() => {
      if (this.isPausedByBackpressure) {
        return; // Admission paused to protect system from saturation
      }

      for (let i = 0; i < eventsPerInterval; i++) {
        const event = this.generateRandomEvent();

        // If Kafka producer is connected, route through Kafka; otherwise fallback for demo resilience
        if (this.kafkaProducer && isProducerReady()) {
          this.kafkaProducer
            .publish({
              id: event.id,
              type: event.type,
              timestamp: event.createdAt,
              payload: event.payload,
            })
            .catch(() => {
              this.onEventCallback(event);
            });
        } else {
          this.onEventCallback(event);
        }
      }
    }, intervalMs);
  }

  private generateRandomEvent(): PipelineEvent {
    // E-commerce distribution:
    // 10% PAYMENT, 10% ORDER, 20% INVENTORY, 35% CLICK, 25% LOG
    const roll = Math.random();
    let type: EventType;

    if (roll < 0.1) {
      type = 'PAYMENT';
    } else if (roll < 0.2) {
      type = 'ORDER';
    } else if (roll < 0.4) {
      type = 'INVENTORY';
    } else if (roll < 0.75) {
      type = 'CLICK';
    } else {
      type = 'LOG';
    }

    const priority = classifyEvent(type);
    const now = Date.now();

    return {
      id: nanoid(10),
      type,
      priority,
      payload: {
        userId: `usr_${Math.floor(Math.random() * 10000)}`,
        amount: type === 'PAYMENT' || type === 'ORDER' ? Math.floor(Math.random() * 500) + 10 : undefined,
        itemSku: type === 'INVENTORY' ? `SKU_${Math.floor(Math.random() * 500)}` : undefined,
      },
      createdAt: now,
      queuedAt: now,
      status: 'QUEUED',
    };
  }
}
