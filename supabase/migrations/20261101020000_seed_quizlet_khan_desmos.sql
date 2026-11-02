-- Card 3 (batch 2): three more supported sites, 10 teacher tips each.
-- Same "teachers are a minority audience" rule: Quizlet, Khan Academy, Desmos are all
-- student-majority general tools, not teacher-built platforms.
-- No extension code change — matchSite() reads these url_patterns from `websites`.
-- Safe to re-run: each site's block only inserts when that website row doesn't already exist.

-- ============================================================================================
-- 4. Quizlet
-- ============================================================================================
do $$
declare t bigint;
begin
  if exists (select 1 from public.tips where url_pattern = 'quizlet.com' and title = 'Make a study set') then
    raise notice 'quizlet tips already seeded — skipping';
  else
    insert into public.websites (url_pattern, name)
      select 'quizlet.com', 'Quizlet' where not exists (select 1 from public.websites where url_pattern = 'quizlet.com');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('quizlet.com', 'Make a study set',
        'Build a set of flashcards for a unit or vocab list.',
        'A study set is the core of Quizlet — a list of terms and definitions students can flip, match and quiz themselves on.',
        'Create set', 3, 'create, study set, flashcards, vocab, terms, new set') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Create', 'Click Create (the + near the top) and choose Study set.'),
      (t, 2, 'your_turn', null, 'Give it a title, then type a term and its definition on each row.'),
      (t, 3, 'your_turn', null, 'Click Create to save. Students can now study it from the link.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('quizlet.com', 'Import a word list fast',
        'Paste terms from a doc or spreadsheet instead of typing each one.',
        'If you already have a vocab list, Import turns it into cards in seconds — no retyping.',
        'Import', 2, 'import, paste, bulk, spreadsheet, list, fast') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Create', 'Start a new set with Create.'),
      (t, 2, 'your_turn', null, 'Click Import, paste your list, and tell it what separates the term from the definition (a Tab or comma) and each card (a new line).');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('quizlet.com', 'Share a set with your class',
        'Get a link students can open without an account.',
        'Sharing gives you one link (or QR code) the whole class can use to start studying right away.',
        'Share', 1, 'share, link, class, students, qr code, send') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Share', 'Open the set and click Share.'),
      (t, 2, 'your_turn', null, 'Copy the link and post it in Canvas or your class chat.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('quizlet.com', 'Run a Quizlet Live review game',
        'Turn a set into a team review game for class.',
        'Quizlet Live splits the class into teams that race to match terms — a high-energy review before a test.',
        'Quizlet Live', 3, 'live, game, review, teams, play, compete') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Live', 'Open the set and click Live.'),
      (t, 2, 'your_turn', null, 'Choose Teams or Individuals, then show the join code on your screen for students to enter.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('quizlet.com', 'Make a practice test',
        'Auto-generate a quiz from any set.',
        'Test mode builds a printable or on-screen quiz from your cards, with the question types you pick.',
        'Test', 2, 'test, quiz, practice, exam, questions, assessment') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Test', 'Open the set and click Test.'),
      (t, 2, 'your_turn', null, 'Choose how many questions and which types (written, multiple choice, true/false), then print or share it.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('quizlet.com', 'Print flashcards for a station',
        'Make paper cards for an offline activity.',
        'Printing lets you run a review station without devices — handy when the wi-fi is down.',
        'Print', 2, 'print, paper, offline, station, cards') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:More', 'Open the set and click the "..." More menu.'),
      (t, 2, 'your_turn', null, 'Choose Print, then pick the flashcard layout and print.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('quizlet.com', 'Add an image to a card',
        'Put a picture on a card for visual vocabulary.',
        'Images help with science diagrams, language learning and younger students who read with pictures.',
        'Card images', 2, 'image, picture, diagram, visual, photo') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'your_turn', null, 'While editing a set, click the image icon on the right side of a card.'),
      (t, 2, 'your_turn', null, 'Search Quizlet''s images or upload your own, then pick one.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('quizlet.com', 'Organize sets into folders',
        'Group your sets by class or unit so they''re easy to find.',
        'Folders keep each period or unit together instead of one long scroll of sets.',
        'Folders', 2, 'folder, organize, class, unit, group, sort') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Create', 'Click Create and choose Folder.'),
      (t, 2, 'your_turn', null, 'Name the folder, then add your sets to it from each set''s "..." menu.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('quizlet.com', 'Study several sets at once',
        'Combine sets into one review for a midterm.',
        'Studying a folder lets students review every unit''s terms together before a big test.',
        'Study a folder', 1, 'combine, multiple sets, midterm, review, folder, all') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'your_turn', null, 'Open a folder that holds several sets.'),
      (t, 2, 'your_turn', null, 'Click a study mode (Flashcards or Learn) to study every set in the folder at once.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('quizlet.com', 'Set up Learn mode',
        'Let students practice with spaced, adaptive questions.',
        'Learn mode mixes question types and repeats what a student misses, so weak terms get more practice.',
        'Learn', 2, 'learn, spaced, adaptive, practice, study mode') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Learn', 'Open the set and click Learn.'),
      (t, 2, 'your_turn', null, 'Open Options to set whether it asks with the term or the definition, and whether to include written answers.');
  end if;
end $$;

-- ============================================================================================
-- 5. Khan Academy
-- ============================================================================================
do $$
declare t bigint;
begin
  if exists (select 1 from public.tips where url_pattern = 'khanacademy.org' and title = 'Create a class') then
    raise notice 'khan academy tips already seeded — skipping';
  else
    insert into public.websites (url_pattern, name)
      select 'khanacademy.org', 'Khan Academy' where not exists (select 1 from public.websites where url_pattern = 'khanacademy.org');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('khanacademy.org', 'Create a class',
        'Set up a class so you can assign content and track progress.',
        'A class is where your roster, assignments and progress reports live. You make it once per section.',
        'Create class', 3, 'class, create, roster, section, teacher, set up') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'your_turn', null, 'Go to your Teacher dashboard (Teacher in the top menu).'),
      (t, 2, 'your_turn', null, 'Click Add new class, name it, and pick the subject.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('khanacademy.org', 'Add students with a class code',
        'Let students join your class with a short code.',
        'A class code is the fastest way to get students enrolled — no emails to type.',
        'Class code', 1, 'class code, join, add students, enroll, invite') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'your_turn', null, 'Open your class and find the class code (Roster tab).'),
      (t, 2, 'your_turn', null, 'Show the code to students, or share the join link so they add themselves.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('khanacademy.org', 'Assign a video or lesson',
        'Push specific content to a class with a due date.',
        'Assigning means students see exactly what to do next, and you see who finished it.',
        'Assign', 2, 'assign, lesson, video, homework, due date, content') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Assign', 'Open the content you want and click Assign.'),
      (t, 2, 'your_turn', null, 'Pick the class, set a due date, and confirm.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('khanacademy.org', 'Assign a practice exercise',
        'Give students targeted practice on one skill.',
        'Practice exercises drill a single skill and auto-grade, so you see mastery without marking by hand.',
        'Assign practice', 2, 'practice, exercise, skill, drill, assign, mastery') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Assign', 'Open a practice exercise and click Assign.'),
      (t, 2, 'your_turn', null, 'Choose the class and a due date.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('khanacademy.org', 'Find content by subject or grade',
        'Search for material aligned to what you''re teaching.',
        'Searching by topic or grade surfaces the right lesson fast instead of browsing the whole course tree.',
        'Search', 1, 'search, find, subject, grade, standard, topic') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'search:Search', 'Click the Search box at the top.'),
      (t, 2, 'your_turn', null, 'Type a topic like "fractions" or "cell division" and open the lesson that fits.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('khanacademy.org', 'Preview a lesson before assigning',
        'Watch or read content yourself first to vet it.',
        'Previewing lets you check the lesson matches your standard and reading level before students see it.',
        'Preview', 1, 'preview, vet, check, watch, review content') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'your_turn', null, 'Open the lesson or video from the course page and go through it as a student would.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('khanacademy.org', 'Check student progress',
        'See who finished and who''s stuck.',
        'The progress view shows mastery per skill, so you can pull a small group for the thing they missed.',
        'Progress', 2, 'progress, mastery, grades, who finished, reports, stuck') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'your_turn', null, 'Open your class from the Teacher dashboard.'),
      (t, 2, 'your_turn', null, 'Click the Progress (or Activity) tab to see each student against each skill.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('khanacademy.org', 'Set a due date on an assignment',
        'Give an assignment a deadline students can see.',
        'A due date keeps the class on pace and shows up on each student''s to-do list.',
        'Due date', 1, 'due date, deadline, schedule, assignment, pace') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'your_turn', null, 'While assigning content, open the date field.'),
      (t, 2, 'your_turn', null, 'Pick a due date and time, then confirm the assignment.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('khanacademy.org', 'Unassign or delete an assignment',
        'Remove something you assigned by mistake.',
        'Unassigning cleans up a student''s to-do list when plans change, without deleting their other work.',
        'Unassign', 1, 'unassign, remove, delete, mistake, cancel assignment') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'your_turn', null, 'Open the Assignments list for your class.'),
      (t, 2, 'your_turn', null, 'Find the assignment, open its menu, and choose Unassign or Delete.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('khanacademy.org', 'Print or export a progress report',
        'Save a snapshot of class progress for records or parents.',
        'A report gives you something to attach to a grade or share at a conference.',
        'Reports', 2, 'report, export, print, progress, parents, records') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'your_turn', null, 'Open your class and go to the Progress or Activity view.'),
      (t, 2, 'your_turn', null, 'Use Download / Export to save it, or your browser''s Print to make a PDF.');
  end if;
end $$;

-- ============================================================================================
-- 6. Desmos (graphing calculator)
-- ============================================================================================
do $$
declare t bigint;
begin
  if exists (select 1 from public.tips where url_pattern = 'desmos.com' and title = 'Graph a function') then
    raise notice 'desmos tips already seeded — skipping';
  else
    insert into public.websites (url_pattern, name)
      select 'desmos.com', 'Desmos' where not exists (select 1 from public.websites where url_pattern = 'desmos.com');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('desmos.com', 'Graph a function',
        'Type an equation to see it plotted instantly.',
        'Desmos graphs as you type, so students watch the line appear while you build the equation.',
        'Graph a function', 1, 'graph, function, plot, equation, line, draw') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'your_turn', null, 'Click the first row of the expression list on the left.'),
      (t, 2, 'your_turn', null, 'Type an equation like y=2x+3. The graph appears right away.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('desmos.com', 'Add a slider to show change',
        'Turn a letter into a slider so students see how it changes the graph.',
        'Sliders make "what does m do?" visible — drag it and the line tilts live.',
        'Sliders', 2, 'slider, parameter, change, animate, variable, m and b') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'your_turn', null, 'Type an equation with a letter, like y=mx+b.'),
      (t, 2, 'your_turn', null, 'Desmos offers "add slider" for m and b — click it, then drag the slider to see the line change.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('desmos.com', 'Make a table of points',
        'Plot specific points from a table.',
        'A table is great for plotting data or showing a handful of exact points instead of a curve.',
        'Table', 2, 'table, points, data, plot points, coordinates') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Add Item', 'Click the + (Add Item) button at the top of the expression list.'),
      (t, 2, 'your_turn', null, 'Choose Table, then type your x and y values into the columns.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('desmos.com', 'Limit a graph to part of the line',
        'Show only a segment by restricting the domain.',
        'Restricting the domain is how you draw a ray or segment, or model something that only makes sense for certain x-values.',
        'Domain restriction', 2, 'domain, restrict, segment, piecewise, limit, range') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'your_turn', null, 'After your equation, add braces with a condition, like y=2x+3 {0<x<5}.'),
      (t, 2, 'your_turn', null, 'Only the part of the line where x is between 0 and 5 now shows.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('desmos.com', 'Graph an inequality with shading',
        'Show a solution region, not just a line.',
        'Typing an inequality shades the region that satisfies it — perfect for systems and solution sets.',
        'Inequalities', 1, 'inequality, shade, region, solution, greater than, less than') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'your_turn', null, 'Type an inequality like y<2x+1. Desmos shades the region instead of drawing a line.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('desmos.com', 'Set the viewing window',
        'Frame the graph so the important part is centered.',
        'Adjusting the window makes sure the class sees the intercepts or the piece you care about.',
        'Graph settings', 1, 'window, zoom, axes, scale, settings, view') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Settings', 'Click the wrench (Graph Settings) in the top-right.'),
      (t, 2, 'your_turn', null, 'Type the min and max for x and y to frame the view, or use the +/− zoom buttons.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('desmos.com', 'Add and label a point',
        'Mark a solution or intercept and name it.',
        'A labeled point calls out exactly the spot you''re discussing, like an intercept or an intersection.',
        'Points & labels', 2, 'point, label, mark, intercept, solution, coordinate') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'your_turn', null, 'Type a point like (2,3) on its own row.'),
      (t, 2, 'your_turn', null, 'Click the gear or long-press the point to turn on its label.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('desmos.com', 'Share a graph with students',
        'Send a link to the exact graph you built.',
        'Sharing lets students open your graph on their own devices and explore it, not just see a screenshot.',
        'Share Graph', 1, 'share, link, send, students, graph, url') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Share Graph', 'Click Share Graph (the share icon) at the top.'),
      (t, 2, 'your_turn', null, 'Copy the link and post it for your class.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('desmos.com', 'Save a graph to your account',
        'Keep a graph so you can reopen it next class.',
        'Saving means you build a demo once and pull it up again any period without retyping it.',
        'Save', 1, 'save, keep, account, reopen, store, reuse') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Save', 'Click Save at the top (sign in first if asked).'),
      (t, 2, 'your_turn', null, 'Give the graph a name so you can find it in your saved graphs later.');

    insert into public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      values ('desmos.com', 'Project a graph for the class',
        'Make the graph big and clear on the board.',
        'Zooming in and hiding clutter makes a graph readable from the back of the room.',
        'Projector view', 1, 'project, projector, present, zoom, big, board, class') returning tip_id into t;
    insert into public.tip_steps (tip_id, step_order, step_type, target_element, step_description) values
      (t, 1, 'guided', 'button:Settings', 'Open the wrench (Graph Settings).'),
      (t, 2, 'your_turn', null, 'Turn on Projector mode (thicker lines and bigger labels), then collapse the expression list with the << arrow for a full-screen graph.');
  end if;
end $$;
