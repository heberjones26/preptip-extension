// Tiny Supabase REST (PostgREST) client. No SDK, so the extension needs no build step.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, CATALOG_TTL_MS } from '../config.js';
import { STORAGE } from './protocol.js';

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).message || ''; } catch { /* empty body */ }
    throw new Error(`Supabase ${method} ${path.split('?')[0]} failed (${res.status}) ${detail}`.trim());
  }
  return res.status === 204 ? null : res.json();
}

// Websites plus every tip with its ordered steps. The catalog is small, so we fetch it whole.
export async function fetchCatalog() {
  const [websites, tips] = await Promise.all([
    rest('websites?select=url_pattern,name&order=name'),
    rest('tips?select=tip_id,url_pattern,title,summary,description,feature_name,estimated_required_minutes,keywords,' +
         'tip_steps(step_id,step_order,step_type,target_element,step_description)&order=tip_id')
  ]);
  for (const tip of tips) tip.tip_steps.sort((a, b) => a.step_order - b.step_order);
  return { fetchedAt: Date.now(), websites, tips };
}

// Cached catalog. Falls back to a stale copy when offline so the panel still works on bad school wifi.
export async function getCatalog({ force = false } = {}) {
  const { [STORAGE.CATALOG]: cached } = await chrome.storage.local.get(STORAGE.CATALOG);
  if (!force && cached && Date.now() - cached.fetchedAt < CATALOG_TTL_MS) return cached;

  try {
    const fresh = await fetchCatalog();
    await chrome.storage.local.set({ [STORAGE.CATALOG]: fresh });
    return fresh;
  } catch (err) {
    if (cached) return { ...cached, stale: true };
    throw err;
  }
}

// Finds or creates the teacher by email and returns their user_id.
export function registerTeacher({ firstName, lastName, email }) {
  return rest('rpc/register_teacher', {
    method: 'POST',
    body: { p_first_name: firstName, p_last_name: lastName, p_email: email }
  });
}

export function submitFeedback({ userId, tipId, isHelpful = null, text = null }) {
  return rest('feedback', {
    method: 'POST',
    prefer: 'return=minimal',
    body: { user_id: userId, tip_id: tipId, is_helpful: isHelpful, feedback_text: text || null }
  });
}

// Tip requests are feedback rows with no tip_id.
export function requestTip({ userId, siteName, text }) {
  const where = siteName ? ` (${siteName})` : '';
  return submitFeedback({ userId, tipId: null, text: `Tip request${where}: ${text}` });
}
