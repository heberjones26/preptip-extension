-- Usage events for OKR tracking.
-- Shared table: OKR 2 (tip completions — Conner) and OKR 3/4 (app usage — Carlos) both write here.
-- Same trust model as feedback: the extension's publishable (anon) key may only INSERT; it can never
-- read raw rows. Aggregates come out only through the security-definer functions below.

create table public.events (
  event_id    bigint generated always as identity primary key,
  event_type  text not null check (event_type in ('app_open', 'tip_open', 'tip_complete', 'tip_dwell_success', 'resource_open')),
  user_id     bigint references public.users(user_id) on delete set null,
  tip_id      bigint references public.tips(tip_id) on delete set null,
  url_pattern text,
  label       text,   -- free-text name for events not tied to a tip (e.g. the resource opened)
  created_at  timestamptz not null default now()
);

alter table public.events enable row level security;

-- Anyone with the publishable key can log an event (of a known type), but nobody can read, edit or
-- delete events with it.
create policy "Public can log events"
  on public.events for insert to anon, authenticated
  with check (event_type in ('app_open', 'tip_open', 'tip_complete', 'tip_dwell_success', 'resource_open'));

create index events_type_idx on public.events (event_type);
create index events_created_idx on public.events (created_at);

-- OKR 2 (Conner): "the amount of tips that go through 100% of the steps."
--   opens       = walkthroughs started  (tip_open, logged when a teacher opens a tip)
--   completions = walkthroughs finished (tip_complete, logged at the "Nice work!" screen)
-- Exposes only the two totals, never raw rows.
create or replace function public.okr_tip_completions()
returns table (opens bigint, completions bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) filter (where event_type = 'tip_open'),
    count(*) filter (where event_type = 'tip_complete')
  from public.events;
$$;

revoke all on function public.okr_tip_completions() from public;
grant execute on function public.okr_tip_completions() to anon, authenticated;

-- Most-opened Common Teacher Resources, for the dashboard. Exposes only the per-resource open counts.
create or replace function public.resource_opens()
returns table (label text, opens bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select label, count(*)
  from public.events
  where event_type = 'resource_open' and label is not null
  group by label
  order by count(*) desc;
$$;

revoke all on function public.resource_opens() from public;
grant execute on function public.resource_opens() to anon, authenticated;

-- ── Objective B (Carlos owns these) ─────────────────────────────────────────────────────────
-- The shared events above already capture what OKR 3 & 4 need. Carlos adds the aggregate functions
-- (same security-definer pattern as above) plus the extension logging for the events marked (Carlos):
--   app_open           (Carlos) one row each time the side panel opens  → OKR 3 days-open, OKR 4 denominator
--   tip_open           (logged here, by Conner's walkthrough code)       → OKR 4 engagement numerator input
--   tip_dwell_success  (Carlos) one row when a teacher stays on a tip ≥10s → OKR 4 "successful use"
-- Suggested signatures, returning totals only:
--   create function public.okr_app_usage()      returns table (teachers bigint, avg_days_open numeric) ...
--   create function public.okr_tip_engagement() returns table (opens bigint, engaged bigint) ...
