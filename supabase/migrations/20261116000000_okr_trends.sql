-- OKR 3 and 4 over time. okr_app_usage() and okr_tip_engagement() only answer "how are we doing
-- right now" (OKR 3 resets every Monday), so the hub can't show whether usage is growing. These
-- return the same figures week by week, oldest first, including weeks with no activity.
-- Needs the usage_events migration (events table, session_id, okr_app_usage, okr_tip_engagement).
-- Same trust model as the other okr_* functions: aggregates only, no user ids returned.

-- OKR 3 per week: teachers who opened the app, how many opened it on >= 3 office days (Mon-Fri),
-- and the average office days per teacher. Same counting rule as okr_app_usage(), once per week.
create or replace function public.okr_app_usage_weekly(p_weeks int default 8)
returns table (week_start date, teachers bigint, qualifying bigint, avg_office_days numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with span as (
    select date_trunc('week', now())::date as this_week,
           least(greatest(p_weeks, 1), 26) as n
  ),
  weeks as (
    select (s.this_week - 7 * g)::date as week_start
    from span s, generate_series(0, (select n - 1 from span)) as g
  ),
  per_teacher as (
    select date_trunc('week', e.created_at)::date as week_start,
           e.user_id,
           count(distinct e.created_at::date) filter (where extract(isodow from e.created_at) between 1 and 5) as office_days
    from public.events e, span s
    where e.event_type = 'app_open'
      and e.user_id is not null
      and e.created_at >= s.this_week - 7 * (s.n - 1)
    group by 1, 2
  )
  select w.week_start,
         count(p.user_id),
         count(p.user_id) filter (where p.office_days >= 3),
         coalesce(round(avg(p.office_days), 2), 0)::numeric
  from weeks w
  left join per_teacher p on p.week_start = w.week_start
  group by w.week_start
  order by w.week_start;
$$;

-- This week's spread: how many teachers opened the app on 0, 1, 2 ... 5 office days (0 = only on a
-- weekend). Always returns all six rows so the hub can draw a fixed set of bars.
create or replace function public.okr_app_usage_distribution()
returns table (office_days int, teachers bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with per_teacher as (
    select e.user_id,
           count(distinct e.created_at::date) filter (where extract(isodow from e.created_at) between 1 and 5)::int as office_days
    from public.events e
    where e.event_type = 'app_open'
      and e.user_id is not null
      and date_trunc('week', e.created_at) = date_trunc('week', now())
    group by e.user_id
  )
  select d, count(p.user_id)
  from generate_series(0, 5) as d
  left join per_teacher p on p.office_days = d
  group by d
  order by d;
$$;

-- OKR 4 per week: panel openings (distinct sessions with an app_open) and how many sessions had a
-- tip view of more than 10 seconds (tip_dwell_success), by the week the event happened.
create or replace function public.okr_tip_engagement_weekly(p_weeks int default 8)
returns table (week_start date, opens bigint, engaged bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with span as (
    select date_trunc('week', now())::date as this_week,
           least(greatest(p_weeks, 1), 26) as n
  ),
  weeks as (
    select (s.this_week - 7 * g)::date as week_start
    from span s, generate_series(0, (select n - 1 from span)) as g
  )
  select w.week_start,
         count(distinct e.session_id) filter (where e.event_type = 'app_open'),
         count(distinct e.session_id) filter (where e.event_type = 'tip_dwell_success')
  from weeks w
  left join public.events e
         on date_trunc('week', e.created_at)::date = w.week_start
        and e.session_id is not null
        and e.event_type in ('app_open', 'tip_dwell_success')
  group by w.week_start
  order by w.week_start;
$$;

revoke all on function public.okr_app_usage_weekly(int) from public;
revoke all on function public.okr_app_usage_distribution() from public;
revoke all on function public.okr_tip_engagement_weekly(int) from public;
grant execute on function public.okr_app_usage_weekly(int) to anon, authenticated;
grant execute on function public.okr_app_usage_distribution() to anon, authenticated;
grant execute on function public.okr_tip_engagement_weekly(int) to anon, authenticated;
