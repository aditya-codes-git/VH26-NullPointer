import { io, Socket } from 'socket.io-client';
import { TelemetrySnapshot, BenchmarkComparison } from '../types/telemetry.js';

let socket: Socket | null = null;

export function initSocket(onTelemetry: (data: TelemetrySnapshot) => void): () => void {
  socket = io('http://localhost:4000');

  socket.on('telemetry', (data: TelemetrySnapshot) => {
    onTelemetry(data);
  });

  return () => {
    socket?.disconnect();
  };
}

export async function triggerStart(): Promise<any> {
  const res = await fetch('http://localhost:4000/api/simulator/start', { method: 'POST' });
  return res.json();
}

export async function triggerSpike(): Promise<any> {
  const res = await fetch('http://localhost:4000/api/simulator/spike', { method: 'POST' });
  return res.json();
}

export async function triggerNormal(): Promise<any> {
  const res = await fetch('http://localhost:4000/api/simulator/normal', { method: 'POST' });
  return res.json();
}

export async function triggerStop(): Promise<any> {
  const res = await fetch('http://localhost:4000/api/simulator/stop', { method: 'POST' });
  return res.json();
}

export async function triggerReset(): Promise<any> {
  const res = await fetch('http://localhost:4000/api/simulator/reset', { method: 'POST' });
  return res.json();
}

export async function runBenchmark(eventCount = 1500): Promise<BenchmarkComparison> {
  const res = await fetch('http://localhost:4000/api/benchmark/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventCount }),
  });
  return res.json();
}
