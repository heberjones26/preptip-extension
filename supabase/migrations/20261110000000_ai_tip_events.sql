-- How often teachers use the AI tip builder. Counts only: the question, the prompt and the AI's answer
-- are never stored or sent to Supabase.
--   ai_prompt_copied  a teacher copied the prompt to paste into ChatGPT / Claude / Gemini
--   ai_tip_pasted     a teacher pasted an answer back and PrepTip turned it into a tip
--   ai_tip_gemini     PrepTip built a tip with the teacher's own Gemini key
-- Extends the event types allowed by 20261101000000_usage_events.sql (already applied), so it replaces
-- the CHECK constraint and the insert policy with the longer list. Needs that migration first.

alter table public.events drop constraint if exists events_event_type_check;
alter table public.events add constraint events_event_type_check
  check (event_type in ('app_open', 'tip_open', 'tip_complete', 'tip_dwell_success', 'resource_open',
                        'ai_prompt_copied', 'ai_tip_pasted', 'ai_tip_gemini'));

drop policy if exists "Public can log events" on public.events;
create policy "Public can log events"
  on public.events for insert to anon, authenticated
  with check (event_type in ('app_open', 'tip_open', 'tip_complete', 'tip_dwell_success', 'resource_open',
                             'ai_prompt_copied', 'ai_tip_pasted', 'ai_tip_gemini'));

-- Totals for the dashboard over the last p_days (1..90).
create or replace function public.ai_tip_summary(p_days int default 30)
returns table (prompts_copied bigint, built_from_paste bigint, built_with_gemini bigint, teachers bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) filter (where event_type = 'ai_prompt_copied'),
    count(*) filter (where event_type = 'ai_tip_pasted'),
    count(*) filter (where event_type = 'ai_tip_gemini'),
    count(distinct user_id)
  from public.events
  where event_type in ('ai_prompt_copied', 'ai_tip_pasted', 'ai_tip_gemini')
    and created_at >= now() - make_interval(days => least(greatest(p_days, 1), 90));
$$;

revoke all on function public.ai_tip_summary(int) from public;
grant execute on function public.ai_tip_summary(int) to anon, authenticated;
