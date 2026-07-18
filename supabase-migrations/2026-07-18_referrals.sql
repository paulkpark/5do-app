-- Referral system — two-sided free-Pro-days rewards.
-- Referrer +30 days, referred +14 days, both granted on the referred user's
-- FIRST paid conversion (not signup) to prevent fake-account farming.
-- Rewards extend profiles.current_period_end; free referrers get a 'promo'
-- status that expires at that date (see services/tier.js isProEffective).

-- 1. Per-user referral code + who referred them (bound once, at signup).
alter table public.profiles add column if not exists referral_code text unique;
alter table public.profiles add column if not exists referred_by uuid references public.profiles(id);

-- 2. Referral edges. unique(referred_id) enforces "each user referred at most once".
create table if not exists public.referrals (
  id                     uuid primary key default gen_random_uuid(),
  referrer_id            uuid not null references public.profiles(id) on delete cascade,
  referred_id            uuid not null references public.profiles(id) on delete cascade,
  status                 text not null default 'pending',  -- 'pending' | 'qualified'
  reward_referrer_days   int  default 0,
  reward_referred_days   int  default 0,
  created_at             timestamptz default now(),
  qualified_at           timestamptz,
  unique (referred_id)
);
create index if not exists referrals_referrer_idx on public.referrals(referrer_id);

-- 3. RLS. The server mutates via the service-role key (bypasses RLS); users may
--    read only their own edges (as referrer or referred).
alter table public.referrals enable row level security;
drop policy if exists "read own referrals" on public.referrals;
create policy "read own referrals" on public.referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referred_id);
