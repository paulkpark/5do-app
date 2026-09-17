-- Natal chart readings — permanent per-section cache.
--
-- Why cache at all: a full reading is ~14 sections at roughly $0.4 total, and a
-- birth chart never changes. Sections 2-13 and 15 are therefore generated once
-- per (user, chart, language) and kept forever; re-reading a saved chart costs
-- nothing. Section 14 is the exception — it covers profection, transits and
-- progressions, which move — so it alone may be regenerated, on a manual button
-- with a 30-day cooldown (profections turn on the birthday, not the calendar
-- month, so a fixed monthly schedule would drift out of step with the chart).
--
-- Language is part of the key, not a translation: ko and en prompts are written
-- separately, so each language is generated on first use in that language and
-- billed once. Nothing is pre-generated.

-- 1. The cache. One row per section of one chart in one language.
create table if not exists public.natal_readings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  -- year|month|day|hour|minute|lat|lon|timeUnknown, built by the client
  -- (ui/app.js chartKey()). Coordinates carry 4 decimals, so the same birth
  -- data always produces the same key.
  chart_key    text not null,
  lang         text not null check (lang in ('ko','en')),
  section      int  not null check (section between 2 and 15),
  body         text not null,
  model        text not null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (user_id, chart_key, lang, section)
);

-- Loading a chart reads every section for one (user, chart, lang) at once.
create index if not exists natal_readings_lookup_idx
  on public.natal_readings(user_id, chart_key, lang);

-- 2. Charts. Separate from the readings so the per-subscriber cap counts charts
--    the user actually created, independent of how many sections exist in
--    either language — and so a chart keeps its label and last-opened time.
create table if not exists public.natal_charts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  chart_key      text not null,
  label          text,                      -- 'Me', a friend's name, …
  -- Section 14 only. Null until the timing section is first generated.
  timing_at      timestamptz,
  created_at     timestamptz default now(),
  last_opened_at timestamptz default now(),
  unique (user_id, chart_key)
);
create index if not exists natal_charts_user_idx on public.natal_charts(user_id);

-- 3. Cap charts per user at 3, in the database as well as the server: the limit
--    exists to bound spend, and a check living only in one request handler is
--    one refactor away from being bypassed. Insert-only — an update never adds
--    a chart. Two simultaneous inserts could both read 2 and both land, since a
--    counting trigger takes no lock; the server checks first, and being one
--    chart over from a genuine double-submit is not worth serializing writes.
create or replace function public.natal_charts_cap() returns trigger
language plpgsql as $$
declare n int;
begin
  select count(*) into n from public.natal_charts where user_id = new.user_id;
  if n >= 3 then
    raise exception 'natal chart limit reached (3)' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists natal_charts_cap_trg on public.natal_charts;
create trigger natal_charts_cap_trg
  before insert on public.natal_charts
  for each row execute function public.natal_charts_cap();

-- 4. RLS. The server writes with the service-role key (bypasses RLS). Users may
--    read their own rows so a future client could load the cache directly, but
--    never write: every insert goes through the subscription gate in
--    /api/natal/reading, and a client-side insert would route around it.
alter table public.natal_readings enable row level security;
drop policy if exists "read own natal readings" on public.natal_readings;
create policy "read own natal readings" on public.natal_readings
  for select using (auth.uid() = user_id);

alter table public.natal_charts enable row level security;
drop policy if exists "read own natal charts" on public.natal_charts;
create policy "read own natal charts" on public.natal_charts
  for select using (auth.uid() = user_id);
