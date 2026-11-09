-- "Start a video at the right moment" (YouTube) stopped at "Copy the link", leaving teachers with a
-- timestamped link and no next step. Add two closing steps: play it in Google Slides, or send it to
-- students. The Slides wording matches the "Add this moment to Google Slides" card in
-- src/content/youtube.js (Insert → Video → By URL, paste, Select).
--
-- This tip came from the team's catalog, not our seed migrations, so it is matched by title. Safe to
-- re-run: skips when the tip is missing or already has steps after step 2. Both new steps are
-- `your_turn` because they happen outside YouTube, where no overlay can be drawn. The parentheses in
-- step 4 keep the side panel from splitting the list of places into separate actions.
do $$
declare t bigint;
begin
  select tip_id into t from public.tips
    where url_pattern = 'youtube.com' and title = 'Start a video at the right moment';

  if t is null then
    raise notice 'youtube start-at tip not found — skipping';
  elsif exists (select 1 from public.tip_steps where tip_id = t and step_order > 2) then
    raise notice 'youtube start-at link steps already added — skipping';
  else
    update public.tips set
      description = 'Pause where you want to start, click Share, check "Start at", and copy the link. Paste it into Slides, Classroom, or an email, and students land on that exact moment instead of the intro.',
      estimated_required_minutes = 2,
      keywords = 'timestamp, skip, start at, video clip, share link, part of video, google slides, classroom, paste link'
      where tip_id = t;

    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 3, 'your_turn', null, 'To play it in Google Slides: choose Insert → Video → By URL, paste the link, then click Select. The video plays on the slide from your chosen time.'),
      (t, 4, 'your_turn', null, 'To send it to students: paste the link where they''ll click it (a Google Classroom post, your LMS, an email, or a doc). Students who open it start right at your chosen time.');
  end if;
end $$;
