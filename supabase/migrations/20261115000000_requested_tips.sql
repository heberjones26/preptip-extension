-- Requested tips: the backlog of tips teachers asked for, for the metrics hub.
-- The extension stores a request as a feedback row with no tip: "Tip request (<site>): <wording>"
-- (or "Tip request: <wording>" when no site is known); resource suggestions are "Resource request: <wording>".
-- The public (anon) key can't read feedback, and the hub is public, so this one function is the only
-- way out: it returns the wording with anything personal scrubbed, never who wrote it, and counts
-- teachers instead of naming them. Requests from before this migration were stored unscrubbed, so the
-- scrubbing happens here, when rows are read, not only in the extension.

-- Strip what could identify a person or a page: web addresses, email addresses, keys and long tokens,
-- and phone-like digit runs. Mirrors scrub() in src/lib/errors.js.
create or replace function public.scrub_public_text(p_text text, p_max int default 300)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  t text := coalesce(p_text, '');
begin
  t := regexp_replace(t, '\m[a-zA-Z][a-zA-Z0-9+.-]*://\S+', '[url]', 'g');   -- https://…
  t := regexp_replace(t, '\mwww\.\S+', '[url]', 'g');                       -- www.…
  t := regexp_replace(t, '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+', '[email]', 'g');
  t := regexp_replace(t, '\m(sk-|AIza|ghp_|gho_|sb_)[A-Za-z0-9_-]{8,}', '[key]', 'g');
  t := regexp_replace(t, '[A-Za-z0-9_-]{32,}', '[token]', 'g');
  t := regexp_replace(t, '\d[0-9 ().-]{6,}\d', '[number]', 'g');             -- phone / ID-like digit runs
  t := btrim(regexp_replace(t, '\s+', ' ', 'g'));
  return left(t, greatest(p_max, 1));
end;
$$;

-- Internal helper: only requested_tips() (which runs as its owner) uses it.
revoke all on function public.scrub_public_text(text, int) from public, anon, authenticated;

-- The requests of the last p_days (1..365), identical wording on the same site grouped together,
-- most-requested first. kind is 'tip' or 'resource'; site is null when the teacher wasn't on a known site.
create or replace function public.requested_tips(p_days int default 90)
returns table (
  kind text, site text, wording text,
  requests bigint, teachers bigint, first_requested timestamptz, last_requested timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with parsed as (
    select f.user_id, f.created_at,
           case when f.feedback_text like 'Resource request:%' then 'resource' else 'tip' end as kind,
           m.parts
    from public.feedback f
    cross join lateral (
      select regexp_match(f.feedback_text, '^(?:Tip|Resource) request(?: \(([^)]*)\))?:\s*(.*)$', 's') as parts
    ) m
    where f.tip_id is null
      and f.feedback_text ~ '^(Tip|Resource) request'
      and f.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 365))
  ),
  cleaned as (
    select kind, user_id, created_at,
           nullif(public.scrub_public_text(parts[1], 60), '') as site,
           public.scrub_public_text(parts[2], 300) as wording
    from parsed
    where parts is not null
  )
  select c.kind, c.site, min(c.wording),
         count(*), count(distinct c.user_id), min(c.created_at), max(c.created_at)
  from cleaned c
  where char_length(c.wording) >= 3
  group by c.kind, c.site, lower(c.wording)
  order by count(*) desc, max(c.created_at) desc
  limit 200;
$$;

revoke all on function public.requested_tips(int) from public;
grant execute on function public.requested_tips(int) to anon, authenticated;
