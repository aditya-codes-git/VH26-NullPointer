import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { MetricsCollector } from '../metrics/metricsCollector.js';
import { WorkerPool } from '../processing/workerPool.js';

let globalIo: SocketIOServer | null = null;
let globalMetricsCollector: MetricsCollector | null = null;
let globalWorkerPool: WorkerPool | null = null;

export function broadcastTelemetryNow(): void {
  if (globalIo && globalMetricsCollector && globalWorkerPool) {
    const snapshot = globalMetricsCollector.getSnapshot();
    globalWorkerPool.setStrategy(snapshot.activeStrategy);
    globalIo.emit('telemetry', snapshot);
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
