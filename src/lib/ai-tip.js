// "Build a tip with AI", minus the network: write the prompt, check what the AI sent back, and turn
// it into a tip the guide screen can follow. Pure and dependency-free so it can be unit-tested.
//
// Two ways to get the AI's answer feed the same parser: the teacher copies the prompt into ChatGPT /
// Claude / Gemini and pastes the reply back, or (optionally) PrepTip asks Gemini with the teacher's own
// free key (src/lib/gemini.js).

import { gradeLabel, subjectLabel, cleanSubjects } from '../data/segments.js';

export const MAX_QUESTION = 300;
export const MAX_SITE = 60;

// Where "Open ..." sends the teacher to paste the prompt.
export const AI_ASSISTANTS = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai/new' },
  { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app' }
];

const clean = (text, max) => String(text ?? '')
  .replace(/<[^>]*>/g, '')            // no markup: tips are plain text
  .replace(/[\u0000-\u001f\u007f]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

export function cleanQuestion(text) {
  return clean(text, MAX_QUESTION);
}

// The prompt the teacher copies (or that we send to Gemini). Everything in it is visible to the
// teacher first. `grade` is a readable label ("High school"), `subjects` readable labels.
export function buildPrompt({ question = '', site = '', grade = '', subjects = [] } = {}) {
  const what = cleanQuestion(question) || '(describe what you want to do)';
  const where = clean(site, MAX_SITE);
  const teaches = [grade, subjects.length ? `(${subjects.join(', ')})` : ''].filter(Boolean).join(' ');
  const about = teaches
    ? `About me: I teach ${teaches}. I'm busy and not very techy.`
    : `About me: I'm a busy teacher and not very techy.`;

  return [
    'You are helping a teacher use a website. I use a Chrome extension called PrepTip that gives teachers short, step-by-step how-to tips for the web tools they already use (Google Sheets, Canva, YouTube and so on). There is no tip yet for what I need, so please write one.',
    '',
    about,
    where ? `The website I'm on: ${where}.` : '',
    `What I want to do: ${what}`,
    '',
    'How to write the tip:',
    '- Use plain, friendly language for a busy teacher. No jargon.',
    '- Write 3 to 8 short steps. Each step is one action, in the order I would do it.',
    '- Name buttons and menus exactly as they appear on screen, in quotes, for example: Click "Insert" in the top menu.',
    `- Only describe things you are confident exist${where ? ` in ${where}` : ''}. Do not invent features. If a menu may be named differently depending on the version or account type, say so in "caution".`,
    '',
    'Reply with ONLY a JSON object: no other text and no markdown code fence. Use exactly this shape:',
    '{"title": "...", "summary": "...", "minutes": 2, "steps": ["...", "..."], "caution": "..."}',
    '- "title": starts with a verb, under 60 characters.',
    '- "summary": one sentence saying what the tip helps with.',
    '- "minutes": a whole number, about how long the task takes.',
    '- "steps": the steps as plain text strings, without numbering.',
    '- "caution": one short sentence, or "" if there is nothing to warn about.'
  ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n');
}

// The prompt for this teacher: their grade and subjects (from their class settings) plus what they typed.
export function promptFor({ question, site } = {}, teacher = null) {
  return buildPrompt({
    question,
    site,
    grade: gradeLabel(teacher?.gradeLevel),
    subjects: cleanSubjects(teacher?.subjects).filter((id) => id !== 'other').map(subjectLabel)
  });
}

const fail = (error) => ({ ok: false, error });

// First "{" to last "}" — copes with a ```json fence or a sentence before/after the object.
function extractJson(raw) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  return start !== -1 && end > start ? raw.slice(start, end + 1) : '';
}

function stepText(item) {
  const raw = typeof item === 'string' ? item
    : item && typeof item === 'object' ? (item.text ?? item.step ?? item.description ?? item.instruction ?? '')
    : '';
  return clean(String(raw).replace(/^\s*(?:\d+\s*[.)]|[-*•])\s*/, ''), 300);
}

// Check what the AI sent back. { ok: true, tip: { title, summary, minutes, steps, caution } } or
// { ok: false, error } with a message written for a teacher.
export function parseAiTip(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return fail('Paste the AI’s answer first.');

  const json = extractJson(raw);
  if (!json) return fail('That doesn’t look like the format we asked for. Make sure you copied the whole answer, including the { and } at the ends.');

  let data;
  try { data = JSON.parse(json); } catch {
    return fail('We couldn’t read that answer. Ask the AI to reply with only the JSON, then paste it again.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fail('That answer wasn’t in the format we asked for.');

  const title = clean(data.title, 80);
  if (title.length < 3) return fail('The answer is missing a title. Ask the AI to include one, then paste it again.');

  const steps = (Array.isArray(data.steps) ? data.steps : []).map(stepText).filter(Boolean).slice(0, 10);
  if (steps.length < 2) return fail('The answer needs at least two steps. Ask the AI for more detail, then paste it again.');

  const minutes = Number(data.minutes);
  return {
    ok: true,
    tip: {
      title,
      summary: clean(data.summary, 200) || steps[0].slice(0, 120),
      minutes: Number.isFinite(minutes) && minutes >= 1 ? Math.min(30, Math.round(minutes)) : Math.max(1, Math.round(steps.length / 2)),
      steps,
      caution: clean(data.caution, 200)
    }
  };
}

// A parsed tip as the same kind of object the catalog uses, so the guide screen can follow it.
// Every step is an instruction ("your turn"): nothing here is verified against a real page, so we
// never try to highlight anything. `ai: true` also keeps it out of ratings and the OKR counts.
export function toTip(parsed, { siteName = '', now = Date.now, random = Math.random } = {}) {
  const stamp = now();
  return {
    tip_id: `ai-${stamp}-${Math.floor(random() * 1e4)}`,
    ai: true,
    url_pattern: 'ai-generated',
    site_name: clean(siteName, MAX_SITE),
    created_at: new Date(stamp).toISOString(),
    title: parsed.title,
    summary: parsed.summary,
    caution: parsed.caution,
    description: parsed.caution ? `${parsed.summary} Heads up: ${parsed.caution}` : parsed.summary,
    feature_name: 'AI-generated',
    estimated_required_minutes: parsed.minutes,
    keywords: '',
    tip_steps: parsed.steps.map((description, i) => ({
      step_id: i + 1, step_order: i + 1, step_type: 'your_turn', target_element: null, step_description: description
    }))
  };
}

// Saved AI tips come back out of storage: keep only well-formed ones (newest first, at most `max`).
export function cleanSavedTips(list, max = 10) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((t) => t && t.ai === true && typeof t.tip_id === 'string' && typeof t.title === 'string'
      && Array.isArray(t.tip_steps) && t.tip_steps.length >= 2)
    .slice(0, max);
}

// The id of a tip in the database, or null for tips that only exist in this browser (AI tips).
// Anything that writes tip_id to Supabase must go through this: its foreign key rejects a made-up id.
export function dbTipId(tip) {
  return typeof tip?.tip_id === 'number' ? tip.tip_id : null;
}
