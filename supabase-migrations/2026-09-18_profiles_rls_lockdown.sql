-- Close the profiles UPDATE hole.
--
-- The policy said which ROW a user may update but never which COLUMNS, and
-- Postgres/Supabase grant `authenticated` UPDATE on every column of a public
-- table by default. Nothing in this repo ever narrowed that — there is not a
-- single GRANT or REVOKE in the schema or the migrations.
--
-- tier, subscription_status, current_period_end, tier_source, trial_started_at
-- and stripe_customer_id all live on that row, and the anon key is published to
-- the browser (correctly — it is meant to be). So any signed-in user could run
--
--   SB.from('profiles').update({tier:'pro',subscription_status:'lifetime'})
--     .eq('id', APP_USER.id)
--
-- and become a permanent subscriber. Not merely a UI bypass: the server reads
-- those same columns back. natalAuth() feeds them to isProEffective(), so a
-- forged row also unlocks the paid Claude readings billed to our API key.
--
-- The policy is dropped rather than narrowed because nothing uses it. Every
-- write to profiles goes through the service-role key on the server (40 call
-- sites); the only client reference is a SELECT in public/js/auth.js. Dropping
-- it removes the surface entirely instead of leaving a policy that is one
-- forgotten column away from being a hole again.
--
-- Reading is unaffected: the SELECT policy stays, so the app still loads its own
-- profile exactly as before.

drop policy if exists "Users update own profile" on public.profiles;

-- Belt and braces: even if a future policy is added without a column list, the
-- entitlement columns stay unwritable from the browser. Revoke first, then
-- grant back only what a profile editor could legitimately need.
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, locale) on public.profiles to authenticated;

-- If a profile editor is ever added, it needs a policy again. Use this shape —
-- note the WITH CHECK, without which a row can be re-keyed to another user on
-- the way out:
--
--   create policy "Users update own profile" on public.profiles
--     for update using (auth.uid() = id) with check (auth.uid() = id);
--
-- The column grant above is what actually bounds it.
