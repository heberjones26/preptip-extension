-- Error log: what goes wrong for teachers in the extension, so the team knows what to fix.
-- Two sources share one table:
--   auto      the extension caught a problem itself (a tip list that wouldn't load, a highlight that
--             couldn't find its target, a failed save, an uncaught script error)
--   reported  a teacher pressed "Report a problem" (covers things that work but are wrong)
-- Same trust model as feedback and events: the public (anon) key can only INSERT. Nothing here can be
-- read back as rows; the dashboard gets totals and grouped summaries from the functions below, and
-- teachers' free-text comments are never returned (read those in the Supabase table editor).
-- Needs the usage_events migration (for app opens) and the tips/users tables.

create table public.error_log (
  error_id    bigint generated always as identity primary key,
  source      text not null check (source in ('auto', 'reported')),
  category    text not null check (category in ('load', 'network', 'guide', 'ui', 'account', 'other')),
  context     text check (context is null or char_length(context) <= 80),   -- where, e.g. 'catalog', 'feedback', 'target-not-found step 2'
  message     text not null check (char_length(message) between 1 and 500),  -- scrubbed in the extension: no URLs, emails or keys
  tip_id      bigint references public.tips(tip_id) on delete set null,
  url_pattern text check (url_pattern is null or char_length(url_pattern) <= 120), -- a supported site, never the page URL
  user_id     bigint references public.users(user_id) on delete set null,
  version     text check (version is null or char_length(version) <= 20),    -- extension version
  created_at  timestamptz not null default now()
);

alter table public.error_log enable row level security;

create policy "Public can log errors"
  on public.error_log for insert to anon, authenticated
  with check (true);  -- the column checks above are the validation

create index error_log_created_idx on public.error_log (created_at);
create index error_log_user_idx on public.error_log (user_id, created_at);

-- Anyone with the public key can add rows (that's how the extension reports), so put a ceiling on it:
-- a flood of junk can't fill the table or bury real problems on the dashboard. The limits are well
-- above honest use (the extension itself sends at most ~20 automatic errors per session) and above a
-- real outage (many teachers hitting the same failure at once). A rejected insert is just a failed
-- request: the extension ignores it for automatic errors and tells the teacher for a report.
--   every source together: 300 rows per minute      one account: 100 rows per hour
create or replace function public.error_log_throttle()
returns trigger
language plpgsql
security definer       -- the public key can't read error_log, so counting has to bypass RLS
set search_path = ''
as $$
begin
  if (select count(*) from public.error_log where created_at > now() - interval '1 minute') >= 300 then
    raise exception 'error_log is receiving too many rows right now' using errcode = '54000';
  end if;
  if new.user_id is not null
     and (select count(*) from public.error_log where user_id = new.user_id and created_at > now() - interval '1 hour') >= 100 then
    raise exception 'too many error reports from this account' using errcode = '54000';
  end if;
  return new;
end;
$$;

create trigger error_log_throttle
  before insert on public.error_log
  for each row execute function public.error_log_throttle();

-- Headline numbers for a window of p_days (1..90): errors, split by source, teachers affected,
-- and app opens in the same window so the dashboard can show errors per 100 opens.
create or replace function public.error_summary(p_days int default 7)
returns table (total bigint, auto bigint, reported bigint, teachers bigint, opens bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*),
    count(*) filter (where e.source = 'auto'),
    count(*) filter (where e.source = 'reported'),
    count(distinct e.user_id),
    (select count(distinct ev.session_id)
       from public.events ev
      where ev.event_type = 'app_open'
        and ev.session_id is not null
        and ev.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 90)))
  from public.error_log e
  where e.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 90));
$$;

-- Errors per day, including days with none, oldest first.
create or replace function public.error_trend(p_days int default 7)
returns table (day date, n bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select d::date, count(e.error_id)
  from generate_series(
         now()::date - (least(greatest(p_days, 1), 90) - 1),
         now()::date,
         interval '1 day') as d
  left join public.error_log e on e.created_at::date = d::date
  group by d
  order by d;
$$;

-- The issues behind the numbers: identical problems grouped, most frequent first.
--   auto      grouped by its (scrubbed) message, so 'Failed to fetch' and a 503 are separate issues
--   reported  grouped by the reason the teacher picked; the comment they typed is NOT returned.
--             Only the fixed reasons below come back, so nothing typed can surface on a public page.
create or replace function public.error_groups(p_days int default 7)
returns table (
  source text, category text, context text, detail text, tip_title text, site_name text,
  n bigint, teachers bigint, first_seen timestamptz, last_seen timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with scoped as (
    select e.*,
           case when e.source = 'auto'
                then e.message
                else case when split_part(e.message, ':', 1) in (
                       'The steps didn’t match my screen',
                       'The highlight was in the wrong place',
                       'Something didn’t load',
                       'Something else')
                     then split_part(e.message, ':', 1)
                     else 'Other report' end
           end as detail_text
    from public.error_log e
    where e.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 90))
  )
  select s.source, s.category, s.context, s.detail_text, t.title, w.name,
         count(*), count(distinct s.user_id), min(s.created_at), max(s.created_at)
  from scoped s
  left join public.tips t on t.tip_id = s.tip_id
  left join public.websites w on w.url_pattern = coalesce(t.url_pattern, s.url_pattern)
  group by s.source, s.category, s.context, s.detail_text, t.title, w.name
  order by count(*) desc, max(s.created_at) desc
  limit 100;
$$;

revoke all on function public.error_summary(int) from public;
revoke all on function public.error_trend(int) from public;
revoke all on function public.error_groups(int) from public;
grant execute on function public.error_summary(int) to anon, authenticated;
grant execute on function public.error_trend(int) to anon, authenticated;
grant execute on function public.error_groups(int) to anon, authenticated;
