import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { MetricsCollector } from '../metrics/metricsCollector.js';
import { WorkerPool } from '../processing/workerPool.js';

let globalIo: SocketIOServer | null = null;
let globalMetricsCollector: MetricsCollector | null = null;
let globalWorkerPool: WorkerPool | null = null;

let lastTelemetryLogTime = 0;

export function broadcastTelemetryNow(): void {
  if (globalIo && globalMetricsCollector && globalWorkerPool) {
    const snapshot = globalMetricsCollector.getSnapshot();
    globalWorkerPool.setStrategy(snapshot.activeStrategy);
    globalIo.emit('telemetry', snapshot);

    const now = Date.now();
    if (snapshot.workload && (now - lastTelemetryLogTime >= 1000)) {
      const wl = snapshot.workload;
      const q = snapshot.queues;
      const totalWindow = wl.windowCounts?.total || 0;
      const totalRun = wl.runEventCounts?.totalRunReceived || 0;

      if (totalWindow > 0 || totalRun > 0 || wl.isRunActive) {
        lastTelemetryLogTime = now;
        console.log(`\n=================== [WORKLOAD TELEMETRY] ===================`);
        console.log(`Scenario: ${wl.activeWorkloadScenario}`);
        console.log(`Configured Distribution: CRITICAL ${wl.configuredDistribution.CRITICAL}% / HIGH ${wl.configuredDistribution.HIGH}% / LOW ${wl.configuredDistribution.LOW}%`);
        console.log(`Last 1 second:`);
        console.log(`  CRITICAL: ${wl.windowCounts.critical} events (${wl.windowPercentages.critical}%)`);
        console.log(`  HIGH:     ${wl.windowCounts.high} events (${wl.windowPercentages.high}%)`);
        console.log(`  LOW:      ${wl.windowCounts.low} events (${wl.windowPercentages.low}%)`);
        console.log(`Cumulative Run (${totalRun} total events):`);
        console.log(`  CRITICAL: ${wl.runEventCounts.criticalReceived} events (${wl.actualDistribution.CRITICAL}%)`);
        console.log(`  HIGH:     ${wl.runEventCounts.highReceived} events (${wl.actualDistribution.HIGH}%)`);
        console.log(`  LOW:      ${wl.runEventCounts.lowReceived} events (${wl.actualDistribution.LOW}%)`);
        console.log(`Processed / sec:`);
        console.log(`  CRITICAL: ${wl.processedPerSec.critical}/s | HIGH: ${wl.processedPerSec.high}/s | LOW: ${wl.processedPerSec.low}/s | Total: ${wl.processedPerSec.total}/s`);
        console.log(`Current Queue Depth:`);
        console.log(`  CRITICAL: ${q.critical.size} / ${q.critical.capacity} (${(q.critical.pressure * 100).toFixed(1)}%)`);
        console.log(`  HIGH:     ${q.high.size} / ${q.high.capacity} (${(q.high.pressure * 100).toFixed(1)}%)`);
        console.log(`  LOW:      ${q.low.size} / ${q.low.capacity} (${(q.low.pressure * 100).toFixed(1)}%)`);
        console.log(`============================================================\n`);
      }
    }
  }
}

export function setupSocketServer(
  httpServer: HttpServer,
  metricsCollector: MetricsCollector,
  workerPool: WorkerPool
): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  globalIo = io;
  globalMetricsCollector = metricsCollector;
  globalWorkerPool = workerPool;

  io.on('connection', (socket) => {
    // Send immediate initial state
    const snapshot = metricsCollector.getSnapshot();
    socket.emit('telemetry', snapshot);
  });

  // Broadcast telemetry snapshot every 500ms
  setInterval(() => {
    broadcastTelemetryNow();
  }, 500);

  return io;
}
