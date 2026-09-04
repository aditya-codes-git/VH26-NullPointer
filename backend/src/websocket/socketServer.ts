import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { MetricsCollector } from '../metrics/metricsCollector.js';
import { WorkerPool } from '../processing/workerPool.js';

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

  io.on('connection', (socket) => {
    // Send immediate initial state
    const snapshot = metricsCollector.getSnapshot();
    socket.emit('telemetry', snapshot);
  });

  // Broadcast telemetry snapshot every 500ms
  setInterval(() => {
    const snapshot = metricsCollector.getSnapshot();
    // Synchronize worker pool strategy with adaptive engine strategy
    workerPool.setStrategy(snapshot.activeStrategy);
    io.emit('telemetry', snapshot);
  }, 500);

  return io;
}
