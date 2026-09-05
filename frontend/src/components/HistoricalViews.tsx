import React, { useState, useEffect } from 'react';
import { getSessionToken } from '../services/supabaseClient';
import { User } from '@supabase/supabase-js';

const API_BASE = 'http://localhost:4000/api';

interface EventLogRecord {
  id: string;
  run_id: string | null;
  user_id: string;
  event_id: string;
  event_type: string;
  priority: string;
  strategy: string;
  status: string;
  audit_reason: string | null;
  worker_id: string | null;
  processing_latency: number | null;
  retry_count: number;
  timestamp: string;
  created_at: string;
}

// Event Detail Drawer Component
export const EventDetailDrawer: React.FC<{
  event: EventLogRecord | null;
  onClose: () => void;
}> = ({ event, onClose }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!event) return null;

  const handleCopyId = () => {
    navigator.clipboard.writeText(event.event_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-2xs transition-opacity animate-fade-in">
      <div
        className="w-full max-w-md bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col justify-between overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          {/* Drawer Header */}
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Event Investigation
              </span>
              <h3 className="text-sm font-bold text-slate-900 font-mono flex items-center gap-2 mt-0.5">
                <span>{event.event_id}</span>
                <button
                  onClick={handleCopyId}
                  title="Copy Event ID"
                  className="text-slate-400 hover:text-slate-700 p-0.5 rounded"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {copied ? 'check' : 'content_copy'}
                  </span>
                </button>
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
              title="Close Drawer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          {/* Drawer Content */}
          <div className="p-5 space-y-4 text-xs">
            {/* Top Status & Priority Card */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-slate-400 block font-semibold">Priority Tier</span>
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold mt-1 ${
                    event.priority === 'CRITICAL'
                      ? 'bg-rose-100 text-rose-800 border border-rose-200'
                      : event.priority === 'HIGH'
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : 'bg-slate-200 text-slate-700 border border-slate-300'
                  }`}
                >
                  {event.priority}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block font-semibold">Status</span>
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold mt-1 ${
                    event.status === 'PROCESSED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : event.status === 'SHED'
                      ? 'bg-rose-100 text-rose-800'
                      : event.status === 'PERMANENT_FAILURE'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {event.status}
                </span>
              </div>
            </div>

            {/* Audit Details */}
            <div className="space-y-3 font-mono">
              <div className="border-b border-slate-100 pb-2">
                <span className="text-[10px] text-slate-400 block font-sans font-semibold">Event Type</span>
                <span className="text-slate-800 font-bold">{event.event_type}</span>
              </div>

              <div className="border-b border-slate-100 pb-2">
                <span className="text-[10px] text-slate-400 block font-sans font-semibold">Adaptive Strategy</span>
                <span className="text-slate-800 font-bold">{event.strategy}</span>
              </div>

              <div className="border-b border-slate-100 pb-2">
                <span className="text-[10px] text-slate-400 block font-sans font-semibold">Audit / Drop Reason</span>
                <span className="text-slate-700 font-sans text-xs">
                  {event.audit_reason || 'Normal processing path executed'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 border-b border-slate-100 pb-2">
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans font-semibold">Execution Latency</span>
                  <span className="text-slate-800 font-bold">
                    {event.processing_latency !== null ? `${Math.round(event.processing_latency)} ms` : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans font-semibold">Retry Count</span>
                  <span className="text-slate-800 font-bold">{event.retry_count || 0}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-b border-slate-100 pb-2">
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans font-semibold">Assigned Worker</span>
                  <span className="text-slate-800 font-bold">{event.worker_id || 'Worker Pool'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-sans font-semibold">Run ID</span>
                  <span className="text-slate-600 truncate block text-[11px]" title={event.run_id || 'None'}>
                    {event.run_id ? `${event.run_id.slice(0, 8)}...` : 'Anonymous / Direct'}
                  </span>
                </div>
              </div>

              <div className="border-b border-slate-100 pb-2">
                <span className="text-[10px] text-slate-400 block font-sans font-semibold">Event Timestamp</span>
                <span className="text-slate-700 text-[11px] block">
                  {new Date(event.timestamp).toLocaleString()}
                </span>
                <span className="text-slate-400 text-[10px] block mt-0.5">{event.timestamp}</span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 block font-sans font-semibold">Supabase Record ID</span>
                <span className="text-slate-400 text-[10px] block truncate" title={event.id}>
                  {event.id}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold rounded-lg text-xs transition-colors"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================================
// 1. Event History View (Full Investigation Page)
// ==========================================================
export const EventHistoryView: React.FC<{
  user: User | null;
  selectedRunId?: string | null;
  onClearSelectedRun?: () => void;
  onOpenSignIn?: () => void;
}> = ({ user, selectedRunId, onClearSelectedRun, onOpenSignIn }) => {
  const [events, setEvents] = useState<EventLogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // History storage status & sync
  const [isSyncing, setIsSyncing] = useState(false);
  const [dbStatus, setDbStatus] = useState<'CONNECTED' | 'DEGRADED' | 'OFFLINE'>('CONNECTED');
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);

  // Filter States
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [strategyFilter, setStrategyFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [runIdFilter, setRunIdFilter] = useState(selectedRunId || 'ALL');
  const [timeRangeFilter, setTimeRangeFilter] = useState('ALL');

  // Historical runs list for dropdown
  const [availableRuns, setAvailableRuns] = useState<any[]>([]);

  // Selected row for Drawer
  const [selectedEvent, setSelectedEvent] = useState<EventLogRecord | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const limit = 50;

  // Sync selectedRunId prop
  useEffect(() => {
    if (selectedRunId) {
      setRunIdFilter(selectedRunId);
      setPage(0);
    }
  }, [selectedRunId]);

  // Fetch persistence status periodically
  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/persistence/status`);
      if (res.ok) {
        const data = await res.json();
        setDbStatus(data.dbStatus || 'CONNECTED');
        setPendingCount(data.bufferedEventsCount || 0);
        if (data.lastPersistedAt) {
          setLastSyncedTime(new Date(data.lastPersistedAt).toLocaleTimeString());
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 3000);
    return () => clearInterval(timer);
  }, []);

  // Fetch available runs for the dropdown
  useEffect(() => {
    if (!user) return;
    getSessionToken().then((token) => {
      fetch(`${API_BASE}/history/runs?limit=50`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then((res) => res.json())
        .then((data) => {
          setAvailableRuns(data.runs || []);
        })
        .catch(() => {});
    });
  }, [user]);

  // Main Event Query Fetcher
  const fetchEvents = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getSessionToken();
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(page * limit),
      });

      if (search.trim()) params.set('search', search.trim());
      if (typeFilter !== 'ALL') params.set('type', typeFilter);
      if (priorityFilter !== 'ALL') params.set('priority', priorityFilter);
      if (strategyFilter !== 'ALL') params.set('strategy', strategyFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (runIdFilter !== 'ALL') params.set('runId', runIdFilter);

      // Compute time range 'since' parameter
      const now = Date.now();
      if (timeRangeFilter === '5m') {
        params.set('since', new Date(now - 5 * 60 * 1000).toISOString());
      } else if (timeRangeFilter === '15m') {
        params.set('since', new Date(now - 15 * 60 * 1000).toISOString());
      } else if (timeRangeFilter === '1h') {
        params.set('since', new Date(now - 60 * 60 * 1000).toISOString());
      } else if (timeRangeFilter === 'today') {
        params.set('since', new Date(new Date().setHours(0, 0, 0, 0)).toISOString());
      }

      const res = await fetch(`${API_BASE}/history/events?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to fetch event history');
      }
      const data = await res.json();
      setEvents(data.events || []);
      setTotal(data.total || 0);
      fetchStatus();
    } catch (err: any) {
      setError(err.message || 'Unable to load event history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [user, page, typeFilter, priorityFilter, strategyFilter, statusFilter, runIdFilter, timeRangeFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchEvents();
  };

  const handleClearAllFilters = () => {
    setSearch('');
    setTypeFilter('ALL');
    setPriorityFilter('ALL');
    setStrategyFilter('ALL');
    setStatusFilter('ALL');
    setRunIdFilter('ALL');
    setTimeRangeFilter('ALL');
    setPage(0);
    if (onClearSelectedRun) onClearSelectedRun();
  };

  const handleSyncLatest = async () => {
    try {
      setIsSyncing(true);
      const token = await getSessionToken();
      const res = await fetch(`${API_BASE}/history/sync`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setDbStatus(data.dbStatus || 'CONNECTED');
        setPendingCount(data.pending || 0);
        if (data.lastSyncedTime) {
          setLastSyncedTime(data.lastSyncedTime);
        }
      }
      await fetchEvents();
    } catch (err: any) {
      console.warn('Sync failed:', err?.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Determine which filters are active
  const activeFilters = [
    search.trim() ? { label: `Search: "${search}"`, onRemove: () => { setSearch(''); setPage(0); } } : null,
    priorityFilter !== 'ALL' ? { label: `Priority: ${priorityFilter}`, onRemove: () => { setPriorityFilter('ALL'); setPage(0); } } : null,
    typeFilter !== 'ALL' ? { label: `Type: ${typeFilter}`, onRemove: () => { setTypeFilter('ALL'); setPage(0); } } : null,
    strategyFilter !== 'ALL' ? { label: `Strategy: ${strategyFilter}`, onRemove: () => { setStrategyFilter('ALL'); setPage(0); } } : null,
    statusFilter !== 'ALL' ? { label: `Status: ${statusFilter}`, onRemove: () => { setStatusFilter('ALL'); setPage(0); } } : null,
    runIdFilter !== 'ALL' ? {
      label: `Run: ${runIdFilter.slice(0, 8)}...`,
      onRemove: () => { setRunIdFilter('ALL'); setPage(0); if (onClearSelectedRun) onClearSelectedRun(); }
    } : null,
    timeRangeFilter !== 'ALL' ? {
      label: `Time: ${
        timeRangeFilter === '5m'
          ? 'Last 5m'
          : timeRangeFilter === '15m'
          ? 'Last 15m'
          : timeRangeFilter === '1h'
          ? 'Last 1h'
          : 'Today'
      }`,
      onRemove: () => { setTimeRangeFilter('ALL'); setPage(0); }
    } : null,
  ].filter(Boolean) as { label: string; onRemove: () => void }[];

  const totalPages = Math.ceil(total / limit) || 1;

  if (!user) {
    return (
      <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs max-w-xl mx-auto my-8">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
          <span className="material-symbols-outlined text-2xl">lock</span>
        </div>
        <h3 className="text-base font-bold text-slate-900">Authentication Required</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1.5 leading-relaxed">
          Sign in to view your user-scoped persistent event logs, audit reasons, and latency trails in Supabase.
        </p>
        {onOpenSignIn && (
          <button
            onClick={onOpenSignIn}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            Sign In with AdaptiFlow
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-blue-600 text-[22px]">receipt_long</span>
            <h2 className="text-base font-bold text-slate-900">Event History &amp; Audit Log Exploration</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Durable PostgreSQL event records automatically persisted during active pipeline runs.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono mt-2">
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold bg-white shadow-2xs">
              <span className="text-slate-500 font-sans">History Storage:</span>
              {dbStatus === 'OFFLINE' ? (
                <span className="flex items-center gap-1 text-rose-600 font-bold" title="Live processing continues; historical persistence will resume when storage is available.">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  Temporarily unavailable
                </span>
              ) : isSyncing ? (
                <span className="flex items-center gap-1 text-blue-600 font-bold">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  Syncing...
                </span>
              ) : pendingCount > 0 ? (
                <span className="flex items-center gap-1 text-amber-600 font-bold" title={`${pendingCount} event records in local buffer awaiting periodic flush`}>
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Delayed ({pendingCount} pending)
                </span>
              ) : (
                <span className="flex items-center gap-1 text-emerald-600 font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Synced
                </span>
              )}
            </div>
            {lastSyncedTime && (
              <span className="text-slate-400 text-[11px]">
                Last synced: <strong className="text-slate-600">{lastSyncedTime}</strong>
              </span>
            )}
            <span className="text-slate-400 text-[11px]">
              Pending: <strong className="text-slate-600">{pendingCount}</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleSyncLatest}
            disabled={isSyncing}
            className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
            title="Flush pending in-memory persistence buffers and refresh Event History immediately"
          >
            <span className={`material-symbols-outlined text-sm ${isSyncing ? 'animate-spin' : ''}`}>sync</span>
            <span>{isSyncing ? 'Syncing...' : 'Sync Latest'}</span>
          </button>
          <button
            onClick={fetchEvents}
            disabled={loading}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
          >
            <span className={`material-symbols-outlined text-sm ${loading ? 'animate-spin' : ''}`}>refresh</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <form onSubmit={handleSearchSubmit} className="space-y-3">
          {/* Row 1: Search bar + Run Selector + Time Range */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
            {/* Search Input */}
            <div className="md:col-span-6 relative">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-sm">
                search
              </span>
              <input
                type="text"
                placeholder="Search by Event ID, Type, or Audit Reason..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono bg-white"
              />
            </div>

            {/* Run Dropdown */}
            <div className="md:col-span-3">
              <select
                value={runIdFilter}
                onChange={(e) => {
                  setRunIdFilter(e.target.value);
                  setPage(0);
                }}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="ALL">All Historical Runs</option>
                {availableRuns.map((r) => (
                  <option key={r.id} value={r.id}>
                    Run #{r.id.slice(0, 8)} — {r.scenario} ({new Date(r.start_time).toLocaleTimeString()})
                  </option>
                ))}
              </select>
            </div>

            {/* Time Range Dropdown */}
            <div className="md:col-span-3">
              <select
                value={timeRangeFilter}
                onChange={(e) => {
                  setTimeRangeFilter(e.target.value);
                  setPage(0);
                }}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="ALL">All Time</option>
                <option value="5m">Last 5 Minutes</option>
                <option value="15m">Last 15 Minutes</option>
                <option value="1h">Last 1 Hour</option>
                <option value="today">Today</option>
              </select>
            </div>
          </div>

          {/* Row 2: Secondary Dropdowns (Priority, Type, Strategy, Status) + Submit */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
            {/* Priority */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Priority</label>
              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value);
                  setPage(0);
                }}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="ALL">All Priorities</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="LOW">LOW</option>
              </select>
            </div>

            {/* Event Type */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Event Type</label>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(0);
                }}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="ALL">All Event Types</option>
                <option value="ORDER">ORDER</option>
                <option value="PAYMENT">PAYMENT</option>
                <option value="INVENTORY">INVENTORY</option>
                <option value="CLICK">CLICK</option>
                <option value="LOG">LOG</option>
              </select>
            </div>

            {/* Strategy */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Strategy</label>
              <select
                value={strategyFilter}
                onChange={(e) => {
                  setStrategyFilter(e.target.value);
                  setPage(0);
                }}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="ALL">All Strategies</option>
                <option value="STREAM">STREAM</option>
                <option value="BATCH">BATCH</option>
                <option value="DEFER">DEFER</option>
                <option value="SHED">SHED</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(0);
                }}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="ALL">All Statuses</option>
                <option value="PROCESSED">PROCESSED</option>
                <option value="QUEUED">QUEUED</option>
                <option value="SHED">SHED</option>
                <option value="RETRYING">RETRYING</option>
                <option value="PERMANENT_FAILURE">PERMANENT_FAILURE</option>
                <option value="DUPLICATE">DUPLICATE</option>
              </select>
            </div>

            {/* Filter Apply Button */}
            <div className="flex items-end">
              <button
                type="submit"
                className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">filter_alt</span>
                <span>Apply</span>
              </button>
            </div>
          </div>
        </form>

        {/* Active Filter Chips Bar */}
        {activeFilters.length > 0 && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase font-bold text-slate-400">Active Filters:</span>
            {activeFilters.map((chip, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-full text-xs font-medium"
              >
                <span>{chip.label}</span>
                <button
                  type="button"
                  onClick={chip.onRemove}
                  className="hover:text-blue-900 text-blue-500 rounded-full p-0.5"
                  title="Remove filter"
                >
                  <span className="material-symbols-outlined text-[13px]">close</span>
                </button>
              </span>
            ))}

            <button
              type="button"
              onClick={handleClearAllFilters}
              className="text-xs font-semibold text-rose-600 hover:text-rose-800 ml-auto flex items-center gap-1 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">clear_all</span>
              <span>Clear All Filters</span>
            </button>
          </div>
        )}

        {/* Results Counter Summary */}
        <div className="flex justify-between items-center text-xs text-slate-500 pt-1">
          <div>
            <strong className="text-slate-800 font-bold">{total.toLocaleString()}</strong> matching events found
            {activeFilters.length > 0 && ' (filtered)'}
          </div>
          <div className="font-mono text-[11px]">
            Page {page + 1} of {totalPages}
          </div>
        </div>
      </div>

      {/* Events Table Container */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-3">
            <span className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span>Loading event history...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600 text-xs bg-rose-50/50">
            <span className="material-symbols-outlined text-3xl mb-1 text-rose-500">error</span>
            <p className="font-bold">Unable to load event history</p>
            <p className="mt-1 text-slate-600">{error}</p>
            <button
              onClick={fetchEvents}
              className="mt-3 px-3 py-1 bg-white border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold hover:bg-rose-50"
            >
              Retry
            </button>
          </div>
        ) : events.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <span className="material-symbols-outlined text-4xl mb-2 text-slate-300">search_off</span>
            <p className="font-bold text-slate-700">
              {activeFilters.length > 0
                ? 'No events match the selected filters.'
                : 'No events recorded yet.'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
              {activeFilters.length > 0
                ? 'Try clearing some of your filter criteria or broadening your search keywords.'
                : 'Start a simulation run while authenticated to stream and persist event records into Supabase.'}
            </p>
            {activeFilters.length > 0 && (
              <button
                onClick={handleClearAllFilters}
                className="mt-3 px-3.5 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold hover:bg-blue-100"
              >
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold uppercase text-[10px] tracking-wider select-none">
                <tr>
                  <th className="py-2.5 px-3">Event ID</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3">Strategy</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Worker</th>
                  <th className="py-2.5 px-3">Retries</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Audit Reason</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {events.map((evt) => (
                  <tr
                    key={evt.id}
                    onClick={() => setSelectedEvent(evt)}
                    className="hover:bg-blue-50/50 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-3 text-slate-900 font-bold truncate max-w-[130px]" title={evt.event_id}>
                      {evt.event_id}
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      <span className="font-semibold text-slate-700">{evt.event_type}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          evt.priority === 'CRITICAL'
                            ? 'bg-rose-100 text-rose-800'
                            : evt.priority === 'HIGH'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {evt.priority}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                          evt.strategy === 'STREAM'
                            ? 'bg-blue-50 text-blue-700'
                            : evt.strategy === 'BATCH'
                            ? 'bg-indigo-50 text-indigo-700'
                            : evt.strategy === 'DEFER'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {evt.strategy}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      <span
                        className={`font-semibold ${
                          evt.status === 'PROCESSED'
                            ? 'text-emerald-600'
                            : evt.status === 'SHED'
                            ? 'text-rose-600'
                            : evt.status === 'PERMANENT_FAILURE'
                            ? 'text-purple-600'
                            : evt.status === 'DUPLICATE'
                            ? 'text-orange-600'
                            : 'text-amber-600'
                        }`}
                      >
                        {evt.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                      {evt.worker_id || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {evt.retry_count || 0}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 font-sans text-[11px] truncate max-w-[180px]" title={evt.audit_reason || 'Normal processing'}>
                      {evt.audit_reason || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className="text-blue-600 hover:text-blue-800 text-[11px] font-sans font-semibold inline-flex items-center gap-0.5">
                        <span>Inspect</span>
                        <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {total > limit && (
          <div className="flex flex-col sm:flex-row justify-between items-center px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs gap-2">
            <span className="text-slate-500">
              Showing <strong className="text-slate-800 font-bold">{page * limit + 1}</strong>–
              <strong className="text-slate-800 font-bold">{Math.min((page + 1) * limit, total)}</strong> of{' '}
              <strong className="text-slate-800 font-bold">{total}</strong> records
            </span>
            <div className="flex items-center gap-1.5">
              <button
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="px-3 py-1 bg-white border border-slate-300 rounded-lg text-slate-700 disabled:opacity-40 hover:bg-slate-100 font-medium transition-colors cursor-pointer"
              >
                Previous
              </button>
              <span className="px-2 font-mono text-[11px] text-slate-600">
                {page + 1} / {totalPages}
              </span>
              <button
                disabled={(page + 1) * limit >= total || loading}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 bg-white border border-slate-300 rounded-lg text-slate-700 disabled:opacity-40 hover:bg-slate-100 font-medium transition-colors cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Slide-out Event Detail Drawer */}
      <EventDetailDrawer
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
};

// ==========================================================
// 2. Run History View
// ==========================================================
export const RunHistoryView: React.FC<{
  user: User | null;
  onSelectRun: (runId: string) => void;
}> = ({ user, onSelectRun }) => {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getSessionToken();
      const res = await fetch(`${API_BASE}/history/runs?limit=30`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to fetch runs');
      }
      const data = await res.json();
      setRuns(data.runs || []);
    } catch (err: any) {
      setError(err.message || 'Error fetching runs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, [user]);

  if (!user) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
        <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">history</span>
        <h3 className="text-base font-bold text-slate-800">Authentication Required</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
          Sign in to view your historical workload runs, peak pressures, and execution summaries.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-bold text-slate-900">Workload Run History</h2>
          <p className="text-xs text-slate-500">
            Audit history of completed simulation runs saved persistently to Supabase.
          </p>
        </div>
        <button
          onClick={fetchRuns}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-sm">refresh</span>
          <span>Refresh</span>
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span>Loading historical runs from Supabase...</span>
        </div>
      ) : error ? (
        <div className="p-6 text-center text-rose-600 text-xs bg-white rounded-xl border border-rose-200">
          <p className="font-bold">Error loading runs</p>
          <p className="mt-1 text-slate-500">{error}</p>
        </div>
      ) : runs.length === 0 ? (
        <div className="p-10 text-center text-slate-400 text-xs bg-white rounded-xl border border-slate-200">
          <span className="material-symbols-outlined text-3xl mb-1">play_arrow</span>
          <p>No recorded simulation runs found.</p>
          <p className="text-[11px] text-slate-400 mt-1">
            Click "Start Tracked Run" on the dashboard to run traffic and log it to Supabase.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {runs.map((run) => {
            const startTime = new Date(run.start_time);
            const endTime = run.end_time ? new Date(run.end_time) : null;
            const durationSec = endTime ? Math.round((endTime.getTime() - startTime.getTime()) / 1000) : null;

            return (
              <div
                key={run.id}
                className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs hover:border-blue-300 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        run.scenario === 'CRITICAL_HEAVY'
                          ? 'bg-rose-100 text-rose-800'
                          : run.scenario === 'HIGH_HEAVY'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {run.scenario}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        run.status === 'COMPLETED'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700 animate-pulse'
                      }`}
                    >
                      {run.status}
                    </span>
                  </div>

                  <div className="text-xs font-mono text-slate-800 font-bold mb-1 truncate" title={run.id}>
                    Run: {run.id.slice(0, 8)}...
                  </div>

                  <div className="text-[11px] text-slate-500 mb-3">
                    {startTime.toLocaleDateString()} at {startTime.toLocaleTimeString()}
                    {durationSec !== null && ` (${durationSec}s)`}
                  </div>

                  {/* Run Metrics Grid */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-center mb-3">
                    <div>
                      <div className="text-[10px] text-slate-400">Total</div>
                      <div className="text-xs font-bold text-slate-800 font-mono">
                        {(run.total_events || 0).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400">Processed</div>
                      <div className="text-xs font-bold text-emerald-600 font-mono">
                        {(run.processed || 0).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400">Shed</div>
                      <div className="text-xs font-bold text-rose-600 font-mono">
                        {(run.shed || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] space-y-1 text-slate-600">
                    <div className="flex justify-between">
                      <span>Peak Queue Pressure:</span>
                      <span className="font-bold text-slate-800">{Math.round((run.peak_pressure || 0) * 100)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Max Workers:</span>
                      <span className="font-bold text-slate-800">{run.maximum_workers || 2} workers</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Retries / Duplicates:</span>
                      <span className="font-mono text-slate-800">
                        {run.retries || 0} / {run.duplicates || 0}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onSelectRun(run.id)}
                  className="mt-4 w-full py-1.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1"
                >
                  <span>View Event Logs</span>
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ==========================================================
// 3. Historical Analytics View
// ==========================================================
export const HistoricalAnalyticsView: React.FC<{ user: User | null }> = ({ user }) => {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getSessionToken();
      const res = await fetch(`${API_BASE}/history/analytics`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to fetch analytics');
      }
      const data = await res.json();
      setAnalytics(data);
    } catch (err: any) {
      setError(err.message || 'Error loading analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [user]);

  if (!user) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
        <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">insights</span>
        <h3 className="text-base font-bold text-slate-800">Authentication Required</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
          Sign in to view aggregated historical performance and system efficiency analytics.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
        <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span>Computing historical analytics from database...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-rose-600 text-xs bg-white rounded-xl border border-rose-200">
        <p className="font-bold">Error loading analytics</p>
        <p className="mt-1 text-slate-500">{error}</p>
      </div>
    );
  }

  const s = analytics?.summary || {};
  const breakdown = analytics?.scenarioBreakdown || {};

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-base font-bold text-slate-900">Historical System Analytics</h2>
          <p className="text-xs text-slate-500">
            Real aggregated performance metrics across all user simulation runs.
          </p>
        </div>
        <button
          onClick={fetchAnalytics}
          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-sm">refresh</span>
          <span>Refresh</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] text-slate-500 font-semibold mb-1">Total Runs</div>
          <div className="text-xl font-extrabold text-blue-600 font-mono">{s.totalRuns || 0}</div>
          <div className="text-[10px] text-slate-400 mt-1">Tracked sessions</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] text-slate-500 font-semibold mb-1">Total Ingested</div>
          <div className="text-xl font-extrabold text-slate-800 font-mono">
            {(s.totalEvents || 0).toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Total run volume</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] text-slate-500 font-semibold mb-1">Processed</div>
          <div className="text-xl font-extrabold text-emerald-600 font-mono">
            {(s.totalProcessed || 0).toLocaleString()}
          </div>
          <div className="text-[10px] text-emerald-600 font-semibold mt-1">Successfully handled</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] text-slate-500 font-semibold mb-1">Controlled Shed</div>
          <div className="text-xl font-extrabold text-rose-600 font-mono">
            {(s.totalShed || 0).toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Low-priority items</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] text-slate-500 font-semibold mb-1">Peak Pressure</div>
          <div className="text-xl font-extrabold text-purple-600 font-mono">
            {Math.round((s.overallPeakPressure || 0) * 100)}%
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Max queue stress</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] text-slate-500 font-semibold mb-1">Max Concurrency</div>
          <div className="text-xl font-extrabold text-indigo-600 font-mono">
            {s.overallMaxWorkers || 2} <span className="text-xs font-normal">workers</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Auto-scale peak</div>
        </div>
      </div>

      {/* Scenario Breakdown */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
        <h3 className="text-sm font-bold text-slate-900 mb-3">Workload Distribution Profile Frequency</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-rose-50/60 rounded-xl border border-rose-200/70">
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold text-xs text-rose-800">CRITICAL_HEAVY</span>
              <span className="font-mono text-xs font-bold text-rose-700">{breakdown.CRITICAL_HEAVY || 0} runs</span>
            </div>
            <p className="text-[11px] text-rose-600">60% Orders & Payments / 20% Inventory / 20% Clicks</p>
          </div>

          <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200/70">
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold text-xs text-amber-800">HIGH_HEAVY</span>
              <span className="font-mono text-xs font-bold text-amber-700">{breakdown.HIGH_HEAVY || 0} runs</span>
            </div>
            <p className="text-[11px] text-amber-600">60% Inventory / 20% Critical / 20% Low Priority</p>
          </div>

          <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-200/70">
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold text-xs text-blue-800">LOW_HEAVY</span>
              <span className="font-mono text-xs font-bold text-blue-700">{breakdown.LOW_HEAVY || 0} runs</span>
            </div>
            <p className="text-[11px] text-blue-600">60% Clicks & Logs / 20% Critical / 20% Inventory</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================================
// 4. Account View
// ==========================================================
export const AccountView: React.FC<{
  user: User | null;
  onSignOut: () => void;
  onOpenSignIn: () => void;
}> = ({ user, onSignOut, onOpenSignIn }) => {
  if (!user) {
    return (
      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-2xs max-w-lg mx-auto text-center space-y-4">
        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
          <span className="material-symbols-outlined text-2xl">account_circle</span>
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800">Not Signed In</h2>
          <p className="text-xs text-slate-500 mt-1">
            Sign in with your Supabase account to unlock persistent history, Row Level Security isolation, and cross-session analytics.
          </p>
        </div>
        <button
          onClick={onOpenSignIn}
          className="py-2 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
        >
          Sign In or Create Account
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
        {user.user_metadata?.avatar_url ? (
          <img
            src={user.user_metadata.avatar_url}
            alt="Profile avatar"
            className="w-12 h-12 rounded-xl object-cover border border-slate-200"
          />
        ) : (
          <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold text-lg">
            {user.email?.charAt(0).toUpperCase() || 'U'}
          </div>
        )}
        <div>
          <h2 className="text-base font-bold text-slate-900">
            {user.user_metadata?.full_name || user.email}
          </h2>
          {user.user_metadata?.full_name && user.email && (
            <p className="text-xs text-slate-500">{user.email}</p>
          )}
          <span className="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold mt-0.5">
            Authenticated via {user.app_metadata?.provider === 'google' ? 'Google OAuth' : 'Supabase'}
          </span>
        </div>
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between py-1.5 border-b border-slate-50">
          <span className="text-slate-500">User ID (auth.users.id):</span>
          <span className="font-mono text-slate-800 font-bold">{user.id}</span>
        </div>
        <div className="flex justify-between py-1.5 border-b border-slate-50">
          <span className="text-slate-500">Account Created:</span>
          <span className="text-slate-700">{new Date(user.created_at).toLocaleString()}</span>
        </div>
        <div className="flex justify-between py-1.5 border-b border-slate-50">
          <span className="text-slate-500">Row Level Security Status:</span>
          <span className="font-semibold text-emerald-600">Active (Isolated to your records)</span>
        </div>
      </div>

      <div className="pt-2">
        <button
          onClick={onSignOut}
          className="w-full py-2 px-4 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">logout</span>
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
};
