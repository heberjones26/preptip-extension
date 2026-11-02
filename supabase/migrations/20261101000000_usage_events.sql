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
  session_id  text,   -- a panel-open session, linking app_open to the tip_dwell_success events in it (OKR 4)
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

-- ── Objective B (OKR 3 & 4): aggregates over the usage events ────────────────────────────────
-- The extension's engagement tracking (Carlos) writes `app_open` and `tip_dwell_success` rows to this
-- table (alongside its per-browser store), so these functions can summarise across all teachers for the
-- dashboard. Both expose only totals, never raw rows.

-- OKR 3: teachers open the app ~3 of 5 office days. Counts distinct office days (Mon–Fri) with an
-- app_open per teacher, for the current ISO week.
create or replace function public.okr_app_usage()
returns table (teachers bigint, qualifying bigint, avg_office_days numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with per_teacher as (
    select user_id,
           count(distinct created_at::date) filter (where extract(isodow from created_at) between 1 and 5) as office_days
    from public.events
    where event_type = 'app_open'
      and user_id is not null
      and date_trunc('week', created_at) = date_trunc('week', now())
    group by user_id
  )
  select count(*)::bigint,
         count(*) filter (where office_days >= 3)::bigint,
         coalesce(round(avg(office_days), 2), 0)::numeric
  from per_teacher;
$$;

revoke all on function public.okr_app_usage() from public;
grant execute on function public.okr_app_usage() to anon, authenticated;

-- OKR 4: of the times the app is opened, how many lead to a ≥10s tip view.
-- opens = distinct panel-open sessions; engaged = distinct sessions that had a ≥10s view.
create or replace function public.okr_tip_engagement()
returns table (opens bigint, engaged bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(distinct session_id) filter (where event_type = 'app_open'),
    count(distinct session_id) filter (where event_type = 'tip_dwell_success')
  from public.events
  where session_id is not null;
$$;

revoke all on function public.okr_tip_engagement() from public;
grant execute on function public.okr_tip_engagement() to anon, authenticated;
