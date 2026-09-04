import { PipelineEvent } from '../models/event.js';

export class BoundedQueue {
  public readonly name: string;
  public readonly capacity: number;
  private queue: PipelineEvent[] = [];
  
  public totalEnqueued = 0;
  public totalDequeued = 0;

  constructor(name: string, capacity: number) {
    this.name = name;
    this.capacity = capacity;
  }

  public enqueue(event: PipelineEvent): boolean {
    if (this.queue.length >= this.capacity) {
      return false; // Queue is at full capacity
    }
    event.queuedAt = Date.now();
    event.status = 'QUEUED';
    this.queue.push(event);
    this.totalEnqueued++;
    return true;
  }

  public dequeue(): PipelineEvent | undefined {
    const item = this.queue.shift();
    if (item) {
      this.totalDequeued++;
    }
    return item;
  }

  public dequeueBatch(batchSize: number): PipelineEvent[] {
    const batch = this.queue.splice(0, batchSize);
    this.totalDequeued += batch.length;
    return batch;
  }

  public peek(): PipelineEvent | undefined {
    return this.queue[0];
  }

  public size(): number {
    return this.queue.length;
  }

  public isEmpty(): boolean {
    return this.queue.length === 0;
  }

  public isFull(): boolean {
    return this.queue.length >= this.capacity;
  }

  public getPressure(): number {
    return this.capacity > 0 ? this.queue.length / this.capacity : 0;
  }

  public getOldestEventAge(): number {
    if (this.queue.length === 0) return 0;
    return Date.now() - this.queue[0].queuedAt;
  }

  public clear(): void {
    this.queue = [];
  }
}
