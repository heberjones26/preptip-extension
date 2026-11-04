-- Replace the Google Slides guides with ten researched, step-by-step teacher workflows.
-- The guides follow the current Google Slides desktop UI. References:
-- https://support.google.com/docs/answer/2763168
-- https://support.google.com/docs/answer/1694830
-- https://support.google.com/docs/answer/1705254
-- https://support.google.com/docs/answer/97447
-- https://support.google.com/docs/answer/1689475
-- https://support.google.com/docs/answer/1696787
-- https://support.google.com/a/users/answer/9310270
--
-- Keep the existing Google Slides website row and URL pattern, but replace every tip and step
-- attached to it. The alternate URL patterns cover both the Slides home page and editor URLs.
DO $$
DECLARE
  site_pattern text;
  tip jsonb;
  step jsonb;
  new_tip_id bigint;
  seed jsonb := $seed$[
    {
      "title": "Create and edit slides",
      "summary": "Add, duplicate, delete, and rearrange slides in a presentation.",
      "description": "Use the filmstrip on the left to build a clear lesson sequence. Add a slide, reuse one by duplicating it, drag slides into a better order, or remove slides you no longer need.",
      "feature_name": "Create and edit slides",
      "estimated_required_minutes": 2,
      "keywords": "create add edit slides new duplicate copy delete remove reorder rearrange move filmstrip",
      "steps": [
        {"step_order": 1, "step_type": "guided", "target_element": "button:New slide", "step_description": "Choose New slide to add a slide after the one selected in the filmstrip."},
        {"step_order": 2, "step_type": "your_turn", "target_element": null, "step_description": "In the left filmstrip, drag a slide to rearrange it. Right-click a thumbnail to duplicate or delete it. You can also select a thumbnail and press Delete or Backspace to remove it."}
      ]
    },
    {
      "title": "Templates and themes",
      "summary": "Start with a premade design or apply a theme and slide layout.",
      "description": "Templates and themes give your lesson a consistent look without formatting every slide from scratch. A template can add a complete set of designed slides; a theme updates the presentation's colors, fonts, and layouts.",
      "feature_name": "Templates and themes",
      "estimated_required_minutes": 2,
      "keywords": "template theme design premade layout style gallery import theme",
      "steps": [
        {"step_order": 1, "step_type": "guided", "target_element": "button:Templates", "step_description": "Open the template gallery from the top-left of the Slides home screen or editor."},
        {"step_order": 2, "step_type": "your_turn", "target_element": null, "step_description": "Choose a template to start a designed presentation. To restyle an open deck, choose Slide > Change theme, then select a theme in the right panel. Use Layout in the toolbar to change the selected slide's arrangement."}
      ]
    },
    {
      "title": "Text formatting",
      "summary": "Adjust fonts, size, color, and alignment to make lesson content easy to read.",
      "description": "Clear formatting helps students scan instructions and focus on key ideas. Select text inside a text box, then use the toolbar to change its font, size, color, and alignment.",
      "feature_name": "Text formatting",
      "estimated_required_minutes": 2,
      "keywords": "text format font fonts color colour size alignment align typography bold",
      "steps": [
        {"step_order": 1, "step_type": "guided", "target_element": "button:Font", "step_description": "Find the font controls in the toolbar at the top of the editor."},
        {"step_order": 2, "step_type": "your_turn", "target_element": null, "step_description": "Select text on the slide. Use the toolbar to choose a font and size, set Text color, and choose an alignment. If the text is not selected, the changes may apply only to new text."}
      ]
    },
    {
      "title": "Insert images",
      "summary": "Add a picture, illustration, or diagram to support a lesson.",
      "description": "A relevant visual can make a concept easier to explain. Slides can insert images from your computer, Google Drive, Photos, the web, or a URL.",
      "feature_name": "Insert images",
      "estimated_required_minutes": 2,
      "keywords": "insert image picture photo illustration diagram upload drive web url visual",
      "steps": [
        {"step_order": 1, "step_type": "guided", "target_element": "menu:Insert", "step_description": "Open Insert in the top menu."},
        {"step_order": 2, "step_type": "guided", "target_element": "menu:Image", "step_description": "Choose Image to see the available image sources."},
        {"step_order": 3, "step_type": "your_turn", "target_element": null, "step_description": "Choose a source, select the picture, then click Insert or Open. Drag the image to position it and use the corner handles to resize it."}
      ]
    },
    {
      "title": "Insert videos",
      "summary": "Embed a video in a slide so students can watch it during the lesson.",
      "description": "You can search YouTube, paste a video URL, or choose a video stored in Google Drive. The video appears on the slide and can play during a presentation.",
      "feature_name": "Insert videos",
      "estimated_required_minutes": 2,
      "keywords": "insert video youtube embed lesson clip url drive",
      "steps": [
        {"step_order": 1, "step_type": "guided", "target_element": "menu:Insert", "step_description": "Open Insert in the top menu."},
        {"step_order": 2, "step_type": "guided", "target_element": "menu:Video", "step_description": "Choose Video to open the video picker."},
        {"step_order": 3, "step_type": "your_turn", "target_element": null, "step_description": "Search YouTube, paste a video URL, or choose a video from Drive. Select the video and click Select, then position and resize it on the slide."}
      ]
    },
    {
      "title": "Speaker notes",
      "summary": "Keep private teaching prompts below a slide while you present.",
      "description": "Speaker notes help you remember examples, questions, or transitions. They appear in presenter tools for you and are not shown on the audience's slide.",
      "feature_name": "Speaker notes",
      "estimated_required_minutes": 1,
      "keywords": "speaker notes presenter private talking points teaching prompts below slide",
      "steps": [
        {"step_order": 1, "step_type": "guided", "target_element": "panel:Speaker notes", "step_description": "Locate the speaker notes area below the current slide."},
        {"step_order": 2, "step_type": "your_turn", "target_element": null, "step_description": "Click the notes area and type your teaching prompt. Select another slide to add notes for that part of the lesson. The notes stay in the editor and presenter view, not on the projected slide."}
      ]
    },
    {
      "title": "Animations and transitions",
      "summary": "Reveal text or images gradually and add transitions between slides.",
      "description": "Animations can introduce an object or list one piece at a time. Transitions control how a slide appears during the presentation, helping you pace explanations and keep attention on the current idea.",
      "feature_name": "Animations and transitions",
      "estimated_required_minutes": 2,
      "keywords": "animation transition reveal gradually appear on click motion slide objects",
      "steps": [
        {"step_order": 1, "step_type": "guided", "target_element": "menu:Insert", "step_description": "Select the text or image you want to animate, then open Insert."},
        {"step_order": 2, "step_type": "guided", "target_element": "menu:Animation", "step_description": "Choose Animation to open the motion controls."},
        {"step_order": 3, "step_type": "your_turn", "target_element": null, "step_description": "Choose an object animation and set when it starts. To add a slide transition instead, select a slide and choose Slide > Transition. Use Play in the motion panel to preview your changes."}
      ]
    },
    {
      "title": "Charts and tables",
      "summary": "Show data, comparisons, and information visually on a slide.",
      "description": "A chart can make class data or comparisons easier to understand. Tables are useful for organizing information into rows and columns, and charts can stay linked to their source spreadsheet.",
      "feature_name": "Charts and tables",
      "estimated_required_minutes": 2,
      "keywords": "chart table data comparisons information visual insert spreadsheet sheets linked",
      "steps": [
        {"step_order": 1, "step_type": "guided", "target_element": "menu:Insert", "step_description": "Open Insert in the top menu."},
        {"step_order": 2, "step_type": "guided", "target_element": "menu:Chart", "step_description": "Choose Chart to add a chart, or choose Table from the same Insert menu to organize information in rows and columns."},
        {"step_order": 3, "step_type": "your_turn", "target_element": null, "step_description": "For a chart, select the chart type or choose From Sheets to import one. For a table, choose its row and column count. Move and resize the result on your slide."}
      ]
    },
    {
      "title": "Sharing and collaboration",
      "summary": "Give teachers or students the right access to view, comment, or edit.",
      "description": "Sharing lets colleagues co-plan lessons and gives students access to class presentations. Choose a permission level that fits the task, and check who can open the link before sending it.",
      "feature_name": "Sharing and collaboration",
      "estimated_required_minutes": 2,
      "keywords": "share collaboration collaborate co-edit teacher student viewer commenter editor permission link",
      "steps": [
        {"step_order": 1, "step_type": "guided", "target_element": "button:Share", "step_description": "Open the sharing controls in the top-right corner."},
        {"step_order": 2, "step_type": "your_turn", "target_element": null, "step_description": "Add people or copy a link. Choose Viewer, Commenter, or Editor access, check the sharing scope, then send or copy the link. Editors can change the presentation; viewers can only see it."}
      ]
    },
    {
      "title": "Present mode",
      "summary": "Show your deck full-screen and use presenter view for notes and controls.",
      "description": "Slideshow mode puts the lesson on the class display. Presenter view can keep speaker notes and presentation controls available to you while students see the slides.",
      "feature_name": "Present mode",
      "estimated_required_minutes": 1,
      "keywords": "present presentation slideshow full screen presenter view notes tools class display",
      "steps": [
        {"step_order": 1, "step_type": "guided", "target_element": "button:Slideshow", "step_description": "Start the full-screen presentation from the top-right of the editor."},
        {"step_order": 2, "step_type": "your_turn", "target_element": null, "step_description": "Use the arrow keys or on-screen arrows to move through the slides, and press Esc to exit. To keep notes and presenter controls available, open the Slideshow options and choose Presenter view."}
      ]
    }
  ]$seed$::jsonb;
BEGIN
  SELECT url_pattern INTO site_pattern
    FROM public.websites
   WHERE lower(name) = 'google slides'
   ORDER BY length(url_pattern) DESC
   LIMIT 1;

  IF site_pattern IS NULL THEN
    site_pattern := 'docs.google.com/presentation';
    INSERT INTO public.websites (url_pattern, name)
    VALUES (site_pattern, 'Google Slides');
  END IF;

  DELETE FROM public.tip_steps
   WHERE tip_id IN (
     SELECT tip_id FROM public.tips
      WHERE url_pattern IN (site_pattern, 'docs.google.com/presentation', 'slides.google.com')
   );

  DELETE FROM public.tips
   WHERE url_pattern IN (site_pattern, 'docs.google.com/presentation', 'slides.google.com');

  FOR tip IN SELECT value FROM jsonb_array_elements(seed)
  LOOP
    INSERT INTO public.tips (
      url_pattern, title, summary, description, feature_name,
      estimated_required_minutes, keywords
    ) VALUES (
      site_pattern, tip->>'title', tip->>'summary', tip->>'description', tip->>'feature_name',
      (tip->>'estimated_required_minutes')::integer, tip->>'keywords'
    ) RETURNING tip_id INTO new_tip_id;

    FOR step IN SELECT value FROM jsonb_array_elements(tip->'steps')
    LOOP
      INSERT INTO public.tip_steps (
        tip_id, step_order, step_type, target_element, step_description
      ) VALUES (
        new_tip_id, (step->>'step_order')::integer, step->>'step_type',
        nullif(step->>'target_element', 'null'), step->>'step_description'
      );
    END LOOP;
  END LOOP;
END $$;
