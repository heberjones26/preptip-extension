-- Replace the first Google Docs tip in place so the classroom workflow stays at
-- the top of the existing tip_id ordering. Keep IDs referenced by feedback/events.
-- Both updates are atomic and can be rerun without creating duplicate tips.
-- References:
-- https://support.google.com/docs/answer/65129
-- https://www.canva.com/help/use-templates/
DO $$
DECLARE
  site_pattern text;
  current_tip_id bigint;
  tip jsonb;
  step jsonb;
  seed jsonb := $seed$[
    {
      "site_name": "Google Docs",
      "url_pattern": "docs.google.com/document",
      "replace_first": true,
      "title": "Give feedback on student writing",
      "summary": "Attach a clear comment to a specific sentence in a student's work.",
      "description": "Open a student's Google Doc with permission to comment or edit. Select a passage and attach actionable feedback so the student knows exactly what to revise.",
      "feature_name": "Comments",
      "estimated_required_minutes": 2,
      "keywords": "student writing essay paper feedback comment comments review grade highlight select text sentence revision revise",
      "steps": [
        {"step_order": 1, "step_type": "your_turn", "target_element": null, "step_description": "Open a student's document and drag across the sentence you want to give feedback on. You need Commenter or Editor access to add a comment."},
        {"step_order": 2, "step_type": "guided", "target_element": "button:Add comment", "step_description": "Click Add comment in the toolbar at the top of the document. Keep the sentence selected so your feedback attaches to it."},
        {"step_order": 3, "step_type": "your_turn", "target_element": null, "step_description": "Type specific feedback, such as \"Add an example to support this idea.\" Click the blue Comment button to post it. The comment stays attached to the selected sentence for the student to review."}
      ]
    },
    {
      "site_name": "Canva",
      "url_pattern": "canva.com",
      "previous_title": "Start classroom poster from a template",
      "title": "Start a classroom poster from a template",
      "summary": "Find a classroom poster template, then customize it for your students.",
      "description": "Start on Canva's home page at canva.com. Open Templates, then use the template search to find a classroom poster.",
      "feature_name": "Templates",
      "estimated_required_minutes": 2,
      "keywords": "poster template templates classroom bulletin board decorations flyer design search",
      "steps": [
        {"step_order": 1, "step_type": "guided", "target_element": "button:Templates", "step_description": "On Canva's home page, click Templates in the left sidebar or above the search bar. If you are editing a design, go to canva.com first."},
        {"step_order": 2, "step_type": "guided", "target_element": "search:Search templates", "step_description": "Click the template search box near the top of the Templates page. Follow the orange mouse pointer and highlight to the search field."},
        {"step_order": 3, "step_type": "your_turn", "target_element": null, "step_description": "Type \"classroom poster\" in the template search box and press Enter."},
        {"step_order": 4, "step_type": "your_turn", "target_element": null, "step_description": "Choose a classroom poster template. Select Customize this template if prompted, then click its text to add your own classroom message."}
      ]
    }
  ]$seed$::jsonb;
BEGIN
  FOR tip IN SELECT value FROM jsonb_array_elements(seed)
  LOOP
    SELECT url_pattern INTO site_pattern FROM public.websites
     WHERE url_pattern = tip->>'url_pattern' OR lower(name) = lower(tip->>'site_name')
     ORDER BY length(url_pattern) DESC LIMIT 1;
    IF site_pattern IS NULL THEN
      site_pattern := tip->>'url_pattern';
      INSERT INTO public.websites (url_pattern, name) VALUES (site_pattern, tip->>'site_name');
    END IF;

    SELECT tip_id INTO current_tip_id FROM public.tips
     WHERE url_pattern = site_pattern
       AND (coalesce((tip->>'replace_first')::boolean, false)
            OR title = tip->>'title' OR title = tip->>'previous_title')
     ORDER BY tip_id LIMIT 1;

    IF current_tip_id IS NULL THEN
      INSERT INTO public.tips (url_pattern, title, summary, description, feature_name, estimated_required_minutes, keywords)
      VALUES (site_pattern, tip->>'title', tip->>'summary', tip->>'description', tip->>'feature_name',
              (tip->>'estimated_required_minutes')::integer, tip->>'keywords')
      RETURNING tip_id INTO current_tip_id;
    ELSE
      UPDATE public.tips SET
        title = tip->>'title', summary = tip->>'summary', description = tip->>'description',
        feature_name = tip->>'feature_name',
        estimated_required_minutes = (tip->>'estimated_required_minutes')::integer, keywords = tip->>'keywords'
      WHERE tip_id = current_tip_id;
    END IF;

    DELETE FROM public.tip_steps WHERE tip_id = current_tip_id;
    FOR step IN SELECT value FROM jsonb_array_elements(tip->'steps')
    LOOP
      INSERT INTO public.tip_steps (tip_id, step_order, step_type, target_element, step_description)
      VALUES (current_tip_id, (step->>'step_order')::integer, step->>'step_type',
              step->>'target_element', step->>'step_description');
    END LOOP;
  END LOOP;
END $$;
