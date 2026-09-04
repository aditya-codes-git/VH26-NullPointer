import { nanoid } from 'nanoid';
import { EventType, PipelineEvent } from '../models/event.js';
import { classifyEvent } from '../classifier/eventClassifier.js';
import { PipelineConfig } from '../config/pipelineConfig.js';
import { KafkaEventProducer } from '../kafka/producer.js';
import { isProducerReady } from '../kafka/kafkaClient.js';

export type SimulatorMode = 'STOPPED' | 'NORMAL' | 'SPIKE' | 'CUSTOM';

export class EventSimulator {
  private mode: SimulatorMode = 'STOPPED';
  private timer: NodeJS.Timeout | null = null;
  private config: PipelineConfig;
  private onEventCallback: (event: PipelineEvent) => void;
  private kafkaProducer?: KafkaEventProducer;
  private isPausedByBackpressure = false;
  private currentRatePerMin = 0;

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

  public getCurrentRate(): number {
    return this.currentRatePerMin;
  }

  public isPaused(): boolean {
    return this.isPausedByBackpressure;
  }

  public setBackpressurePause(paused: boolean): void {
    this.isPausedByBackpressure = paused;
  }

  public startNormal(): void {
    this.setRate(this.config.NORMAL_RATE_PER_MIN);
  }

  public triggerSpike(): void {
    this.setRate(this.config.SPIKE_RATE_PER_MIN);
  }

  public stop(): void {
    this.setRate(0);
  }

  public setMode(mode: SimulatorMode): void {
    if (mode === 'NORMAL') {
      this.startNormal();
    } else if (mode === 'SPIKE') {
      this.triggerSpike();
    } else {
      this.stop();
    }
  }

  public setRate(eventsPerMin: number): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (eventsPerMin <= 0) {
      this.mode = 'STOPPED';
      this.currentRatePerMin = 0;
      return;
    }

    if (eventsPerMin === this.config.NORMAL_RATE_PER_MIN) {
      this.mode = 'NORMAL';
    } else if (eventsPerMin === this.config.SPIKE_RATE_PER_MIN) {
      this.mode = 'SPIKE';
    } else {
      this.mode = 'CUSTOM';
    }

    this.currentRatePerMin = eventsPerMin;

    // Emit events in tight intervals (50ms) using fractional accumulation for accurate rate
    const intervalMs = 50;
    const intervalsPerSec = 1000 / intervalMs;
    const eventsPerIntervalFloat = (eventsPerMin / 60) / intervalsPerSec;
    let accumulator = 0;

    this.timer = setInterval(() => {
      if (this.isPausedByBackpressure) {
        return; // Admission paused to protect system from saturation
      }

      accumulator += eventsPerIntervalFloat;
      const countToSend = Math.floor(accumulator);
      accumulator -= countToSend;

      for (let i = 0; i < countToSend; i++) {
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
