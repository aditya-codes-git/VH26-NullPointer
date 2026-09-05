import { io, Socket } from 'socket.io-client';
import { TelemetrySnapshot, BenchmarkComparison } from '../types/telemetry.js';

// Base backend URL: Uses Vite environment variable VITE_API_URL or defaults to localhost:4000
export const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/+$/, '');

let socket: Socket | null = null;

export function initSocket(
  onTelemetry: (data: TelemetrySnapshot) => void,
  onConnectionChange?: (connected: boolean) => void
): () => void {
  socket = io(API_BASE_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    onConnectionChange?.(true);
  });

  socket.on('disconnect', () => {
    onConnectionChange?.(false);
  });

  socket.on('connect_error', () => {
    onConnectionChange?.(false);
  });

  socket.on('telemetry', (data: TelemetrySnapshot) => {
    onTelemetry(data);
  });

  if (socket.connected) {
    onConnectionChange?.(true);
  }

  return () => {
    socket?.disconnect();
    socket = null;
  };
}

export async function triggerStart(): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/simulator/start`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to start simulator: ${res.statusText}`);
  return res.json();
}

export async function triggerRate(rate: number): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/simulator/rate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rate }),
  });
  if (!res.ok) throw new Error(`Failed to set traffic rate: ${res.statusText}`);
  return res.json();
}

export async function triggerSpike(): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/simulator/spike`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to trigger spike: ${res.statusText}`);
  return res.json();
}

export async function triggerNormal(): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/simulator/normal`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to return to normal: ${res.statusText}`);
  return res.json();
}

export async function triggerStop(): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/simulator/stop`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to stop simulator: ${res.statusText}`);
  return res.json();
}

export async function triggerReset(): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/simulator/reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to reset pipeline: ${res.statusText}`);
  return res.json();
}

export async function runBenchmark(eventCount = 1500): Promise<BenchmarkComparison> {
  const res = await fetch(`${API_BASE_URL}/api/benchmark/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventCount }),
  });
  return res.json();
}

export async function triggerSimulateFailure(
  type?: string,
  mode: 'single' | 'multi' | 'permanent' = 'single'
): Promise<{ armed: boolean; message: string; targetType: string; mode: string }> {
  const res = await fetch(`${API_BASE_URL}/api/demo/failure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, mode }),
  });
  if (!res.ok) throw new Error(`Failed to simulate failure: ${res.statusText}`);
  return res.json();
}

export async function triggerEvaluateScale(): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/demo/scale`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to evaluate worker scaling: ${res.statusText}`);
  return res.json();
}
