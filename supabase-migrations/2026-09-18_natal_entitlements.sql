-- 5DOracle entitlements — what a customer has bought.
--
-- The natal reading is sold two ways now. Inside 5DO it comes with a Pro
-- subscription, checked against profiles.tier by isProEffective(). On 5doracle.com
-- it is bought one chart at a time, and that is what this table records.
--
-- The unit is (user, chart, language), matching natal_readings exactly. Language
-- is part of it because ko and en are separately written originals, not
-- translations: each is generated on first use in that language and billed once,
-- so one payment opening both would double the cost of every sale.
--
-- Deep mode (Opus) is deliberately not included in the per-chart price; the
-- column records it for the day it is sold separately.

create table if not exists public.natal_entitlements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  -- Same key natal_readings uses, built by the client (ui/app.js chartKey()).
  chart_key   text not null,
  lang        text not null check (lang in ('ko','en')),
  -- 'purchase' cost money; 'grant' is a manual comp or a support fix.
  source      text not null default 'purchase' check (source in ('purchase','grant')),
  provider    text,          -- 'toss' | 'stripe' | null for a grant
  order_id    text,          -- the provider's order / session id
  amount      int,           -- minor units actually charged, for reconciliation
  currency    text,
  deep        boolean not null default false,
  created_at  timestamptz default now(),
  unique (user_id, chart_key, lang)
);

create index if not exists natal_entitlements_user_idx
  on public.natal_entitlements(user_id);

-- A payment callback can arrive more than once. Without this a replay would
-- insert a second row for a different chart on the same order id and nobody
-- would notice until the books were reconciled.
create unique index if not exists natal_entitlements_order_idx
  on public.natal_entitlements(order_id) where order_id is not null;

-- ── the per-user chart cap, now product-aware ────────────────────────────
--
-- The cap exists to bound what one subscription can spend. A bought chart has
-- already paid for itself, so it must not count — otherwise a customer's fourth
-- purchase would be refused after they had been charged.
--
-- Entitlements are written when the payment settles, which is before the chart
-- row is created on first generation, so the exists() below is reliable.
create or replace function public.natal_charts_cap() returns trigger
language plpgsql as $$
declare n int;
begin
  -- This chart is bought: no cap applies.
  if exists (
    select 1 from public.natal_entitlements e
    where e.user_id = new.user_id and e.chart_key = new.chart_key
  ) then
    return new;
  end if;

  -- Otherwise count only the charts that are not backed by a purchase.
  select count(*) into n
  from public.natal_charts c
  where c.user_id = new.user_id
    and not exists (
      select 1 from public.natal_entitlements e
      where e.user_id = c.user_id and e.chart_key = c.chart_key
    );

  if n >= 3 then
    raise exception 'natal chart limit reached (3)' using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists natal_charts_cap_trg on public.natal_charts;
create trigger natal_charts_cap_trg
  before insert on public.natal_charts
  for each row execute function public.natal_charts_cap();

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Read your own; never write. Every insert goes through a settled payment on the
-- server, and a client-side insert would be a free reading.
alter table public.natal_entitlements enable row level security;
drop policy if exists "read own natal entitlements" on public.natal_entitlements;
create policy "read own natal entitlements" on public.natal_entitlements
  for select using (auth.uid() = user_id);
