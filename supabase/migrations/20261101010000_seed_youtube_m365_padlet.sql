-- Card 3 seed: three new supported sites with 10 teacher tips each.
-- Sites chosen by the "teachers are a minority audience" rule (not teacher-built tools):
--   YouTube, Microsoft 365 (Office on the web), Padlet.
-- No extension code change is needed — matchSite() reads these url_patterns straight from `websites`.
--
-- Safe to re-run: each site's block only inserts when that website row doesn't already exist.
-- Highlight kinds that actually draw an overlay: menu, button, link, search, panel, dialog. Other
-- steps (and every `your_turn` step) show their instructions in the panel only.

-- ============================================================================================
-- 1. YouTube
-- ============================================================================================
do $$
declare t bigint;
begin
  -- Guard on one of OUR own titles (not "Start a video…", which the team already has in the catalog
  -- — guarding on that would skip this whole block). youtube.com also already exists as a website.
  if exists (select 1 from public.tips where url_pattern = 'youtube.com' and title = 'Turn on captions') then
    raise notice 'youtube tips already seeded — skipping';
  else
    -- The website row may already exist in the live catalog; add it only if missing, then seed the tips.
    insert into public.websites (url_pattern, name)
      select 'youtube.com', 'YouTube' where not exists (select 1 from public.websites where url_pattern = 'youtube.com');

    -- "Start a video at the right moment" is intentionally omitted: the team already has a YouTube
    -- timestamp tip in the catalog, so we skip ours to avoid a duplicate and seed the other nine.

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('youtube.com', 'Turn on captions',
        'Show subtitles so every student can follow along.',
        'Captions help English learners and anyone in a noisy room. One click turns them on for the current video.',
        'Subtitles / CC', 1, 'captions, subtitles, cc, closed captions, accessibility') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Subtitles/CC', 'In the player controls, click the Subtitles/CC button. A line under it means captions are on.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('youtube.com', 'Slow a video down',
        'Play at a slower speed for note-taking or language practice.',
        'Dropping to 0.75x gives students time to write things down or follow a fast speaker.',
        'Playback speed', 1, 'speed, slow down, playback, slower, 0.5x, 0.75x') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Settings', 'Click the gear-shaped Settings button in the player.'),
      (t, 2, 'guided', 'menu:Playback speed', 'Choose Playback speed from the menu.'),
      (t, 3, 'your_turn', null, 'Pick 0.75 (or slower). The video keeps playing at the new speed.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('youtube.com', 'Loop a short clip',
        'Repeat a clip during an activity without touching the mouse.',
        'Great for a warm-up song, a timer, or a short demo you want running on repeat.',
        'Loop', 1, 'loop, repeat, replay, on repeat') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'your_turn', null, 'Right-click directly on the video picture.'),
      (t, 2, 'your_turn', null, 'Choose Loop from the small menu that appears. It will replay until you turn Loop back off.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('youtube.com', 'Make a playlist for a unit',
        'Group videos so they play in order, back to back.',
        'Build a playlist once and every class gets the same videos in the same order — no hunting between periods.',
        'Save to playlist', 3, 'playlist, save, unit, series, queue, in order') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Save', 'Click Save under the video.'),
      (t, 2, 'your_turn', null, 'Choose New playlist and give it a name, like "Cell Biology - Day 1".'),
      (t, 3, 'your_turn', null, 'Set who can see it, then add more videos with Save the same way.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('youtube.com', 'Clip the exact moment you want',
        'Grab a short segment to share instead of the whole video.',
        'Clips let you share a 30-second moment without editing anything — students only see the part that matters.',
        'Clip', 2, 'clip, short segment, highlight, trim, snippet') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Clip', 'Click Clip under the video (you may need the "..." more menu).'),
      (t, 2, 'your_turn', null, 'Drag the two handles to the start and end of the moment you want.'),
      (t, 3, 'your_turn', null, 'Name the clip and click Share Clip to get a link.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('youtube.com', 'Make the video fill the screen',
        'Go full screen for the class display or projector.',
        'Full screen hides the comments and recommendations so the class only sees the video.',
        'Full screen', 1, 'full screen, theater, bigger, projector, present') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Full screen', 'Click the Full screen button in the bottom-right of the player. Press Esc to come back.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('youtube.com', 'Fix buffering on slow school wi-fi',
        'Lower the video quality so it stops freezing mid-lesson.',
        'When the video keeps pausing to load, dropping to 480p usually makes it play smoothly on a crowded school network.',
        'Quality', 1, 'quality, buffering, resolution, slow wifi, 480p, freezing, lag') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Settings', 'Click the gear-shaped Settings button in the player.'),
      (t, 2, 'guided', 'menu:Quality', 'Choose Quality from the menu.'),
      (t, 3, 'your_turn', null, 'Pick 480p. It looks a little softer but should stop freezing.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('youtube.com', 'Find the right video on a channel',
        'Search within one creator''s channel instead of all of YouTube.',
        'When you trust a channel (like a textbook publisher), searching inside it skips the random results.',
        'Search channel', 2, 'search channel, find video, within channel, creator') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'link:Channel', 'Click the channel name under the video to open the channel.'),
      (t, 2, 'guided', 'search:Search', 'Click the Search icon on the channel page.'),
      (t, 3, 'your_turn', null, 'Type a topic, like "photosynthesis", to see only that channel''s videos on it.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('youtube.com', 'Save a video for prep later',
        'Bookmark a resource so you can find it when you plan.',
        'Watch Later keeps a video handy without cluttering a playlist — a quick place to park things during prep.',
        'Watch later', 1, 'watch later, save, bookmark, later, prep') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Save', 'Click Save under the video.'),
      (t, 2, 'your_turn', null, 'Tick Watch later. Find it again later under Watch later in the left menu.');
  end if;
end $$;

-- ============================================================================================
-- 2. Microsoft 365 (Office on the web: Excel, Word, PowerPoint)
-- ============================================================================================
do $$
declare t bigint;
begin
  if exists (select 1 from public.tips where url_pattern = 'office.com' and title = 'Color-code grades in Excel') then
    raise notice 'microsoft 365 tips already seeded — skipping';
  else
    insert into public.websites (url_pattern, name)
      select 'office.com', 'Microsoft 365' where not exists (select 1 from public.websites where url_pattern = 'office.com');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('office.com', 'Color-code grades in Excel',
        'Turn low scores red automatically so struggling students stand out.',
        'Conditional formatting re-colours cells by their value, so you see at a glance who needs help without re-reading every number.',
        'Conditional Formatting', 3, 'excel, color, red, low grades, conditional formatting, highlight, flag') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'your_turn', null, 'Select the cells with the scores you want to colour.'),
      (t, 2, 'guided', 'menu:Home > Conditional Formatting', 'On the Home tab, click Conditional Formatting.'),
      (t, 3, 'your_turn', null, 'Choose Highlight Cells Rules, then Less Than, type your passing score, and pick a red fill.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('office.com', 'Keep the header row visible in Excel',
        'Freeze the top row so names and titles stay put while you scroll.',
        'With the header frozen, you never lose track of which column is which, even 200 rows down.',
        'Freeze Panes', 2, 'excel, freeze, header, top row, lock row, scroll') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'menu:View > Freeze Panes', 'On the View tab, click Freeze Panes.'),
      (t, 2, 'your_turn', null, 'Choose Freeze Top Row. The header now stays while the rest scrolls.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('office.com', 'Average a row of scores in Excel',
        'Get a student''s average with one formula instead of a calculator.',
        'AVERAGE adds the scores and divides for you, and it updates the moment you change a grade.',
        'AVERAGE formula', 2, 'excel, average, mean, grade, formula, calculate') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'your_turn', null, 'Click the empty cell at the end of the student''s row.'),
      (t, 2, 'your_turn', null, 'Type =AVERAGE( then drag across their score cells, type ) and press Enter.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('office.com', 'Leave margin feedback in Word',
        'Add a comment on a student''s work without changing their text.',
        'Comments sit in the margin so your feedback is clearly yours and separate from what the student wrote.',
        'New Comment', 2, 'word, comment, feedback, margin, review, note') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'your_turn', null, 'Select the word or sentence you want to comment on.'),
      (t, 2, 'guided', 'menu:Review > New Comment', 'On the Review tab, click New Comment.'),
      (t, 3, 'your_turn', null, 'Type your feedback and click the arrow or Post to save it.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('office.com', 'Show your edits in Word',
        'Turn on Track Changes so students can see what you changed.',
        'Track Changes marks every edit you make, turning a corrected paper into a lesson in what to fix.',
        'Track Changes', 2, 'word, track changes, edits, revisions, markup, review') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'menu:Review > Track Changes', 'On the Review tab, click Track Changes.'),
      (t, 2, 'your_turn', null, 'Switch it On. From now on your edits show up in colour until you turn it off.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('office.com', 'Lay out a rubric with a table in Word',
        'Insert a clean table for a quick grading rubric or worksheet.',
        'A table keeps criteria and points lined up neatly instead of fighting with tabs and spaces.',
        'Insert Table', 2, 'word, table, rubric, grid, worksheet, insert') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'menu:Insert > Table', 'On the Insert tab, click Table.'),
      (t, 2, 'your_turn', null, 'Drag to choose how many rows and columns your rubric needs, then click.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('office.com', 'Add a header to a Word handout',
        'Put a title or page numbers at the top of every page.',
        'A header repeats on each page, so a multi-page handout always shows the assignment name.',
        'Header & Footer', 2, 'word, header, footer, page numbers, title, handout') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'menu:Insert > Header & Footer', 'On the Insert tab, click Header & Footer.'),
      (t, 2, 'your_turn', null, 'Type your title in the header area. Use the options bar to add a page number if you want one.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('office.com', 'Turn slides into a printable PDF',
        'Export a PowerPoint deck as a PDF students can print or keep.',
        'A PDF looks the same on every device and can''t be accidentally edited — ideal for sharing notes.',
        'Export to PDF', 2, 'powerpoint, pdf, export, handout, print, download') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'menu:File > Export', 'Open the File menu and choose Export.'),
      (t, 2, 'your_turn', null, 'Choose Download as PDF. Save it wherever you keep class files.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('office.com', 'Present a slide deck to the class',
        'Start the slideshow full-screen from the first slide.',
        'Presenting hides the editing tools so the class sees a clean, full-screen deck.',
        'Present', 1, 'powerpoint, present, slideshow, full screen, projector') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'menu:Slide Show > From Beginning', 'On the Slide Show tab, click From Beginning (or press F5). Press Esc to stop.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('office.com', 'Share a file view-only with co-teachers',
        'Let others see a file without being able to change it.',
        'View-only sharing means a colleague can read your gradebook or plan without accidentally editing it.',
        'Share', 2, 'share, view only, read only, co-teacher, permissions, link') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Share', 'Click Share in the top-right corner.'),
      (t, 2, 'your_turn', null, 'Change the permission to Can view, add their email or copy the link, and send it.');
  end if;
end $$;

-- ============================================================================================
-- 3. Padlet
-- ============================================================================================
do $$
declare t bigint;
begin
  if exists (select 1 from public.tips where url_pattern = 'padlet.com' and title = 'Make a new board') then
    raise notice 'padlet tips already seeded — skipping';
  else
    insert into public.websites (url_pattern, name)
      select 'padlet.com', 'Padlet' where not exists (select 1 from public.websites where url_pattern = 'padlet.com');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('padlet.com', 'Make a new board',
        'Start a fresh Padlet for an activity or exit ticket.',
        'Each board is a blank wall where students can post. Pick a format that matches what you want them to do.',
        'Make a Padlet', 2, 'make, create, new board, padlet, start, wall') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Make', 'Click Make a Padlet (or the + button).'),
      (t, 2, 'your_turn', null, 'Choose a format — Wall for a bulletin board, Shelf for columns, Map for places.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('padlet.com', 'Change how posts are arranged',
        'Switch the layout to Wall, Grid, or Shelf to fit your lesson.',
        'The layout changes how student posts line up — Grid tidies them into a neat brick wall, Shelf groups them into columns.',
        'Layout', 2, 'layout, wall, grid, shelf, arrange, columns, format') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Settings', 'Open Settings (the gear icon) on the right.'),
      (t, 2, 'guided', 'panel:Layout', 'Find the Layout section.'),
      (t, 3, 'your_turn', null, 'Pick the layout you want and close Settings to apply it.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('padlet.com', 'Let students post without an account',
        'Lower the barrier so students can post with one click.',
        'Turning off required attribution lets students post straight away — fastest for quick exit tickets.',
        'Attribution', 2, 'anonymous, no account, attribution, exit ticket, quick, barrier') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Settings', 'Open Settings (the gear icon).'),
      (t, 2, 'your_turn', null, 'Turn Require attribution off so students don''t have to add their name to post.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('padlet.com', 'Approve posts before they appear',
        'Moderate what shows up so nothing inappropriate goes live.',
        'With approval on, student posts wait for your OK before the class sees them — a safety net for open activities.',
        'Require approval', 2, 'moderate, approval, filter, safe, review posts, control') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Settings', 'Open Settings (the gear icon).'),
      (t, 2, 'your_turn', null, 'Turn Require approval on. New posts now wait for you to approve them.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('padlet.com', 'Share a board with a link or QR code',
        'Get the whole class onto your board in seconds.',
        'A QR code on the projector lets students join by pointing their phone — no typing a long link.',
        'Share', 1, 'share, link, qr code, join, invite, students') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Share', 'Click Share on the right.'),
      (t, 2, 'your_turn', null, 'Copy the link, or choose Get QR code and show it on your screen for students to scan.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('padlet.com', 'Save a board as a PDF',
        'Keep a record of an activity after class.',
        'Exporting to PDF gives you a snapshot of everything students posted, so you can grade or file it later.',
        'Export', 2, 'export, pdf, save, record, download, archive') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Share', 'Click Share on the right.'),
      (t, 2, 'your_turn', null, 'Choose Export, then Save as PDF (or Save as image for a single picture).');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('padlet.com', 'Group ideas into sections',
        'Add columns so students post under the right topic or group.',
        'Sections turn a wall into labelled columns — perfect for "Agree / Disagree" or one column per group.',
        'Sections', 2, 'sections, columns, groups, organize, shelf, categories') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'your_turn', null, 'Make sure your board uses the Shelf layout (Settings > Layout).'),
      (t, 2, 'your_turn', null, 'Click Add section at the end of the board and give it a title.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('padlet.com', 'Let students comment and react',
        'Turn on comments and reactions for peer feedback.',
        'Comments and a like/star reaction let students respond to each other''s posts, not just the teacher.',
        'Comments & Reactions', 2, 'comments, reactions, likes, feedback, peer, respond') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Settings', 'Open Settings (the gear icon).'),
      (t, 2, 'your_turn', null, 'Turn on Comments, and choose a Reactions style (like, vote, star or grade).');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('padlet.com', 'Reuse a board next period',
        'Clear the posts but keep your setup for the next class.',
        'Remaking wipes the student posts while keeping your layout, title and settings — ready for the next period.',
        'Remake', 1, 'reset, clear, reuse, remake, next class, wipe posts') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Settings', 'Open the board menu (the "..." or gear).'),
      (t, 2, 'your_turn', null, 'Choose Remake, then turn OFF Copy posts so you keep the setup but clear the posts.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('padlet.com', 'Make a reusable copy of a board',
        'Clone your setup so each class gets its own board.',
        'Remaking with posts off gives you a fresh duplicate — one template, one board per class, no cross-talk.',
        'Remake as template', 2, 'copy, clone, duplicate, template, reuse, per class') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Settings', 'Open the board menu (the "..." or gear).'),
      (t, 2, 'your_turn', null, 'Choose Remake, keep posts off, and name the copy for the class, like "Period 3".');
  end if;
end $$;
