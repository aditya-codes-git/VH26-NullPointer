import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import {
  initSocket,
  triggerStart,
  triggerRate,
  triggerNormal,
  triggerStop,
  triggerReset,
  API_BASE_URL,
} from './services/socketClient.js';
import { TelemetrySnapshot } from './types/telemetry.js';
import { FaultToleranceSection } from './components/FaultToleranceSection.js';
import { DynamicWorkerScalingSection } from './components/DynamicWorkerScalingSection.js';
import { DuplicateProtectionSection } from './components/DuplicateProtectionSection.js';
import { DecisionEngineSection } from './components/DecisionEngineSection.js';
import { WorkloadProfileSection } from './components/WorkloadProfileSection.js';
import { supabase, getCurrentUser } from './services/supabaseClient.js';
import { User } from '@supabase/supabase-js';
import { AuthModal } from './components/AuthModal.js';
import {
  EventHistoryView,
  RunHistoryView,
  HistoricalAnalyticsView,
  AccountView,
} from './components/HistoricalViews.js';

export type AppRoute =
  | '/pipeline'
  | '/history/events'
  | '/history/runs'
  | '/analytics'
  | '/modules/fault-tolerance'
  | '/modules/worker-scaling'
  | '/modules/duplicate-shield'
  | '/modules/decision-engine'
  | '/account';

const VALID_ROUTES: AppRoute[] = [
  '/pipeline',
  '/history/events',
  '/history/runs',
  '/analytics',
  '/modules/fault-tolerance',
  '/modules/worker-scaling',
  '/modules/duplicate-shield',
  '/modules/decision-engine',
  '/account',
];

const getInitialRoute = (): AppRoute => {
  const path = window.location.pathname;
  const hash = window.location.hash.replace('#', '');
  const candidate = (path !== '/' && path ? path : hash) as AppRoute;
  return VALID_ROUTES.includes(candidate) ? candidate : '/pipeline';
};

export const App: React.FC = () => {
  // Navigation & Supabase Authentication states
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(getInitialRoute);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const navigate = (route: AppRoute) => {
    setCurrentRoute(route);
    if (window.location.pathname !== route) {
      window.history.pushState(null, '', route);
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoute(getInitialRoute());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Connection and live telemetry states
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const [isPending, setIsPending] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sliderRate, setSliderRate] = useState<number>(1000);

  // Rolling latency history buffer (last 20 snapshots from live backend)
  const [latencyData, setLatencyData] = useState<Array<{ time: string; critical: number; nonCritical: number }>>([
    { time: '--:--', critical: 15, nonCritical: 18 },
  ]);

  // Connect to backend Socket.IO telemetry stream
  useEffect(() => {
    const cleanup = initSocket(
      (data: TelemetrySnapshot) => {
        setTelemetry(data);

        // Record real latency history point
        const date = new Date(data.timestamp);
        const timeStr = date.toTimeString().split(' ')[0];
        setLatencyData((prev) => {
          const point = {
            time: timeStr,
            critical: data.criticalLatencyAvg > 0 ? data.criticalLatencyAvg : 15,
            nonCritical: data.nonCriticalLatencyAvg > 0 ? data.nonCriticalLatencyAvg : 18,
          };
          if (prev.length === 1 && prev[0].time === '--:--') {
            return [point];
          }
          const updated = [...prev, point];
          return updated.length > 20 ? updated.slice(-20) : updated;
        });
      },
      (connected: boolean) => {
        setIsConnected(connected);
        if (connected) {
          setErrorMessage(null);
        }
      }
    );

    return cleanup;
  }, []);

  // Supabase Auth State Listener
  useEffect(() => {
    if (supabase) {
      getCurrentUser().then((u) => setUser(u));
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user || null);
      });
      return () => {
        subscription.unsubscribe();
      };
    }
  }, []);

  const handleSignOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
      setUser(null);
      navigate('/pipeline');
    }
  };

  // Simulation API Trigger Handlers
  const handleApplyRate = async (rateToApply?: number) => {
    const rate = rateToApply ?? sliderRate;
    try {
      setIsPending(true);
      setErrorMessage(null);
      await triggerRate(rate);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to apply traffic rate');
    } finally {
      setIsPending(false);
    }
  };

  const handleStartNormal = async () => {
    try {
      setIsPending(true);
      setErrorMessage(null);
      setSliderRate(1000);
      await triggerStart();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to start simulator');
    } finally {
      setIsPending(false);
    }
  };

  const handleReturnToNormal = async () => {
    try {
      setIsPending(true);
      setErrorMessage(null);
      setSliderRate(1000);
      await triggerNormal();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to return to normal');
    } finally {
      setIsPending(false);
    }
  };

  const handleStop = async () => {
    try {
      setIsPending(true);
      setErrorMessage(null);
      await triggerStop();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to stop simulator');
    } finally {
      setIsPending(false);
    }
  };

  const handleReset = async () => {
    try {
      setIsPending(true);
      setErrorMessage(null);
      setSliderRate(1000);
      await triggerReset();
      setLatencyData([{ time: '--:--', critical: 15, nonCritical: 18 }]);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reset pipeline');
    } finally {
      setIsPending(false);
    }
  };

  // Derive structured values from real backend telemetry
  const simulatorMode = telemetry?.simulatorMode ?? 'STOPPED';
  const systemState = telemetry?.adaptive?.systemState ?? telemetry?.systemPressureState ?? 'NORMAL';
  const incomingRate = telemetry ? telemetry.incomingRatePerMin.toLocaleString() : '0';
  const throughputRate = telemetry ? telemetry.throughputPerMin.toLocaleString() : '0';

  // Per-Tier Strategies from backend
  const criticalStrategy = telemetry?.strategies?.critical ?? telemetry?.criticalStrategy ?? 'STREAM';
  const highStrategy = telemetry?.strategies?.high ?? telemetry?.highStrategy ?? 'STREAM';
  const lowStrategy = telemetry?.strategies?.low ?? telemetry?.lowStrategy ?? telemetry?.activeStrategy ?? 'STREAM';

  // Three Independent Queues from backend
  const criticalQueue = telemetry?.queues?.critical ?? {
    name: 'CRITICAL',
    size: telemetry?.criticalQueueSize ?? 0,
    capacity: telemetry?.criticalQueueCapacity ?? 2000,
    pressure: telemetry?.criticalQueuePressure ?? 0,
    pressurePercent: Number(((telemetry?.criticalQueuePressure ?? 0) * 100).toFixed(1)),
    processedCount: telemetry?.criticalProcessed ?? 0,
    queuedCount: telemetry?.criticalQueueSize ?? 0,
    strategy: criticalStrategy,
    status: 'PROTECTED',
  };

  const highQueue = telemetry?.queues?.high ?? {
    name: 'HIGH',
    size: telemetry?.highQueueSize ?? 0,
    capacity: telemetry?.highQueueCapacity ?? 2000,
    pressure: telemetry?.highQueuePressure ?? 0,
    pressurePercent: Number(((telemetry?.highQueuePressure ?? 0) * 100).toFixed(1)),
    processedCount: telemetry?.highProcessed ?? 0,
    queuedCount: telemetry?.highQueueSize ?? 0,
    strategy: highStrategy,
    status: 'ACTIVE',
  };

  const lowQueue = telemetry?.queues?.low ?? {
    name: 'LOW',
    size: telemetry?.lowQueueSize ?? 0,
    capacity: telemetry?.lowQueueCapacity ?? 3000,
    pressure: telemetry?.lowQueuePressure ?? 0,
    pressurePercent: Number(((telemetry?.lowQueuePressure ?? 0) * 100).toFixed(1)),
    processedCount: telemetry?.lowProcessed ?? 0,
    queuedCount: telemetry?.lowQueueSize ?? 0,
    strategy: lowStrategy,
    status: 'ADAPTIVE',
    accepted: telemetry?.lowAccepted ?? 0,
    batched: telemetry?.lowBatched ?? 0,
    deferredCycles: telemetry?.lowDeferredCycles ?? 0,
    shed: telemetry?.lowShed ?? telemetry?.shedCount ?? 0,
  };

  // Shedding Telemetry from backend
  const shedding = telemetry?.shedding ?? {
    total: telemetry?.shedCount ?? 0,
    click: telemetry?.clickShedCount ?? 0,
    log: telemetry?.logShedCount ?? 0,
    critical: telemetry?.criticalShed ?? 0,
    lastShedEvent: telemetry?.lastShedEvent ?? null,
    lastShedReason: telemetry?.lastShedReason ?? 'No shedding recorded',
  };

  // Batching Telemetry from backend
  const batching = telemetry?.batching ?? {
    currentBatchSize: telemetry?.currentBatchSize ?? 10,
    batchSizeReason: telemetry?.batchSizeReason ?? 'Nominal low-priority queue depth: minimum batch size active.',
    history: telemetry?.batchSizeHistory ?? [],
  };

  // Adaptive Telemetry from backend
  const adaptive = telemetry?.adaptive ?? {
    systemState,
    strategy: lowStrategy,
    criticalStrategy,
    highStrategy,
    lowStrategy,
    reason: telemetry?.adaptiveReason ?? 'Nominal load: direct individual stream processing active across all priority tiers.',
    queuePressure: lowQueue.pressurePercent,
    backlogGrowth: telemetry?.backlogGrowthRate ?? 0,
    workerLoad: telemetry?.workerLoadPercent ?? 0,
    sheddingStatus: (lowStrategy === 'SHED' ? 'ENABLED' : 'DISABLED') as 'ENABLED' | 'DISABLED',
  };

  // Critical Protection Invariants
  const criticalLost = telemetry?.criticalLost ?? 0;
  const criticalShed = shedding.critical;
  const safetyViolations = telemetry?.safetyViolations ?? 0;

  // Accounting Reconciliation
  const totalReceived = telemetry?.totalReceived ?? 0;
  const totalProcessed = telemetry?.totalProcessed ?? 0;
  const totalQueued = criticalQueue.size + highQueue.size + lowQueue.size;
  const totalShed = shedding.total;
  const criticalInFlight = telemetry?.criticalInFlight ?? 0;
  const accountedTotal = totalProcessed + totalQueued + totalShed + criticalInFlight;
  const accountingDifference = totalReceived - accountedTotal;
  const isReconciled = totalReceived === 0 || Math.abs(accountingDifference) <= criticalInFlight;

  // Batch Size vs Queue Pressure Graph Data (Real backend observations)
  const batchChartData = useMemo(() => {
    const rawHistory = batching.history || [];
    if (rawHistory.length === 0) {
      return [
        {
          pressure: lowQueue.pressurePercent,
          batchSize: batching.currentBatchSize,
          time: 'Now',
          strategy: lowStrategy,
          state: systemState,
        },
      ];
    }
    return [...rawHistory]
      .map((obs) => ({
        pressure: obs.lowQueuePressure,
        batchSize: obs.batchSize,
        time: new Date(obs.timestamp).toTimeString().split(' ')[0],
        strategy: obs.strategy,
        state: obs.systemPressureState,
      }))
      .sort((a, b) => a.pressure - b.pressure);
  }, [batching.history, lowQueue.pressurePercent, batching.currentBatchSize, lowStrategy, systemState]);

  // Activity & Shedding Logs
  const activityLogs = telemetry?.recentActivityLogs ?? [];

  return (
    <div className="bg-[#ffffff] text-[#131b2e] min-h-screen flex flex-col md:flex-row antialiased">
      {/* -------------------------------------------------- */}
      {/* Side Navigation */}
      {/* -------------------------------------------------- */}
      <aside className="hidden md:flex flex-col h-screen w-[260px] bg-[#ffffff] border-r border-[#e2e8f0] sticky top-0 p-4 gap-2 shrink-0 select-none">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold text-base shadow-sm">
            AF
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#131b2e] leading-tight">AdaptiFlow</h2>
            <p className="text-[11px] text-[#64748b]">Adaptive Event Pipeline</p>
          </div>
        </div>

        {/* User Account Capsule */}
        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs mb-2">
          {user ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-emerald-600">Authenticated</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
              <div className="font-semibold text-slate-800 truncate text-[11px]" title={user.email}>
                {user.email}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-medium">Local Mode</span>
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-bold"
              >
                Sign In
              </button>
            </div>
          )}
        </div>

        {/* Group 1: VIEWS */}
        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 px-2 mt-1 mb-1">
          Views
        </div>
        <nav className="flex flex-col gap-1 mb-3">
          <button
            onClick={() => navigate('/pipeline')}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg font-semibold text-xs transition-colors text-left cursor-pointer ${
              currentRoute === '/pipeline'
                ? 'bg-[#eaedff] text-[#004ac6] shadow-2xs font-bold'
                : 'text-[#64748b] hover:bg-[#f8fafc] hover:text-[#131b2e]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">dashboard</span>
            <span>Live Pipeline</span>
          </button>

          <button
            onClick={() => navigate('/history/events')}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg font-semibold text-xs transition-colors text-left cursor-pointer ${
              currentRoute === '/history/events'
                ? 'bg-[#eaedff] text-[#004ac6] shadow-2xs font-bold'
                : 'text-[#64748b] hover:bg-[#f8fafc] hover:text-[#131b2e]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">receipt_long</span>
            <span>Event History</span>
          </button>

          <button
            onClick={() => navigate('/history/runs')}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg font-semibold text-xs transition-colors text-left cursor-pointer ${
              currentRoute === '/history/runs'
                ? 'bg-[#eaedff] text-[#004ac6] shadow-2xs font-bold'
                : 'text-[#64748b] hover:bg-[#f8fafc] hover:text-[#131b2e]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">history</span>
            <span>Run History</span>
          </button>

          <button
            onClick={() => navigate('/analytics')}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg font-semibold text-xs transition-colors text-left cursor-pointer ${
              currentRoute === '/analytics'
                ? 'bg-[#eaedff] text-[#004ac6] shadow-2xs font-bold'
                : 'text-[#64748b] hover:bg-[#f8fafc] hover:text-[#131b2e]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">insights</span>
            <span>Analytics</span>
          </button>
        </nav>

        {/* Group 2: PIPELINE MODULES */}
        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 px-2 mt-1 mb-1">
          Pipeline Modules
        </div>
        <nav className="flex flex-col gap-1 mb-3">
          <button
            onClick={() => navigate('/modules/fault-tolerance')}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg font-semibold text-xs transition-colors text-left cursor-pointer ${
              currentRoute === '/modules/fault-tolerance'
                ? 'bg-[#eaedff] text-[#004ac6] shadow-2xs font-bold'
                : 'text-[#64748b] hover:bg-[#f8fafc] hover:text-[#131b2e]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px] text-rose-500">health_and_safety</span>
            <span>Fault Tolerance</span>
          </button>

          <button
            onClick={() => navigate('/modules/worker-scaling')}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg font-semibold text-xs transition-colors text-left cursor-pointer ${
              currentRoute === '/modules/worker-scaling'
                ? 'bg-[#eaedff] text-[#004ac6] shadow-2xs font-bold'
                : 'text-[#64748b] hover:bg-[#f8fafc] hover:text-[#131b2e]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px] text-indigo-500">hub</span>
            <span>Worker Scaling</span>
          </button>

          <button
            onClick={() => navigate('/modules/duplicate-shield')}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg font-semibold text-xs transition-colors text-left cursor-pointer ${
              currentRoute === '/modules/duplicate-shield'
                ? 'bg-[#eaedff] text-[#004ac6] shadow-2xs font-bold'
                : 'text-[#64748b] hover:bg-[#f8fafc] hover:text-[#131b2e]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px] text-emerald-500">shield</span>
            <span>Duplicate Shield</span>
          </button>

          <button
            onClick={() => navigate('/modules/decision-engine')}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg font-semibold text-xs transition-colors text-left cursor-pointer ${
              currentRoute === '/modules/decision-engine'
                ? 'bg-[#eaedff] text-[#004ac6] shadow-2xs font-bold'
                : 'text-[#64748b] hover:bg-[#f8fafc] hover:text-[#131b2e]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px] text-purple-500">psychology</span>
            <span>Decision Engine</span>
          </button>
        </nav>

        {/* Group 3: ACCOUNT */}
        <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 px-2 mt-1 mb-1">
          Account
        </div>
        <nav className="flex flex-col gap-1 mb-2">
          <button
            onClick={() => navigate('/account')}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg font-semibold text-xs transition-colors text-left cursor-pointer ${
              currentRoute === '/account'
                ? 'bg-[#eaedff] text-[#004ac6] shadow-2xs font-bold'
                : 'text-[#64748b] hover:bg-[#f8fafc] hover:text-[#131b2e]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">account_circle</span>
            <span>Account</span>
          </button>
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-[#e2e8f0] pt-3">
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px] font-mono mb-1">
            <div className="text-slate-500">Pipeline Engine</div>
            <div className="font-bold text-slate-800">v2.5-supabase</div>
          </div>
          {user ? (
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 px-3 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">logout</span>
              <span>Sign Out</span>
            </button>
          ) : (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-semibold transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">login</span>
              <span>Sign In</span>
            </button>
          )}
        </div>
      </aside>

      {/* -------------------------------------------------- */}
      {/* Main Content Area */}
      {/* -------------------------------------------------- */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#faf8ff]">
        {/* Top App Bar */}
        <header className="flex justify-between items-center px-8 py-3 w-full sticky top-0 z-40 bg-white border-b border-[#e2e8f0] shadow-2xs">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-[#004ac6] tracking-tight">AdaptiFlow Event Pipeline</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs font-mono text-slate-500 hidden sm:block">
              Kafka: <span className="font-bold text-emerald-600">CONNECTED</span>
            </div>
            {isConnected ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs font-bold text-emerald-800 font-mono">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                TELEMETRY LIVE
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 border border-rose-200 rounded-full text-xs font-bold text-rose-800 font-mono">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                OFFLINE
              </span>
            )}
            {user ? (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                <span className="text-xs font-mono text-slate-700 font-semibold hidden md:inline">
                  User: <strong className="text-blue-700">{user.email}</strong>
                </span>
                <button
                  onClick={handleSignOut}
                  className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-1 hover:bg-rose-50 rounded transition-colors"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
              >
                <span className="material-symbols-outlined text-sm">login</span>
                <span>Sign In</span>
              </button>
            )}
          </div>
        </header>

        {/* Main Canvas */}
        <main className="flex-1 p-6 md:p-8 flex flex-col gap-6 max-w-7xl w-full mx-auto">
          {currentRoute === '/history/events' && (
            <EventHistoryView
              user={user}
              selectedRunId={selectedRunId}
              onClearSelectedRun={() => setSelectedRunId(null)}
              onOpenSignIn={() => setIsAuthModalOpen(true)}
            />
          )}

          {currentRoute === '/history/runs' && (
            <RunHistoryView
              user={user}
              onSelectRun={(runId) => {
                setSelectedRunId(runId);
                navigate('/history/events');
              }}
            />
          )}

          {currentRoute === '/analytics' && (
            <HistoricalAnalyticsView user={user} />
          )}

          {currentRoute === '/account' && (
            <AccountView
              user={user}
              onSignOut={handleSignOut}
              onOpenSignIn={() => setIsAuthModalOpen(true)}
            />
          )}

          {/* Dedicated Module Page: Fault Tolerance */}
          {currentRoute === '/modules/fault-tolerance' && (
            <div className="space-y-4 animate-fade-in">
              <div className="bg-white p-5 rounded-xl border border-[#e2e8f0] shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center font-bold">
                    <span className="material-symbols-outlined text-[24px]">health_and_safety</span>
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Fault Tolerance &amp; Resilience Module</h2>
                    <p className="text-xs text-slate-500">
                      Per-event exponential backoff retries, dead-letter queue isolation, and transaction idempotency protection.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-full text-xs font-mono font-bold">
                    Retries: {telemetry?.faultTolerance?.retryAttempts || 0}
                  </span>
                  <button
                    onClick={() => navigate('/pipeline')}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                    <span>Live Pipeline</span>
                  </button>
                </div>
              </div>
              <FaultToleranceSection faultTolerance={telemetry?.faultTolerance} disabled={isPending} />
            </div>
          )}

          {/* Dedicated Module Page: Dynamic Worker Scaling */}
          {currentRoute === '/modules/worker-scaling' && (
            <div className="space-y-4 animate-fade-in">
              <div className="bg-white p-5 rounded-xl border border-[#e2e8f0] shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center font-bold">
                    <span className="material-symbols-outlined text-[24px]">hub</span>
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Dynamic Worker Pool Scaling</h2>
                    <p className="text-xs text-slate-500">
                      Autonomous worker elasticity (2 to 8 workers) responding to queue backpressure and priority imbalance.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-xs font-mono font-bold">
                    Workers: {telemetry?.workerScaling?.currentWorkers ?? 4} / {telemetry?.workerScaling?.maxWorkers ?? 8}
                  </span>
                  <button
                    onClick={() => navigate('/pipeline')}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                    <span>Live Pipeline</span>
                  </button>
                </div>
              </div>
              <DynamicWorkerScalingSection workerScaling={telemetry?.workerScaling} disabled={isPending} />
            </div>
          )}

          {/* Dedicated Module Page: Duplicate Shield */}
          {currentRoute === '/modules/duplicate-shield' && (
            <div className="space-y-4 animate-fade-in">
              <div className="bg-white p-5 rounded-xl border border-[#e2e8f0] shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center font-bold">
                    <span className="material-symbols-outlined text-[24px]">shield</span>
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Duplicate Shield &amp; Admission Defense</h2>
                    <p className="text-xs text-slate-500">
                      In-memory 60s TTL LRU deduplication cache safeguarding the ingestion layer against replay attacks.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-mono font-bold">
                    Blocked: {telemetry?.duplicateDetection?.duplicatesPrevented ?? 0}
                  </span>
                  <button
                    onClick={() => navigate('/pipeline')}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                    <span>Live Pipeline</span>
                  </button>
                </div>
              </div>
              <DuplicateProtectionSection duplicateDetection={telemetry?.duplicateDetection} disabled={isPending} />
            </div>
          )}

          {/* Dedicated Module Page: Decision Engine */}
          {currentRoute === '/modules/decision-engine' && (
            <div className="space-y-4 animate-fade-in">
              <div className="bg-white p-5 rounded-xl border border-[#e2e8f0] shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 text-purple-600 flex items-center justify-center font-bold">
                    <span className="material-symbols-outlined text-[24px]">psychology</span>
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Formal Multi-Variable Decision Engine</h2>
                    <p className="text-xs text-slate-500">
                      Objective scoring function evaluating CPU load, queue pressure, worker capacity, and degradation cost.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-xs font-mono font-bold">
                    Score: {telemetry?.decisionFunction?.currentScore ?? 0}/100
                  </span>
                  <button
                    onClick={() => navigate('/pipeline')}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                    <span>Live Pipeline</span>
                  </button>
                </div>
              </div>
              <DecisionEngineSection decisionFunction={telemetry?.decisionFunction} disabled={isPending} />
            </div>
          )}

          {/* Live Pipeline View (Overview Only) */}
          {currentRoute === '/pipeline' && (
            <>
          {/* Alerts */}
          {!isConnected && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-xs flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-amber-600">warning</span>
                <span>Connecting to backend at <code className="font-mono font-bold">{API_BASE_URL}</code>... Showing last known telemetry.</span>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-lg text-xs flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-rose-600">error</span>
                <span>{errorMessage}</span>
              </div>
              <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700 font-bold">
                Dismiss
              </button>
            </div>
          )}

          {/* Section 1: Header / Status & Per-Tier Strategies Visible Simultaneously */}
          <section className="bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-xs flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-2xl font-bold text-[#131b2e] tracking-tight">
                  Pipeline Health &amp; Strategy Monitor
                </h2>
              </div>
              <p className="text-xs text-[#64748b]">
                Real-time per-tier strategy execution, dynamic micro-batching, and zero-loss critical protection
              </p>
            </div>

            {/* Per-Tier Processing Strategies Visible Simultaneously */}
            <div className="flex flex-wrap gap-2 items-center">
              {/* System State Badge */}
              <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 flex items-center gap-1.5">
                <span className="text-slate-500">STATE:</span>
                <span
                  className={`font-bold ${
                    systemState === 'NORMAL'
                      ? 'text-emerald-700'
                      : systemState === 'PRESSURED'
                      ? 'text-blue-700'
                      : systemState === 'OVERLOADED'
                      ? 'text-amber-700'
                      : 'text-rose-700'
                  }`}
                >
                  {systemState}
                </span>
              </div>

              {/* CRITICAL Strategy Pill */}
              <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-300 rounded-lg text-xs font-mono flex items-center gap-1.5 shadow-2xs">
                <span className="font-bold text-emerald-900">CRITICAL:</span>
                <span className="font-bold text-emerald-700">{criticalStrategy}</span>
                <span className="text-[10px] uppercase px-1.5 py-0.2 bg-emerald-200 text-emerald-800 rounded font-extrabold">
                  PROTECTED
                </span>
              </div>

              {/* HIGH Strategy Pill */}
              <div className="px-3 py-1.5 bg-blue-50 border border-blue-300 rounded-lg text-xs font-mono flex items-center gap-1.5 shadow-2xs">
                <span className="font-bold text-blue-900">HIGH:</span>
                <span className="font-bold text-blue-700">{highStrategy}</span>
                <span className="text-[10px] uppercase px-1.5 py-0.2 bg-blue-200 text-blue-800 rounded font-extrabold">
                  ACTIVE
                </span>
              </div>

              {/* LOW Strategy Pill */}
              <div
                className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 shadow-2xs border ${
                  lowStrategy === 'STREAM'
                    ? 'bg-purple-50 border-purple-300 text-purple-900'
                    : lowStrategy === 'BATCH'
                    ? 'bg-blue-50 border-blue-400 text-blue-900'
                    : lowStrategy === 'DEFER'
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-rose-50 border-rose-300 text-rose-900'
                }`}
              >
                <span className="font-bold">LOW:</span>
                <span className="font-extrabold">{lowStrategy}</span>
                <span className="text-[10px] uppercase px-1.5 py-0.2 bg-slate-200 text-slate-800 rounded font-extrabold">
                  ADAPTIVE
                </span>
              </div>
            </div>
          </section>

          {/* Section 2: Traffic Overview Metrics */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-xs flex flex-col justify-between">
              <div className="flex justify-between items-center text-[#64748b]">
                <span className="text-xs font-semibold uppercase tracking-wider font-mono">Incoming Ingestion</span>
                <span className="material-symbols-outlined text-[20px]">input</span>
              </div>
              <div className="text-2xl font-bold text-[#131b2e] font-mono mt-3">
                {incomingRate} <span className="text-xs font-normal text-[#64748b] font-sans">Events/min</span>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-xs flex flex-col justify-between">
              <div className="flex justify-between items-center text-[#64748b]">
                <span className="text-xs font-semibold uppercase tracking-wider font-mono">Worker Throughput</span>
                <span className="material-symbols-outlined text-[20px]">speed</span>
              </div>
              <div className="text-2xl font-bold text-blue-600 font-mono mt-3">
                {throughputRate} <span className="text-xs font-normal text-[#64748b] font-sans">Events/min</span>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-xs flex flex-col justify-between">
              <div className="flex justify-between items-center text-[#64748b]">
                <span className="text-xs font-semibold uppercase tracking-wider font-mono">Low Queue Pressure</span>
                <span className="material-symbols-outlined text-[20px]">analytics</span>
              </div>
              <div className="text-2xl font-bold text-purple-700 font-mono mt-3">
                {lowQueue.pressurePercent}% <span className="text-xs font-normal text-[#64748b] font-sans">Capacity Used</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-3">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    lowQueue.pressurePercent >= 80
                      ? 'bg-rose-500'
                      : lowQueue.pressurePercent >= 55
                      ? 'bg-amber-500'
                      : lowQueue.pressurePercent >= 25
                      ? 'bg-blue-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(2, lowQueue.pressurePercent))}%` }}
                />
              </div>
            </div>
          </section>

          {/* Section 2.5: Workload Profile Selector & Configured vs Actual Control */}
          <WorkloadProfileSection
            telemetry={telemetry}
            onStartTraffic={() => handleApplyRate(sliderRate)}
            onStopTraffic={handleStop}
          />

          {/* Section 3: Interactive Traffic Rate Slider Controls */}
          <section className="bg-slate-50 p-6 rounded-xl border border-[#e2e8f0] shadow-xs">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[#131b2e] uppercase font-mono tracking-wider">
                  Simulation Controls
                </h3>
                {simulatorMode !== 'STOPPED' && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-100 text-emerald-800">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    LIVE ({incomingRate} events/min)
                  </span>
                )}
              </div>
              {isPending && (
                <span className="text-xs font-mono text-blue-600 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                  Applying change...
                </span>
              )}
            </div>

            {/* Interactive Traffic Rate Slider Card */}
            <div className="bg-white p-5 rounded-lg border border-slate-200 mb-4 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-600 text-[20px]">speed</span>
                  <label htmlFor="traffic-rate-slider" className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">
                    Traffic Rate
                  </label>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold font-mono text-amber-600 tracking-tight">
                    {sliderRate.toLocaleString()}
                  </span>
                  <span className="text-xs font-medium text-slate-500 font-sans">events/min</span>
                </div>
              </div>

              {/* Slider Track & Thumb */}
              <div className="relative py-1">
                <input
                  id="traffic-rate-slider"
                  type="range"
                  min={1000}
                  max={50000}
                  step={1000}
                  value={sliderRate}
                  onChange={(e) => setSliderRate(Number(e.target.value))}
                  disabled={isPending}
                  className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* Simple Scale Labels */}
              <div className="grid grid-cols-5 text-[11px] font-mono pt-2">
                <button
                  type="button"
                  onClick={() => setSliderRate(1000)}
                  className="text-left group focus:outline-none cursor-pointer"
                >
                  <span className={`block font-bold transition-colors ${sliderRate <= 5000 ? 'text-blue-600 font-extrabold' : 'text-slate-600 group-hover:text-blue-600'}`}>1K</span>
                  <span className="text-[10px] text-slate-400 block tracking-tight">NORMAL</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSliderRate(10000)}
                  className="text-left group focus:outline-none cursor-pointer"
                >
                  <span className={`block font-bold transition-colors ${sliderRate > 5000 && sliderRate <= 15000 ? 'text-amber-600 font-extrabold' : 'text-slate-600 group-hover:text-amber-600'}`}>10K</span>
                  <span className="text-[10px] text-slate-400 block tracking-tight">PRESSURED</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSliderRate(20000)}
                  className="text-center group focus:outline-none cursor-pointer"
                >
                  <span className={`block font-bold transition-colors ${sliderRate > 15000 && sliderRate <= 28000 ? 'text-amber-600 font-extrabold' : 'text-slate-600 group-hover:text-amber-600'}`}>20K</span>
                  <span className="text-[10px] text-slate-400 block tracking-tight">HIGH</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSliderRate(35000)}
                  className="text-right group focus:outline-none cursor-pointer"
                >
                  <span className={`block font-bold transition-colors ${sliderRate > 28000 && sliderRate <= 42000 ? 'text-orange-600 font-extrabold' : 'text-slate-600 group-hover:text-orange-600'}`}>35K</span>
                  <span className="text-[10px] text-slate-400 block tracking-tight">OVERLOADED</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSliderRate(50000)}
                  className="text-right group focus:outline-none cursor-pointer"
                >
                  <span className={`block font-bold transition-colors ${sliderRate > 42000 ? 'text-rose-600 font-extrabold' : 'text-slate-600 group-hover:text-rose-600'}`}>50K</span>
                  <span className="text-[10px] text-slate-400 block tracking-tight">EXTREME</span>
                </button>
              </div>
            </div>

            {/* Action Buttons Row */}
            <div className="flex flex-wrap gap-3 items-center">
              <button
                onClick={() => handleApplyRate(sliderRate)}
                disabled={isPending}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                Apply Traffic Rate
              </button>

              <button
                onClick={handleStartNormal}
                disabled={isPending}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all shadow-xs disabled:opacity-50 cursor-pointer ${
                  simulatorMode === 'NORMAL' && sliderRate === 1000
                    ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Start Normal Load
              </button>

              <button
                onClick={handleReturnToNormal}
                disabled={isPending}
                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-100 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
              >
                Return to Normal
              </button>

              <div className="flex-1" />

              <button
                onClick={handleStop}
                disabled={isPending}
                className={`px-3.5 py-2 bg-white border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold hover:bg-rose-50 transition-colors shadow-xs flex items-center gap-1 disabled:opacity-50 cursor-pointer ${
                  simulatorMode === 'STOPPED' ? 'ring-2 ring-rose-200 font-bold' : ''
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">stop_circle</span> Stop
              </button>

              <button
                onClick={handleReset}
                disabled={isPending}
                className="px-3.5 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-100 transition-colors shadow-xs flex items-center gap-1 disabled:opacity-50 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">restart_alt</span> Reset
              </button>
            </div>
          </section>

          {/* Section 4: Three Independent Priority Queues (Backend Source of Truth) */}
          <section className="bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-xs">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-[22px]">view_column</span>
                <h3 className="text-sm font-bold text-[#131b2e] uppercase font-mono tracking-wider">
                  Three Independent Priority Queues
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-400">
                Independent capacity limits &amp; isolation barriers
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Queue 1: CRITICAL */}
              <div className="bg-white border-2 border-emerald-200 rounded-xl p-5 shadow-xs relative overflow-hidden flex flex-col justify-between">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <h4 className="text-sm font-bold font-mono text-emerald-900">CRITICAL QUEUE</h4>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">Orders &amp; Payments</div>
                  </div>
                  <div className="px-2.5 py-1 bg-emerald-100 text-emerald-900 rounded-full text-[10px] font-extrabold uppercase font-mono tracking-wider border border-emerald-300">
                    PROTECTED
                  </div>
                </div>

                <div className="my-3 space-y-2 font-mono">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-500">Queue Depth:</span>
                    <span className="text-2xl font-extrabold text-emerald-800">
                      {criticalQueue.size} <span className="text-xs font-normal text-slate-400">/ {criticalQueue.capacity}</span>
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Pressure:</span>
                    <span className="font-bold text-emerald-700">{criticalQueue.pressurePercent}%</span>
                  </div>

                  <div className="w-full h-2 bg-emerald-50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(2, criticalQueue.pressurePercent))}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] border-t border-slate-100">
                    <div>
                      <span className="text-slate-400 block">Strategy:</span>
                      <span className="font-bold text-emerald-700">{criticalQueue.strategy}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block">Processed:</span>
                      <span className="font-bold text-slate-800">{criticalQueue.processedCount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Queue 2: HIGH */}
              <div className="bg-white border-2 border-blue-200 rounded-xl p-5 shadow-xs relative overflow-hidden flex flex-col justify-between">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                      <h4 className="text-sm font-bold font-mono text-blue-900">HIGH QUEUE</h4>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">Inventory Operations</div>
                  </div>
                  <div className="px-2.5 py-1 bg-blue-100 text-blue-900 rounded-full text-[10px] font-extrabold uppercase font-mono tracking-wider border border-blue-300">
                    ACTIVE
                  </div>
                </div>

                <div className="my-3 space-y-2 font-mono">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-500">Queue Depth:</span>
                    <span className="text-2xl font-extrabold text-blue-800">
                      {highQueue.size} <span className="text-xs font-normal text-slate-400">/ {highQueue.capacity}</span>
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Pressure:</span>
                    <span className="font-bold text-blue-700">{highQueue.pressurePercent}%</span>
                  </div>

                  <div className="w-full h-2 bg-blue-50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(2, highQueue.pressurePercent))}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] border-t border-slate-100">
                    <div>
                      <span className="text-slate-400 block">Strategy:</span>
                      <span className="font-bold text-blue-700">{highQueue.strategy}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block">Processed:</span>
                      <span className="font-bold text-slate-800">{highQueue.processedCount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Queue 3: LOW */}
              <div className="bg-white border-2 border-purple-200 rounded-xl p-5 shadow-xs relative overflow-hidden flex flex-col justify-between">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                      <h4 className="text-sm font-bold font-mono text-purple-900">LOW QUEUE</h4>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">Clicks &amp; Application Logs</div>
                  </div>
                  <div
                    className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase font-mono tracking-wider border ${
                      lowQueue.strategy === 'STREAM'
                        ? 'bg-purple-100 text-purple-900 border-purple-300'
                        : lowQueue.strategy === 'BATCH'
                        ? 'bg-blue-100 text-blue-900 border-blue-300'
                        : lowQueue.strategy === 'DEFER'
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : 'bg-rose-100 text-rose-900 border-rose-300'
                    }`}
                  >
                    ADAPTIVE: {lowQueue.strategy}
                  </div>
                </div>

                <div className="my-3 space-y-2 font-mono">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-slate-500">Queue Depth:</span>
                    <span className="text-2xl font-extrabold text-purple-800">
                      {lowQueue.size} <span className="text-xs font-normal text-slate-400">/ {lowQueue.capacity}</span>
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Pressure:</span>
                    <span className="font-bold text-purple-700">{lowQueue.pressurePercent}%</span>
                  </div>

                  <div className="w-full h-2 bg-purple-50 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        lowQueue.pressurePercent >= 80
                          ? 'bg-rose-500'
                          : lowQueue.pressurePercent >= 55
                          ? 'bg-amber-500'
                          : lowQueue.pressurePercent >= 25
                          ? 'bg-blue-500'
                          : 'bg-purple-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(2, lowQueue.pressurePercent))}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] border-t border-slate-100">
                    <div>
                      <span className="text-slate-400 block">Strategy:</span>
                      <span className="font-bold text-purple-700">{lowQueue.strategy}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block">Processed:</span>
                      <span className="font-bold text-slate-800">{lowQueue.processedCount.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Graceful Degradation Breakdown: Shows LOW is degraded, not disabled */}
                  <div className="grid grid-cols-4 gap-1.5 pt-2 text-[10px] border-t border-slate-100 font-mono text-center">
                    <div className="bg-slate-50 p-1.5 rounded border border-slate-200">
                      <span className="text-slate-400 block text-[9px] uppercase font-sans">Accepted</span>
                      <span className="font-bold text-slate-800">{(lowQueue.accepted ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="bg-blue-50 p-1.5 rounded border border-blue-200">
                      <span className="text-blue-600 block text-[9px] uppercase font-sans">Batched</span>
                      <span className="font-bold text-blue-800">{(lowQueue.batched ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="bg-amber-50 p-1.5 rounded border border-amber-200">
                      <span className="text-amber-600 block text-[9px] uppercase font-sans">Deferred</span>
                      <span className="font-bold text-amber-800">{lowQueue.deferredCycles ?? 0} cyc</span>
                    </div>
                    <div className="bg-rose-50 p-1.5 rounded border border-rose-200">
                      <span className="text-rose-600 block text-[9px] uppercase font-sans">Shed</span>
                      <span className="font-bold text-rose-800">{(lowQueue.shed ?? 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 4.5: Compact Pipeline Module Summaries */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Fault Tolerance Card */}
            <div
              onClick={() => navigate('/modules/fault-tolerance')}
              className="bg-white p-4 rounded-xl border border-slate-200 hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[20px]">restart_alt</span>
                    </div>
                    <span className="text-xs font-bold text-slate-800 uppercase font-mono">Fault Tolerance</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                    (telemetry?.faultTolerance?.failureArmed)
                      ? 'bg-amber-100 text-amber-800'
                      : (telemetry?.faultTolerance?.retryFailures ?? 0) > 0
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {telemetry?.faultTolerance?.failureArmed ? 'ARMED' : (telemetry?.faultTolerance?.retryAttempts ?? 0) > 0 ? 'ACTIVE' : 'HEALTHY'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-sans">Retries</span>
                    <span className="font-bold text-slate-800">{telemetry?.faultTolerance?.retryAttempts ?? 0}</span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-sans">Recovered</span>
                    <span className="font-bold text-emerald-700">{telemetry?.faultTolerance?.retrySuccesses ?? 0}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-blue-600 group-hover:text-blue-700 font-medium">
                <span>View Module Dashboard</span>
                <span className="material-symbols-outlined text-[14px] group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
              </div>
            </div>

            {/* Worker Scaling Card */}
            <div
              onClick={() => navigate('/modules/worker-scaling')}
              className="bg-white p-4 rounded-xl border border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[20px]">hub</span>
                    </div>
                    <span className="text-xs font-bold text-slate-800 uppercase font-mono">Worker Scaling</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-indigo-100 text-indigo-800">
                    {telemetry?.workerScaling?.currentWorkers ?? 4} / {telemetry?.workerScaling?.maxWorkers ?? 8}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-sans">Utilization</span>
                    <span className="font-bold text-indigo-700">{telemetry?.workerScaling?.workerUtilization ?? adaptive.workerLoad}%</span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-sans">Pool Scale</span>
                    <span className="font-bold text-slate-800">{telemetry?.workerScaling?.scaleUpCount ?? 0}↑ {telemetry?.workerScaling?.scaleDownCount ?? 0}↓</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-indigo-600 group-hover:text-indigo-700 font-medium">
                <span>View Module Dashboard</span>
                <span className="material-symbols-outlined text-[14px] group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
              </div>
            </div>

            {/* Duplicate Shield Card */}
            <div
              onClick={() => navigate('/modules/duplicate-shield')}
              className="bg-white p-4 rounded-xl border border-slate-200 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[20px]">shield</span>
                    </div>
                    <span className="text-xs font-bold text-slate-800 uppercase font-mono">Duplicate Shield</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-100 text-emerald-800">
                    {telemetry?.duplicateDetection?.duplicatesPrevented ?? 0} BLOCKED
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-sans">LRU Cache</span>
                    <span className="font-bold text-slate-800">{telemetry?.duplicateDetection?.activeRegistryEntries ?? 0} / {telemetry?.duplicateDetection?.maxRegistryCapacity ?? 50000}</span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-sans">Window TTL</span>
                    <span className="font-bold text-emerald-700">{telemetry?.duplicateDetection?.windowTtlSeconds ?? 60}s</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-emerald-600 group-hover:text-emerald-700 font-medium">
                <span>View Module Dashboard</span>
                <span className="material-symbols-outlined text-[14px] group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
              </div>
            </div>

            {/* Decision Engine Card */}
            <div
              onClick={() => navigate('/modules/decision-engine')}
              className="bg-white p-4 rounded-xl border border-slate-200 hover:border-purple-400 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[20px]">psychology</span>
                    </div>
                    <span className="text-xs font-bold text-slate-800 uppercase font-mono">Decision Engine</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-purple-100 text-purple-800">
                    SCORE: {telemetry?.decisionFunction?.currentScore ?? 0}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-sans">Strategy</span>
                    <span className="font-bold text-purple-800">{telemetry?.decisionFunction?.currentDecision ?? adaptive.strategy}</span>
                  </div>
                  <div className="bg-slate-50 p-2 rounded border border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-sans">Confidence</span>
                    <span className="font-bold text-slate-800">{((telemetry?.decisionFunction?.confidence ?? 0.95) * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-purple-600 group-hover:text-purple-700 font-medium">
                <span>View Module Dashboard</span>
                <span className="material-symbols-outlined text-[14px] group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
              </div>
            </div>
          </section>

          {/* Section 5: Controlled Shedding Audit & Critical Event Protection */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Critical Protection Card (5 Cols) */}
            <div className="lg:col-span-5 bg-white p-6 rounded-xl border-2 border-emerald-200 shadow-xs flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center gap-3 mb-2">
                <span className="material-symbols-outlined text-emerald-500 text-3xl">verified_user</span>
                <div>
                  <h3 className="text-base font-bold text-[#131b2e]">Critical Event Protection</h3>
                  <p className="text-xs text-[#64748b]">Orders &amp; Payments Zero-Loss Guarantee</p>
                </div>
              </div>

              <div className="my-4 text-center p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
                <div className="text-xs font-bold font-mono text-emerald-800 uppercase tracking-wider mb-1">
                  CRITICAL LOST
                </div>
                <div className="text-5xl font-extrabold font-mono text-emerald-600 leading-none">
                  {criticalLost}
                </div>
                <div className="text-[11px] text-emerald-700 font-mono mt-1">
                  Safety Violations: <strong>{safetyViolations}</strong> | Critical Shed: <strong>{criticalShed}</strong>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs border-t border-slate-100 pt-3">
                <div className="p-2 bg-slate-50 rounded">
                  <div className="text-[10px] text-slate-400">Received</div>
                  <div className="font-bold text-slate-800">{criticalQueue.processedCount + criticalQueue.size}</div>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <div className="text-[10px] text-slate-400">Processed</div>
                  <div className="font-bold text-emerald-700">{criticalQueue.processedCount}</div>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <div className="text-[10px] text-slate-400">Queued</div>
                  <div className="font-bold text-blue-700">{criticalQueue.size}</div>
                </div>
              </div>
            </div>

            {/* Controlled Shedding Card (7 Cols) */}
            <div className="lg:col-span-7 bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-xs flex flex-col justify-between">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-rose-600 text-[24px]">delete_sweep</span>
                  <div>
                    <h3 className="text-base font-bold text-[#131b2e]">Controlled Shedding Audit</h3>
                    <p className="text-xs text-[#64748b]">Auditable non-critical drop with strict invariant accounting</p>
                  </div>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-mono font-bold ${
                    adaptive.sheddingStatus === 'ENABLED'
                      ? 'bg-rose-100 text-rose-800 border border-rose-300 animate-pulse'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  SHEDDING: {adaptive.sheddingStatus}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-3 my-3 font-mono">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                  <div className="text-[10px] text-slate-500 uppercase tracking-tight">TOTAL SHED</div>
                  <div className="text-2xl font-bold text-rose-600 mt-1">{shedding.total}</div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                  <div className="text-[10px] text-slate-500 uppercase tracking-tight">CLICK SHED</div>
                  <div className="text-xl font-bold text-slate-800 mt-1">{shedding.click}</div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
                  <div className="text-[10px] text-slate-500 uppercase tracking-tight">LOG SHED</div>
                  <div className="text-xl font-bold text-slate-800 mt-1">{shedding.log}</div>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
                  <div className="text-[10px] text-emerald-800 uppercase tracking-tight">CRITICAL SHED</div>
                  <div className="text-xl font-extrabold text-emerald-600 mt-1">{shedding.critical}</div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono">
                <div className="flex justify-between items-center text-slate-500 mb-1">
                  <span>LAST SHED EVENT AUDIT:</span>
                  <span>{shedding.lastShedEvent ? new Date(shedding.lastShedEvent.timestamp).toLocaleTimeString() : 'N/A'}</span>
                </div>
                {shedding.lastShedEvent ? (
                  <div className="text-slate-800">
                    <span className="font-bold text-rose-700">{shedding.lastShedEvent.type}</span> |{' '}
                    <span className="text-slate-600">{shedding.lastShedEvent.eventId || shedding.lastShedEvent.id}</span> —{' '}
                    <span className="text-slate-500 italic">{shedding.lastShedReason}</span>
                  </div>
                ) : (
                  <div className="text-slate-400 italic">No shedding active. Queue capacity within safety thresholds.</div>
                )}
              </div>
            </div>
          </section>

          {/* Section 6: Adaptive Decision Engine Explainability Panel */}
          <section className="bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-xs">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-[22px]">psychology</span>
                <h3 className="text-sm font-bold text-[#131b2e] uppercase font-mono tracking-wider">
                  Adaptive Decision Engine
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-400">Autonomous Backpressure &amp; Batching Governor</span>
            </div>

            {/* Telemetry Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 font-mono text-xs mb-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-[10px] text-slate-500">SYSTEM STATE</div>
                <div className="text-sm font-bold text-slate-900 mt-1">{adaptive.systemState}</div>
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <div className="text-[10px] text-emerald-700">CRITICAL</div>
                <div className="text-sm font-bold text-emerald-800 mt-1">{adaptive.criticalStrategy}</div>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-[10px] text-blue-700">HIGH</div>
                <div className="text-sm font-bold text-blue-800 mt-1">{adaptive.highStrategy}</div>
              </div>
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="text-[10px] text-purple-700">LOW STRATEGY</div>
                <div className="text-sm font-bold text-purple-800 mt-1">{adaptive.lowStrategy}</div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-[10px] text-slate-500">BACKLOG GROWTH</div>
                <div className="text-sm font-bold text-slate-800 mt-1">
                  {adaptive.backlogGrowth >= 0 ? `+${adaptive.backlogGrowth}` : adaptive.backlogGrowth}/sec
                </div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-[10px] text-slate-500">WORKER LOAD</div>
                <div className="text-sm font-bold text-slate-800 mt-1">{adaptive.workerLoad}%</div>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-[10px] text-blue-700">DYNAMIC BATCH</div>
                <div className="text-sm font-extrabold text-blue-900 mt-1">{batching.currentBatchSize} ev/batch</div>
              </div>
            </div>

            {/* Plain-English WHY Explanation from Backend */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 flex items-start gap-3">
              <span className="material-symbols-outlined text-blue-600 text-[20px] shrink-0 mt-0.5">info</span>
              <div>
                <strong className="text-blue-900">WHY THIS DECISION?</strong>
                <p className="mt-1 text-slate-700 leading-relaxed font-sans text-xs">
                  {adaptive.reason}
                </p>
                <div className="mt-2 text-[11px] text-slate-500 font-mono">
                  Batch Sizing Reason: <span className="text-slate-700">{batching.batchSizeReason}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Section 7: Charts Grid (Latency Chart + Real-Time Dynamic Batch Size Graph) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Processing Latency */}
            <section className="bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-xs flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-[#131b2e] uppercase font-mono tracking-wider">
                  Processing Latency (Time Series)
                </h3>
                <div className="flex gap-4 font-mono text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-1 bg-emerald-500 rounded" />
                    <span>Critical (~15ms)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-1 bg-purple-500 rounded" />
                    <span>Non-Critical</span>
                  </div>
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={latencyData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} unit="ms" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#cbd5e1',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                    <Line
                      type="monotone"
                      dataKey="critical"
                      name="Critical (Orders/Payments)"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="nonCritical"
                      name="Non-Critical (Clicks/Logs)"
                      stroke="#a855f7"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Chart 2: Dynamic Batch Size vs Queue Pressure (Backend Observations) */}
            <section className="bg-white p-6 rounded-xl border border-[#e2e8f0] shadow-xs flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-sm font-bold text-[#131b2e] uppercase font-mono tracking-wider">
                    Batch Size vs Queue Pressure
                  </h3>
                  <p className="text-[11px] text-slate-500">Live backend telemetry observations ({batchChartData.length} records)</p>
                </div>
                <div className="px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-800 rounded font-mono text-xs font-bold">
                  Current: {batching.currentBatchSize} ev
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={batchChartData} margin={{ top: 10, right: 20, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      dataKey="pressure"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      unit="%"
                      label={{ value: 'Low Queue Pressure (%)', position: 'insideBottom', offset: -4, fontSize: 10, fill: '#64748b' }}
                    />
                    <YAxis
                      dataKey="batchSize"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      domain={[0, 260]}
                      label={{ value: 'Batch Size', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#64748b' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#cbd5e1',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                      }}
                      formatter={(val: any) => [`${val} events`, 'Batch Size']}
                      labelFormatter={(label: any) => `Queue Pressure: ${label}%`}
                    />
                    <Line
                      type="stepAfter"
                      dataKey="batchSize"
                      name="Adaptive Batch Size"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#2563eb' }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          {/* Section 8: Event Accounting & Invariant Reconciliation */}
          <section className="bg-white p-5 rounded-xl border border-[#e2e8f0] shadow-xs font-mono text-xs">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600 text-[20px]">calculate</span>
                <span className="font-bold text-slate-800 uppercase tracking-wider">
                  Event Accounting &amp; Reconciled Invariants
                </span>
              </div>
              <div className="flex items-center gap-2">
                {isReconciled ? (
                  <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold">
                    ✓ RECONCILED (Diff: {accountingDifference})
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded font-bold">
                    IN-FLIGHT BUFFER (Diff: {accountingDifference})
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[10px] text-slate-400 block">Received</span>
                <span className="text-base font-bold text-slate-800">{totalReceived.toLocaleString()}</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[10px] text-slate-400 block">= Processed</span>
                <span className="text-base font-bold text-emerald-700">{totalProcessed.toLocaleString()}</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[10px] text-slate-400 block">+ Queued</span>
                <span className="text-base font-bold text-blue-700">{totalQueued.toLocaleString()}</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[10px] text-slate-400 block">+ Shed</span>
                <span className="text-base font-bold text-rose-700">{totalShed.toLocaleString()}</span>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-[10px] text-slate-400 block">+ In-Flight</span>
                <span className="text-base font-bold text-purple-700">{criticalInFlight.toLocaleString()}</span>
              </div>
            </div>
          </section>

          {/* Section 9: Live Event Feed (Bounded Real-Time Buffer) */}
          <section className="bg-white rounded-xl border border-[#e2e8f0] shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-slate-600 text-[18px]">receipt_long</span>
                <div>
                  <h3 className="text-sm font-bold text-[#131b2e] uppercase font-mono tracking-wider">
                    Live Event Feed
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Latest {Math.min(activityLogs.length, 25)} streamed events (in-memory buffer)
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/history/events')}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
              >
                <span>Explore Full Event History</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 font-mono text-slate-600">
                    <th className="py-2.5 px-6 font-semibold">Event ID</th>
                    <th className="py-2.5 px-6 font-semibold">Type</th>
                    <th className="py-2.5 px-6 font-semibold">Priority</th>
                    <th className="py-2.5 px-6 font-semibold">Strategy</th>
                    <th className="py-2.5 px-6 font-semibold">Status</th>
                    <th className="py-2.5 px-6 font-semibold">Audit Reason</th>
                    <th className="py-2.5 px-6 font-semibold text-right font-mono">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activityLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400 font-mono">
                        Pipeline idle. Adjust traffic slider or trigger normal load to stream events.
                      </td>
                    </tr>
                  ) : (
                    activityLogs.slice(0, 25).map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-6 font-mono text-[11px] text-slate-500">{log.id}</td>
                        <td className="py-3 px-6 font-semibold text-slate-800">{log.type}</td>
                        <td className="py-3 px-6">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                              log.priority === 'CRITICAL'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                : log.priority === 'HIGH'
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : 'bg-purple-100 text-purple-800 border border-purple-200'
                            }`}
                          >
                            {log.priority}
                          </span>
                        </td>
                        <td className="py-3 px-6">
                          <span
                            className={`font-mono text-xs font-bold ${
                              log.strategy === 'STREAM'
                                ? 'text-blue-600'
                                : log.strategy === 'BATCH'
                                ? 'text-indigo-600'
                                : log.strategy === 'DEFER'
                                ? 'text-amber-600'
                                : 'text-rose-600'
                            }`}
                          >
                            {log.strategy}
                          </span>
                        </td>
                        <td className="py-3 px-6">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                              log.status === 'SHED'
                                ? 'bg-rose-100 text-rose-800'
                                : log.status === 'DEFERRED'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {log.status}
                          </span>
                        </td>
                        <td className="py-3 px-6 text-slate-600 text-[11px]">{log.reason}</td>
                        <td className="py-3 px-6 text-slate-400 text-right font-mono text-xs">{log.timestamp}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
            </>
          )}
        </main>
      </div>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={() => {
          setIsAuthModalOpen(false);
          navigate('/pipeline');
        }}
      />
    </div>
  );
};

export default App;
