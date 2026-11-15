import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tipsView, unsupportedView, quickStartView, guideView } from '../src/sidepanel/views.js';
import { toTip } from '../src/lib/ai-tip.js';

const docs = { url_pattern: 'docs.google.com/document', name: 'Google Docs' };
const tip = {
  tip_id: 1, url_pattern: docs.url_pattern, title: 'Share class notes',
  summary: 'Give students access to the lesson.', description: 'Share your lesson document.',
  feature_name: 'Sharing', estimated_required_minutes: 2,
  tip_steps: [
    { step_id: 1, step_order: 1, step_type: 'guided', target_element: 'button:Share', step_description: 'Click Share. Find it at the top.' },
    { step_id: 2, step_order: 2, step_type: 'your_turn', target_element: null, step_description: 'Choose Viewer and copy the link. Test it with a student account.' }
  ]
};
const state = (query = '') => ({
  query, view: 'tips', setupDone: true, tab: { url: 'https://docs.google.com/document/d/1' },
  catalog: { websites: [docs], tips: [tip] },
  request: { open: false, text: '', saving: false, sent: false, error: '' }
});
const guideState = (selectedTip, summaryOpen = false) => ({
  ...state(), view: 'guide',
  guide: { tip: selectedTip, stepIndex: 0, summaryOpen, live: false, offtrack: null, status: null }
});
const summarySection = (html) => html.match(/<section id="tip-summary"[\s\S]*?<\/section>/)?.[0];

test('site navigation uses a stemmed arrow and keeps QuickStart available during search', () => {
  const html = tipsView(state('unmatched classroom task'), { site: docs, tips: [tip], browsing: false });
  assert.match(html, /aria-label="Browse all sites with tips"/);
  assert.match(html, /<span class="site-switch-icon" aria-hidden="true"><svg[^>]*><path d="M12 4v16m-7-7 7 7 7-7"/);
  assert.match(html, /1 tip for this site/);
  assert.match(html, /data-action="open-quickstart"/);
  assert.ok(html.indexOf('data-action="open-quickstart"') < html.indexOf('id="search"'));
  assert.match(html, /value="unmatched classroom task"/);
});

test('known sites with no individual tips still offer an orientation guide', () => {
  const empty = { ...state(), catalog: { websites: [docs], tips: [] } };
  const html = unsupportedView(empty, { site: docs, tips: [] });
  assert.match(html, /QuickStart guide available/);
  assert.match(html, /First time using Google Docs/);
  assert.match(html, /data-action="open-quickstart"/);
  assert.match(html, /No individual tips for this site yet/);
  assert.doesNotMatch(unsupportedView(empty, { site: null, tips: [] }), /data-action="open-quickstart"/);
});

test('QuickStart renders a whole-site tutorial and safely escapes catalog website names', () => {
  const site = { url_pattern: 'new-school-tool.example', name: '<img src=x onerror=alert(1)> & "Class"' };
  const html = quickStartView({ ...state(), quickStart: { site } });
  assert.match(html, /First-time user guide/);
  assert.match(html, /class="quickstart-sections howto"/);
  assert.match(html, /Check student access/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;Class&quot;/);
  assert.doesNotMatch(html, /<img|data-action="open-tip"/);
  assert.equal((html.match(/data-action="close-quickstart"/g) || []).length, 2);
});

test('tip summaries have accessible collapsed controls and escape their overview and actions', () => {
  const selectedTip = { ...tip, summary: '<img src=x onerror=alert(1)> & "Summary"', tip_steps: [
    { ...tip.tip_steps[0], step_description: 'Choose <Templates> & "Copy". Then review it.' },
    tip.tip_steps[1]
  ] };
  const closed = guideView(guideState(selectedTip));
  assert.match(closed, /data-action="toggle-tip-summary" aria-expanded="false" aria-controls="tip-summary"/);
  assert.match(summarySection(closed), / hidden>/);
  assert.doesNotMatch(summarySection(closed), /<p>|<li>/);

  const open = guideView(guideState(selectedTip, true));
  assert.match(open, /data-action="toggle-tip-summary" aria-expanded="true" aria-controls="tip-summary"/);
  const summary = summarySection(open);
  assert.doesNotMatch(summary, / hidden|<img|<Templates>/);
  assert.match(summary, /aria-labelledby="tip-summary-heading"/);
  assert.match(summary, /id="tip-summary-heading">Tip summary/);
  assert.match(summary, /&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;Summary&quot;/);
  assert.match(summary, /<li>Choose &lt;Templates&gt; &amp; &quot;Copy&quot;\.<\/li>/);
  assert.match(summary, /<li>Choose Viewer and copy the link\.<\/li>/);
  assert.match(open, /Step 1 of 2/);
});

test('AI walkthroughs can summarize the whole tip while retaining their current step and notice', () => {
  const selectedTip = toTip({ title: 'Make a class poster', summary: 'Prepare classroom instructions.', minutes: 2, caution: '',
    steps: ['Choose a poster template. Review the layout.', 'Add your instructions. Keep text readable.'] });
  const current = guideState(selectedTip, true);
  current.guide.stepIndex = 1;
  const html = guideView(current);
  assert.match(html, /AI-generated\./);
  assert.match(html, /Back to your AI tip/);
  assert.match(html, /Step 2 of 2/);
  assert.match(summarySection(html), /<li>Choose a poster template\.<\/li><li>Add your instructions\.<\/li>/);
  assert.equal(current.guide.stepIndex, 1);
});
