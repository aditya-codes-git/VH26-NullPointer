import { describe, it, expect, beforeEach } from 'vitest';
import { AdaptiveDecisionEngine } from '../src/decision-engine/adaptiveEngine.js';
import { QueueManager } from '../src/queues/queueManager.js';
import { DEFAULT_CONFIG } from '../src/config/pipelineConfig.js';
import { PipelineEvent } from '../src/models/event.js';

describe('AdaptiveDecisionEngine', () => {
  let queueManager: QueueManager;
  let engine: AdaptiveDecisionEngine;

  beforeEach(() => {
    queueManager = new QueueManager(DEFAULT_CONFIG);
    engine = new AdaptiveDecisionEngine(DEFAULT_CONFIG, queueManager);
  });

  it('selects STREAM mode when load is normal and queue is empty', () => {
    const result = engine.evaluate(16.7, 16.7);
    expect(result.strategy).toBe('STREAM');
    expect(result.state).toBe('NORMAL');
  });

  it('selects BATCH mode when incoming rate significantly outpaces processing rate', () => {
    // Fill queue past batch threshold (25% of 3000 = 750 items)
    for (let i = 0; i < 800; i++) {
      queueManager.lowQueue.enqueue({
        id: `ev_${i}`,
        type: 'CLICK',
        priority: 'LOW',
        payload: {},
        createdAt: Date.now(),
        queuedAt: Date.now(),
        status: 'QUEUED',
      });
    }

    const result = engine.evaluate(300, 100);
    expect(result.strategy).toBe('BATCH');
    expect(result.state).toBe('PRESSURED');
  });

  it('selects DEFER mode when queue pressure reaches defer threshold', () => {
    // Fill queue past defer threshold (55% of 3000 = 1650 items)
    for (let i = 0; i < 1700; i++) {
      queueManager.lowQueue.enqueue({
        id: `ev_${i}`,
        type: 'LOG',
        priority: 'LOW',
        payload: {},
        createdAt: Date.now(),
        queuedAt: Date.now(),
        status: 'QUEUED',
      });
    }

    const result = engine.evaluate(350, 80);
    expect(result.strategy).toBe('DEFER');
    expect(result.state).toBe('OVERLOADED');
  });

  it('selects SHED mode when queue pressure exceeds safety threshold', () => {
    // Fill queue past shed threshold (80% of 3000 = 2400 items)
    for (let i = 0; i < 2500; i++) {
      queueManager.lowQueue.enqueue({
        id: `ev_${i}`,
        type: 'CLICK',
        priority: 'LOW',
        payload: {},
        createdAt: Date.now(),
        queuedAt: Date.now(),
        status: 'QUEUED',
      });
    }

    const result = engine.evaluate(400, 50);
    expect(result.strategy).toBe('SHED');
    expect(result.state).toBe('EXTREME');
  });
});
