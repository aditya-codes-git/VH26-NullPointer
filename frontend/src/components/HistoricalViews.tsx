import React, { useState, useEffect } from 'react';
import { getSessionToken } from '../services/supabaseClient';
import { User } from '@supabase/supabase-js';

const API_BASE = 'http://localhost:4000/api';

// ==========================================================
// 1. Event History View
// ==========================================================
export const EventHistoryView: React.FC<{ user: User | null; selectedRunId?: string | null }> = ({
  user,
  selectedRunId,
}) => {
  const [events, setEvents] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [runIdFilter, setRunIdFilter] = useState(selectedRunId || '');
  const [page, setPage] = useState(0);
  const limit = 25;

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
      if (search) params.set('search', search);
      if (typeFilter) params.set('type', typeFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (strategyFilter) params.set('strategy', strategyFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (runIdFilter) params.set('runId', runIdFilter);

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
    } catch (err: any) {
      setError(err.message || 'Error fetching events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [user, page, typeFilter, priorityFilter, strategyFilter, statusFilter, runIdFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchEvents();
  };

  if (!user) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-slate-200">
        <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">lock</span>
        <h3 className="text-base font-bold text-slate-800">Authentication Required</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
          Sign in to view user-owned persistent event logs and query historical execution trails in Supabase.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Event History</h2>
            <p className="text-xs text-slate-500">
              Query audit trails stored in Supabase PostgreSQL with Row Level Security.
            </p>
          </div>
          <button
            onClick={fetchEvents}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            <span>Refresh</span>
          </button>
        </div>

        {/* Filter Controls */}
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-2 pt-2">
          <input
            type="text"
            placeholder="Search Event ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
          />

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(0);
            }}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="">All Types</option>
            <option value="ORDER">ORDER</option>
            <option value="PAYMENT">PAYMENT</option>
            <option value="INVENTORY">INVENTORY</option>
            <option value="CLICK">CLICK</option>
            <option value="LOG">LOG</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value);
              setPage(0);
            }}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="">All Priorities</option>
            <option value="CRITICAL">CRITICAL</option>
            <option value="HIGH">HIGH</option>
            <option value="LOW">LOW</option>
          </select>

          <select
            value={strategyFilter}
            onChange={(e) => {
              setStrategyFilter(e.target.value);
              setPage(0);
            }}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="">All Strategies</option>
            <option value="STREAM">STREAM</option>
            <option value="BATCH">BATCH</option>
            <option value="DEFER">DEFER</option>
            <option value="SHED">SHED</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
          >
            <option value="">All Statuses</option>
            <option value="PROCESSED">PROCESSED</option>
            <option value="SHED">SHED</option>
            <option value="FAILED">FAILED</option>
            <option value="PERMANENT_FAILURE">PERMANENT_FAILURE</option>
          </select>

          <button
            type="submit"
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Filter
          </button>
        </form>

        {runIdFilter && (
          <div className="flex items-center gap-2 pt-1 text-xs text-blue-700 bg-blue-50 px-3 py-1 rounded-lg">
            <span>Filtered by Run: <strong className="font-mono">{runIdFilter.slice(0, 8)}...</strong></span>
            <button
              onClick={() => {
                setRunIdFilter('');
                setPage(0);
              }}
              className="text-blue-500 hover:text-blue-800 ml-auto font-bold"
            >
              Clear Run Filter
            </button>
          </div>
        )}
      </div>

      {/* Events Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span>Loading historical events from Supabase...</span>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-rose-600 text-xs">
            <p className="font-bold">Error loading events</p>
            <p className="mt-1 text-slate-500">{error}</p>
          </div>
        ) : events.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-xs">
            <span className="material-symbols-outlined text-3xl mb-1">database</span>
            <p>No historical event logs found matching criteria.</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Start a simulation run while authenticated to stream and persist event records.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Event ID</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3">Strategy</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Latency</th>
                  <th className="py-2.5 px-3">Retries</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {events.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2 px-3 text-slate-800 font-bold truncate max-w-[140px]" title={evt.event_id}>
                      {evt.event_id}
                    </td>
                    <td className="py-2 px-3 font-sans">
                      <span className="font-semibold text-slate-700">{evt.event_type}</span>
                    </td>
                    <td className="py-2 px-3">
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
                    <td className="py-2 px-3">
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
                    <td className="py-2 px-3 font-sans">
                      <span
                        className={`font-semibold ${
                          evt.status === 'PROCESSED'
                            ? 'text-emerald-600'
                            : evt.status === 'SHED'
                            ? 'text-rose-600'
                            : evt.status === 'PERMANENT_FAILURE'
                            ? 'text-purple-600'
                            : 'text-amber-600'
                        }`}
                      >
                        {evt.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      {evt.processing_latency !== null ? `${Math.round(evt.processing_latency)}ms` : '—'}
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      {evt.retry_count || 0}
                    </td>
                    <td className="py-2 px-3 text-slate-400 text-[11px]">
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {total > limit && (
          <div className="flex justify-between items-center px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs">
            <span className="text-slate-500">
              Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total} records
            </span>
            <div className="flex gap-1.5">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded text-slate-700 disabled:opacity-40 hover:bg-slate-100"
              >
                Previous
              </button>
              <button
                disabled={(page + 1) * limit >= total}
                onClick={() => setPage((p) => p + 1)}
                className="px-2.5 py-1 bg-white border border-slate-300 rounded text-slate-700 disabled:opacity-40 hover:bg-slate-100"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
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
