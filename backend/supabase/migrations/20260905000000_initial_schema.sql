-- Supabase Schema & Row Level Security for AdaptiFlow
-- Project: tfrwihdaljpvkibvurcs

-- 1. workload_runs: Tracks overarching simulation or traffic runs
CREATE TABLE IF NOT EXISTS public.workload_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    scenario TEXT NOT NULL,
    configured_distribution JSONB DEFAULT '{}'::jsonb,
    actual_distribution JSONB DEFAULT '{}'::jsonb,
    start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    end_time TIMESTAMPTZ,
    total_events INTEGER DEFAULT 0,
    processed INTEGER DEFAULT 0,
    queued INTEGER DEFAULT 0,
    shed INTEGER DEFAULT 0,
    retries INTEGER DEFAULT 0,
    duplicates INTEGER DEFAULT 0,
    peak_pressure REAL DEFAULT 0.0,
    maximum_workers INTEGER DEFAULT 2,
    avg_latency REAL DEFAULT 0.0,
    status TEXT DEFAULT 'RUNNING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. event_logs: Detailed audit record of pipeline event processing
CREATE TABLE IF NOT EXISTS public.event_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES public.workload_runs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    priority TEXT NOT NULL,
    strategy TEXT NOT NULL,
    status TEXT NOT NULL,
    audit_reason TEXT,
    worker_id TEXT,
    processing_latency REAL,
    retry_count INTEGER DEFAULT 0,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. retry_logs: Records worker failure isolations and retry attempts
CREATE TABLE IF NOT EXISTS public.retry_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES public.workload_runs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    attempt INTEGER NOT NULL,
    status TEXT NOT NULL,
    worker_id TEXT,
    backoff INTEGER,
    failure_reason TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. duplicate_logs: Records admission deduplication blocks
CREATE TABLE IF NOT EXISTS public.duplicate_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES public.workload_runs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    original_event_reference TEXT,
    reason TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. scaling_events: Records dynamic worker pool scale up / down actions
CREATE TABLE IF NOT EXISTS public.scaling_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES public.workload_runs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL,
    action TEXT NOT NULL,
    previous_worker_count INTEGER NOT NULL,
    new_worker_count INTEGER NOT NULL,
    queue_pressure REAL,
    utilization REAL,
    backlog INTEGER,
    decision_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. decision_logs: Records formalized multi-variable decision evaluations
CREATE TABLE IF NOT EXISTS public.decision_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES public.workload_runs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL,
    queue_pressure REAL,
    worker_utilization REAL,
    latency REAL,
    data_size REAL,
    cost_pressure REAL,
    priority TEXT NOT NULL,
    score REAL NOT NULL,
    strategy TEXT NOT NULL,
    explanation TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_workload_runs_user_time ON public.workload_runs (user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_event_logs_user_run ON public.event_logs (user_id, run_id);
CREATE INDEX IF NOT EXISTS idx_event_logs_user_event ON public.event_logs (user_id, event_id);
CREATE INDEX IF NOT EXISTS idx_retry_logs_user_run ON public.retry_logs (user_id, run_id);
CREATE INDEX IF NOT EXISTS idx_duplicate_logs_user_run ON public.duplicate_logs (user_id, run_id);
CREATE INDEX IF NOT EXISTS idx_scaling_events_user_run ON public.scaling_events (user_id, run_id);
CREATE INDEX IF NOT EXISTS idx_decision_logs_user_run ON public.decision_logs (user_id, run_id);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.workload_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retry_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duplicate_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scaling_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workload_runs
DROP POLICY IF EXISTS "Users can view their own runs" ON public.workload_runs;
CREATE POLICY "Users can view their own runs" ON public.workload_runs FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own runs" ON public.workload_runs;
CREATE POLICY "Users can insert their own runs" ON public.workload_runs FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own runs" ON public.workload_runs;
CREATE POLICY "Users can update their own runs" ON public.workload_runs FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own runs" ON public.workload_runs;
CREATE POLICY "Users can delete their own runs" ON public.workload_runs FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for event_logs
DROP POLICY IF EXISTS "Users can view their own event logs" ON public.event_logs;
CREATE POLICY "Users can view their own event logs" ON public.event_logs FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own event logs" ON public.event_logs;
CREATE POLICY "Users can insert their own event logs" ON public.event_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for retry_logs
DROP POLICY IF EXISTS "Users can view their own retry logs" ON public.retry_logs;
CREATE POLICY "Users can view their own retry logs" ON public.retry_logs FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own retry logs" ON public.retry_logs;
CREATE POLICY "Users can insert their own retry logs" ON public.retry_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for duplicate_logs
DROP POLICY IF EXISTS "Users can view their own duplicate logs" ON public.duplicate_logs;
CREATE POLICY "Users can view their own duplicate logs" ON public.duplicate_logs FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own duplicate logs" ON public.duplicate_logs;
CREATE POLICY "Users can insert their own duplicate logs" ON public.duplicate_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for scaling_events
DROP POLICY IF EXISTS "Users can view their own scaling events" ON public.scaling_events;
CREATE POLICY "Users can view their own scaling events" ON public.scaling_events FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own scaling events" ON public.scaling_events;
CREATE POLICY "Users can insert their own scaling events" ON public.scaling_events FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for decision_logs
DROP POLICY IF EXISTS "Users can view their own decision logs" ON public.decision_logs;
CREATE POLICY "Users can view their own decision logs" ON public.decision_logs FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own decision logs" ON public.decision_logs;
CREATE POLICY "Users can insert their own decision logs" ON public.decision_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
