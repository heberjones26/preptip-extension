// Tiny Supabase REST (PostgREST) client. No SDK, so the extension needs no build step.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, CATALOG_TTL_MS } from '../config.js';
import { STORAGE } from './protocol.js';

// Errors carry the HTTP status and Postgres error code (e.g. '23505' when a username is taken).
async function rest(path, { method = 'GET', body, prefer } = {}) {
  const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (!res.ok) {
    let info = {};
    try { info = (await res.json()) || {}; } catch { /* empty body */ }
    const err = new Error(`Supabase ${method} ${path.split('?')[0]} failed (${res.status}) ${info.message || ''}`.trim());
    err.status = res.status;
    err.code = info.code || null;
    throw err;
  }
  // Inserts with `Prefer: return=minimal` answer 201 with an empty body.
  const text = await res.text();
  return text ? JSON.parse(text) : null;
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

// { [tip_id]: { helpful, total } } from the feedback table. Never cached, so a new
// thumbs-up shows the next time the panel loads.
export async function getTipRatings() {
  const rows = await rest('rpc/tip_ratings');
  return Object.fromEntries(rows.map((r) => [r.tip_id, { helpful: r.helpful_count, total: r.rating_count }]));
}

// ---------- Accounts: a unique username and a password ----------
// The database hashes the password; it never stores or returns it.

function toAccount(rows) {
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row?.user_id ? { userId: row.user_id, username: row.username } : null;
}

// -> { userId, username }. Throws with code '23505' when the username is taken.
export async function createAccount({ username, password }) {
  const account = toAccount(await rest('rpc/create_teacher_account', {
    method: 'POST',
    body: { p_username: username, p_password: password }
  }));
  if (!account) throw new Error('No account returned');
  return account;
}

// -> { userId, username }, or null when the username or password is wrong.
export async function signIn({ username, password }) {
  return toAccount(await rest('rpc/sign_in_teacher', {
    method: 'POST',
    body: { p_username: username, p_password: password }
  }));
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

// Logs a usage event for OKR tracking (events table, see supabase/migrations/..._usage_events.sql).
// Fire-and-forget: a logging failure must never interrupt what the teacher is doing, so we swallow
// errors here. (Before the migration is applied this will fail quietly, which is fine.)
// `label` carries a free-text name (e.g. the resource opened) for events that aren't tied to a tip.
export function logEvent({ type, userId = null, tipId = null, urlPattern = null, label = null, sessionId = null }) {
  return rest('events', {
    method: 'POST',
    prefer: 'return=minimal',
    body: { event_type: type, user_id: userId, tip_id: tipId, url_pattern: urlPattern, label, session_id: sessionId }
  }).catch((err) => { console.warn('PrepTip: could not log event', type, err); });
}

// Writes one row to error_log (supabase/migrations/..._error_log.sql). Throws, so the "Report a problem"
// form can tell the teacher it didn't go through.
export function submitErrorReport({ source, category, message, context = null, tipId = null, urlPattern = null, userId = null, version = null }) {
  return rest('error_log', {
    method: 'POST',
    prefer: 'return=minimal',
    body: { source, category, message, context, tip_id: tipId, url_pattern: urlPattern, user_id: userId, version: version || null }
  });
}

// Fire-and-forget for automatic reports: logging a problem must never cause another one.
export function logError(event) {
  return submitErrorReport(event).catch((err) => { console.debug('PrepTip: could not log an error', err); });
}

// A teacher suggesting a site for the Common Teacher Resources list (a feedback row, no tip_id).
export function requestResource({ userId, text }) {
  return submitFeedback({ userId, tipId: null, text: `Resource request: ${text}` });
}
