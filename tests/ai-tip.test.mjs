// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPrompt, parseAiTip, toTip, cleanSavedTips, dbTipId, cleanQuestion, AI_ASSISTANTS, MAX_QUESTION
} from '../src/lib/ai-tip.js';
import {
  GEMINI_MODELS, GeminiError, geminiRequest, geminiText, generateWithGemini, isUserFixable, looksLikeKey
} from '../src/lib/gemini.js';

const KEY = 'AIzaSyD-FAKEKEYFORTESTS_1234567890abcd';
const good = { title: 'Make a seating chart', summary: 'Arrange desks in a grid.', minutes: 3, steps: ['Click "Insert".', 'Choose "Table".'], caution: '' };

// ---------------------------------------------------------------------------
// The prompt
// ---------------------------------------------------------------------------
test('the prompt carries the question, site, grade and subjects, and asks for JSON only', () => {
  const p = buildPrompt({ question: 'print a seating chart', site: 'Canva', grade: 'High school', subjects: ['Math', 'Physics'] });
  assert.match(p, /PrepTip/);
  assert.match(p, /I teach High school \(Math, Physics\)/);
  assert.match(p, /The website I'm on: Canva\./);
  assert.match(p, /What I want to do: print a seating chart/);
  assert.match(p, /ONLY a JSON object/);
  assert.match(p, /"steps"/);
  assert.match(p, /in Canva/);
});

test('the prompt leaves out what is not known instead of printing blanks', () => {
  const p = buildPrompt({ question: 'freeze a row' });
  assert.ok(!p.includes('The website I'));
  assert.ok(!p.includes('I teach'));
  assert.match(p, /busy teacher and not very techy/);
  assert.ok(!/\n\n\n/.test(p), 'no runs of blank lines');
  assert.match(buildPrompt({ question: 'x', subjects: ['Art'] }), /I teach \(Art\)/);
  assert.match(buildPrompt({}), /\(describe what you want to do\)/);
});

test('the question is cleaned: markup removed, spaces collapsed, length capped', () => {
  assert.equal(cleanQuestion('  make <b>a</b>\n\n chart  '), 'make a chart');
  assert.equal(cleanQuestion('x '.repeat(500)).length <= MAX_QUESTION, true);
  assert.ok(!buildPrompt({ question: '<script>alert(1)</script>do it' }).includes('<script>'));
});

test('the prompt never contains account details', () => {
  const p = buildPrompt({ question: 'q', site: 'Canva', grade: 'High school', subjects: ['Math'] });
  assert.ok(!/username|password|@/i.test(p.replace('@', '')));
});

test('every assistant link is https and named', () => {
  assert.equal(AI_ASSISTANTS.length, 3);
  for (const a of AI_ASSISTANTS) { assert.match(a.url, /^https:\/\//); assert.ok(a.name); }
});

// ---------------------------------------------------------------------------
// Reading the answer
// ---------------------------------------------------------------------------
test('a clean JSON answer becomes a tip', () => {
  const r = parseAiTip(JSON.stringify(good));
  assert.equal(r.ok, true);
  assert.deepEqual(r.tip, { title: 'Make a seating chart', summary: 'Arrange desks in a grid.', minutes: 3, steps: ['Click "Insert".', 'Choose "Table".'], caution: '' });
});

test('it copes with a code fence and with chatter around the JSON', () => {
  assert.equal(parseAiTip('```json\n' + JSON.stringify(good) + '\n```').ok, true);
  assert.equal(parseAiTip('Sure! Here is your tip:\n' + JSON.stringify(good) + '\nHope that helps!').ok, true);
});

test('numbering and bullets are stripped from steps, and object steps are accepted', () => {
  const r = parseAiTip(JSON.stringify({ ...good, steps: ['1. Open the file', '2) Click Share', '- Press Done', { text: '4. Close it' }, ''] }));
  assert.deepEqual(r.tip.steps, ['Open the file', 'Click Share', 'Press Done', 'Close it']);
});

test('markup in the answer is removed', () => {
  const r = parseAiTip(JSON.stringify({ ...good, title: '<b>Make</b> a chart <img src=x onerror=alert(1)>', steps: ['<script>x</script>Click Insert', 'Click Table'] }));
  assert.equal(r.tip.title, 'Make a chart');
  assert.equal(r.tip.steps[0], 'xClick Insert');
  assert.ok(!JSON.stringify(r.tip).includes('<'));
});

test('bad answers get a message a teacher can act on', () => {
  assert.match(parseAiTip('').error, /Paste/);
  assert.match(parseAiTip('I cannot help with that.').error, /format/);
  assert.match(parseAiTip('{not json}').error, /couldn’t read/);
  assert.match(parseAiTip('[1,2,3]').error, /format|couldn’t read/);
  assert.match(parseAiTip(JSON.stringify({ ...good, title: '' })).error, /title/);
  assert.match(parseAiTip(JSON.stringify({ ...good, steps: ['Only one'] })).error, /two steps/);
  assert.match(parseAiTip(JSON.stringify({ ...good, steps: 'not a list' })).error, /two steps/);
  for (const bad of ['', 'nope', '{not json}', '{"title":"x"}']) assert.equal(parseAiTip(bad).ok, false);
});

test('missing or silly fields get sensible defaults and limits', () => {
  const r = parseAiTip(JSON.stringify({ title: 'Do the thing', steps: ['One step here', 'Another step here', 'Third step here', 'Fourth step here'], minutes: 999 }));
  assert.equal(r.tip.minutes, 30);
  assert.equal(r.tip.summary, 'One step here');
  assert.equal(parseAiTip(JSON.stringify({ ...good, minutes: 'soon' })).tip.minutes, 1);
  const long = parseAiTip(JSON.stringify({ ...good, title: 'T'.repeat(300), steps: Array.from({ length: 30 }, (_, i) => `Step ${i} ${'x '.repeat(400)}`) }));
  assert.ok(long.tip.title.length <= 80);
  assert.equal(long.tip.steps.length, 10);
  assert.ok(long.tip.steps.every((s) => s.length <= 300));
});

// ---------------------------------------------------------------------------
// Becoming a tip the guide can follow
// ---------------------------------------------------------------------------
test('toTip makes a catalog-shaped, instruction-only tip that is marked as AI', () => {
  const tip = toTip({ ...good, caution: 'Menus differ at some schools.' }, { siteName: 'Canva', now: () => 1700000000000, random: () => 0.5 });
  assert.equal(tip.tip_id, 'ai-1700000000000-5000');
  assert.equal(tip.ai, true);
  assert.equal(tip.url_pattern, 'ai-generated');
  assert.equal(tip.site_name, 'Canva');
  assert.equal(tip.feature_name, 'AI-generated');
  assert.match(tip.description, /Heads up: Menus differ/);
  assert.equal(tip.tip_steps.length, 2);
  assert.ok(tip.tip_steps.every((s) => s.step_type === 'your_turn' && s.target_element === null), 'never highlight unverified steps');
  assert.deepEqual(tip.tip_steps.map((s) => s.step_order), [1, 2]);
});

test('AI tips never carry an id the database would accept or reject', () => {
  assert.equal(dbTipId({ tip_id: 12 }), 12);
  assert.equal(dbTipId(toTip(good)), null);
  assert.equal(dbTipId(null), null);
  assert.equal(dbTipId({ tip_id: '12' }), null);
});

test('saved tips are filtered and capped when they come back out of storage', () => {
  const ok = toTip(good);
  const list = [ok, { ai: true, tip_id: 'ai-x', title: 'no steps', tip_steps: [] }, null, 'junk', { ...ok, ai: false }, ...Array.from({ length: 20 }, () => toTip(good))];
  const cleaned = cleanSavedTips(list, 10);
  assert.equal(cleaned.length, 10);
  assert.ok(cleaned.every((t) => t.ai === true && t.tip_steps.length >= 2));
  assert.deepEqual(cleanSavedTips('nope'), []);
});

// ---------------------------------------------------------------------------
// Gemini (the optional one-click path), against a stand-in for the network
// ---------------------------------------------------------------------------
const reply = (obj, status = 200) => ({ status, ok: status >= 200 && status < 300, json: async () => obj });
const answer = (text) => reply({ candidates: [{ content: { parts: [{ text }] } }] });

test('the request puts the key in a header, never in the URL, and asks for JSON', () => {
  const { url, init } = geminiRequest('gemini-3.8-flash', 'the prompt', `  ${KEY}  `);
  assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.8-flash:generateContent$/);
  assert.ok(!url.includes('AIza') && !url.includes('key='));
  assert.equal(init.headers['x-goog-api-key'], KEY);
  const body = JSON.parse(init.body);
  assert.equal(body.contents[0].parts[0].text, 'the prompt');
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.ok(!init.body.includes(KEY), 'the key is not in the body either');
});

test('geminiText reads both response shapes and skips "thinking" parts', () => {
  assert.equal(geminiText({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] }), 'hi');
  assert.equal(geminiText({ candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text: '{"a":1}' }] } }] }), '{"a":1}');
  assert.equal(geminiText({ steps: [{ type: 'thought' }, { type: 'model_output', content: [{ text: 'new shape' }] }] }), 'new shape');
  assert.equal(geminiText({}), '');
  assert.equal(geminiText(null), '');
});

test('a good response is returned as text, and the full flow ends in a tip', async () => {
  const calls = [];
  const text = await generateWithGemini({ key: KEY, prompt: 'p', fetchImpl: async (url, init) => { calls.push({ url, init }); return answer(JSON.stringify(good)); } });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.includes(GEMINI_MODELS[0]));
  assert.equal(parseAiTip(text).ok, true);
});

test('a retired model (404) falls through to the next one', async () => {
  const seen = [];
  const text = await generateWithGemini({
    key: KEY, prompt: 'p',
    fetchImpl: async (url) => { seen.push(url); return seen.length === 1 ? reply({}, 404) : answer('ok'); }
  });
  assert.equal(text, 'ok');
  assert.equal(seen.length, 2);
  assert.ok(seen[0].includes(GEMINI_MODELS[0]) && seen[1].includes(GEMINI_MODELS[1]));
});

test('every model retired -> a friendly error, not a crash', async () => {
  await assert.rejects(
    generateWithGemini({ key: KEY, prompt: 'p', fetchImpl: async () => reply({}, 404) }),
    (e) => e instanceof GeminiError && e.status === 404 && /isn’t available/.test(e.friendly)
  );
});

test('errors are friendly, classified, and never contain the key or Google’s own text', async () => {
  const cases = [
    [400, { error: { message: `API key not valid. Please pass a valid API key. (${KEY})` } }, /didn’t accept that key/, true],
    [403, { error: { message: `permission denied for ${KEY}` } }, /rejected that key/, true],
    [429, {}, /free limit/, true],
    [500, {}, /busy/, false],
    [503, {}, /busy/, false]
  ];
  for (const [status, body, friendly, fixable] of cases) {
    await assert.rejects(
      generateWithGemini({ key: KEY, prompt: 'p', fetchImpl: async () => reply(body, status) }),
      (e) => {
        assert.ok(e instanceof GeminiError);
        assert.match(e.friendly, friendly);
        assert.equal(isUserFixable(e), fixable, `status ${status}`);
        assert.ok(!e.message.includes('AIza') && !e.friendly.includes('AIza') && !String(e.stack).includes(KEY), 'key must not leak');
        assert.equal(e.message, `Gemini request failed (${status})`);
        return true;
      }
    );
  }
});

test('network failures, timeouts, blocked and empty answers are all handled', async () => {
  await assert.rejects(generateWithGemini({ key: KEY, prompt: 'p', fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), (e) => e.status === 'network' && /reach Gemini/.test(e.friendly));
  await assert.rejects(generateWithGemini({ key: KEY, prompt: 'p', fetchImpl: async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; } }), (e) => e.status === 'timeout');
  await assert.rejects(generateWithGemini({ key: KEY, prompt: 'p', fetchImpl: async () => reply({ promptFeedback: { blockReason: 'SAFETY' } }) }), (e) => e.status === 'blocked');
  await assert.rejects(generateWithGemini({ key: KEY, prompt: 'p', fetchImpl: async () => reply({ candidates: [] }) }), (e) => e.status === 'empty');
});

test('a missing or junk key is rejected before anything is sent', async () => {
  let sent = 0;
  for (const key of ['', '   ', 'short', 'has spaces in the middle of it !!', undefined]) {
    await assert.rejects(generateWithGemini({ key, prompt: 'p', fetchImpl: async () => { sent++; return answer('x'); } }), (e) => e.status === 'key');
  }
  assert.equal(sent, 0);
  assert.equal(looksLikeKey(KEY), true);
  assert.equal(looksLikeKey('nope'), false);
});

// ---------------------------------------------------------------------------
// Where the teacher's own key lives
// ---------------------------------------------------------------------------
import { createKeyStore } from '../src/lib/ai-key.js';
import { aiView, resultsHtml, unsupportedView } from '../src/sidepanel/views.js';

const area = () => {
  const d = {};
  return { async get(k) { return k in d ? { [k]: d[k] } : {}; }, async set(o) { Object.assign(d, o); }, async remove(k) { delete d[k]; }, dump: () => d };
};

test('by default the key is kept for this session only, and never written to permanent storage', async () => {
  const local = area(); const session = area();
  const store = createKeyStore({ local, session });
  assert.deepEqual(await store.get(), { key: '', remembered: false });
  await store.set(`  ${KEY}  `, false);
  assert.deepEqual(await store.get(), { key: KEY, remembered: false });
  assert.deepEqual(local.dump(), {}, 'nothing in permanent storage');
  assert.equal(session.dump()['pt.geminiKey'], KEY);
});

test('"remember" moves the key to permanent storage (and out of the session), and clear wipes both', async () => {
  const local = area(); const session = area();
  const store = createKeyStore({ local, session });
  await store.set(KEY, false);
  await store.set(KEY, true);
  assert.deepEqual(await store.get(), { key: KEY, remembered: true });
  assert.deepEqual(session.dump(), {});
  await store.set(KEY, false);
  assert.deepEqual(local.dump(), {}, 'un-remembering removes the permanent copy');
  await store.set(KEY, true);
  await store.clear();
  assert.deepEqual(await store.get(), { key: '', remembered: false });
  assert.deepEqual([local.dump(), session.dump()], [{}, {}]);
});

test('storage that is missing or throws is treated as "no key", not a crash', async () => {
  const broken = { get: async () => { throw new Error('nope'); }, set: async () => { throw new Error('nope'); }, remove: async () => { throw new Error('nope'); } };
  const store = createKeyStore({ local: broken, session: broken });
  assert.deepEqual(await store.get(), { key: '', remembered: false });
  await assert.doesNotReject(store.clear());
  await assert.doesNotReject(createKeyStore({ local: undefined, session: undefined }).clear());
});

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------
const ai = (over = {}) => ({
  question: '', site: '', reply: '', tip: null, finished: null, pasteError: '', geminiError: '', copied: false,
  copyFailed: false, building: false, key: '', remember: false, keyOpen: false, returnTo: 'tips', ...over
});
const aiState = (over = {}, stateOver = {}) => ({
  view: 'ai', setupDone: true, teacher: { userId: 1, username: 'nelly', gradeLevel: 'high', subjects: ['physics'] },
  ai: ai(over), aiKey: { has: false, remembered: false }, aiTips: [], ...stateOver
});

test('the AI screen shows the exact prompt, the three assistants, and what leaves the browser', () => {
  const html = aiView(aiState({ question: 'print a seating chart', site: 'Canva' }));
  assert.match(html, /<textarea id="ai-prompt"[^>]*readonly>[\s\S]*print a seating chart/);
  assert.match(html, /I teach High school \(Physics\)/);
  for (const a of AI_ASSISTANTS) assert.ok(html.includes(`href="${a.url}"`), a.name);
  assert.equal((html.match(/rel="noopener"/g) || []).length >= 4, true, 'every outside link is noopener');
  assert.match(html, /only sent to Google/);
  assert.match(html, /Google may use what you send to improve its products/);
  assert.match(html, /student names/);
  assert.match(html, /aistudio\.google\.com\/apikey/);
  assert.ok(!/<details[^>]* open/.test(html), 'the key section starts closed');
});

test('the AI screen escapes everything a teacher or an AI could put in it', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const tip = toTip({ title: 'Safe title', summary: 'Safe', minutes: 1, steps: ['Do this', 'Do that'], caution: '' });
  tip.title = evil; tip.tip_steps[0].step_description = evil; tip.caution = evil;
  const html = aiView(aiState({ question: evil, site: evil, reply: evil, tip, pasteError: evil, geminiError: evil, finished: evil }, { aiTips: [tip] }));
  assert.ok(!html.includes('<img'), 'no raw markup anywhere');
  assert.match(html, /&lt;img/);
});

test('with a saved key the screen offers to remove it and never prints it', () => {
  const html = aiView(aiState({}, { aiKey: { has: true, remembered: false } }));
  assert.match(html, /data-action="ai-key-forget">Remove key/);
  assert.match(html, /until you close the browser/);
  assert.ok(!html.includes('id="ai-key"'), 'no key box when one is saved');
  assert.ok(!html.includes(KEY));
  assert.match(html, /<details[^>]* open/, 'open so they can see it');
  assert.match(aiView(aiState({}, { aiKey: { has: true, remembered: true } })), /remembered on this computer/);
});

test('the AI screen shows progress, errors, a finished tip and the saved list', () => {
  assert.match(aiView(aiState({ building: true })), /disabled>Asking Gemini/);
  assert.match(aiView(aiState({ copied: true })), />Copied!</);
  assert.match(aiView(aiState({ copyFailed: true })), /couldn&rsquo;t copy it automatically/);
  assert.match(aiView(aiState({ pasteError: 'Paste the AI’s answer first.' })), /role="alert">Paste the AI’s answer first/);
  const tip = toTip(good, { now: () => 5, random: () => 0 });
  const html = aiView(aiState({ tip, finished: tip.title }, { aiTips: [tip] }));
  assert.match(html, /Nice work!/);
  assert.match(html, /data-action="ai-follow"/);
  assert.match(html, /data-action="ai-open-saved" data-id="ai-5-0"/);
  assert.match(html, /data-action="ai-remove" data-id="ai-5-0"/);
  assert.match(html, /AI-generated/);
});

test('"Build a tip with AI" is offered wherever a teacher can ask for a tip that does not exist', () => {
  const docs = { url_pattern: 'docs.google.com/document', name: 'Google Docs' };
  const tip = { tip_id: 1, url_pattern: docs.url_pattern, title: 'Leave a comment', keywords: 'feedback', tip_steps: [] };
  const state = {
    query: 'zzzz nothing matches', view: 'tips', setupDone: true, tab: { url: 'https://example.com' },
    catalog: { websites: [docs], tips: [tip] }, request: { open: false, text: '', saving: false, sent: false, error: '' }
  };
  // a search on a supported site that finds nothing
  assert.match(resultsHtml(state, { site: docs, tips: [tip] }), /data-action="open-ai">[\s\S]*Build a tip with AI/);
  // the "this site isn't supported" screen
  assert.match(unsupportedView({ ...state, query: '' }, { site: null, tips: [] }), /data-action="open-ai">[\s\S]*Build a tip with AI/);
  // but not while the request form itself is open
  const open = { ...state, request: { ...state.request, open: true } };
  assert.ok(!resultsHtml(open, { site: docs, tips: [tip] }).includes('data-action="open-ai"'));
});
