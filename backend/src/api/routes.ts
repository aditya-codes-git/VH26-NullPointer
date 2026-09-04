import { Router } from 'express';
import { EventSimulator } from '../simulator/eventSimulator.js';
import { MetricsCollector } from '../metrics/metricsCollector.js';
import { runBenchmarkComparison } from '../benchmark/naiveBaseline.js';
import { PipelineConfig } from '../config/pipelineConfig.js';

export function createApiRouter(
  simulator: EventSimulator,
  metricsCollector: MetricsCollector,
  config: PipelineConfig
): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  router.get('/metrics', (_req, res) => {
    res.json(metricsCollector.getSnapshot());
  });

  router.post('/simulator/start', (_req, res) => {
    simulator.startNormal();
    res.json({ message: 'Simulator started at normal rate (~1,000 events/min)', mode: 'NORMAL' });
  });

  router.post('/simulator/spike', (_req, res) => {
    simulator.triggerSpike();
    res.json({ message: '20x Flash-sale spike triggered (~20,000 events/min)', mode: 'SPIKE' });
  });

  router.post('/simulator/normal', (_req, res) => {
    simulator.startNormal();
    res.json({ message: 'Returned to normal load (~1,000 events/min)', mode: 'NORMAL' });
  });

  router.post('/simulator/stop', (_req, res) => {
    simulator.stop();
    res.json({ message: 'Simulator stopped', mode: 'STOPPED' });
  });

  router.post('/simulator/reset', (_req, res) => {
    simulator.stop();
    metricsCollector.reset();
    res.json({ message: 'Pipeline and counters reset', status: 'IDLE' });
  });

  router.post('/benchmark/run', async (req, res) => {
    try {
      const eventCount = Number(req.body?.eventCount) || 1500;
      const comparison = await runBenchmarkComparison(eventCount);
      res.json(comparison);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Benchmark execution failed' });
    }
  });

  router.get('/config', (_req, res) => {
    res.json(config);
  });

  return router;
}
