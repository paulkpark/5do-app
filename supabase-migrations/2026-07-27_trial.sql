-- 72-hour free trial: every logged-in free user gets full Pro-feature access
-- for 72h, anchored to when the trial was first stamped (set once, server-side).
alter table public.profiles add column if not exists trial_started_at timestamptz;
