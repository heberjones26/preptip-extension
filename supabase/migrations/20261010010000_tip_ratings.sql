-- Helpful counts per tip, so the side panel can show "N teachers found this helpful".
-- feedback stays closed to the public key; this function exposes only the totals.
create or replace function public.tip_ratings()
returns table (tip_id bigint, helpful_count bigint, rating_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select f.tip_id,
         count(*) filter (where f.is_helpful),
         count(*) filter (where f.is_helpful is not null)
  from public.feedback f
  where f.tip_id is not null
  group by f.tip_id;
$$;

revoke all on function public.tip_ratings() from public;
grant execute on function public.tip_ratings() to anon, authenticated;
