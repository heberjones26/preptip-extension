// Tiny Supabase REST (PostgREST) client. No SDK, so the extension needs no build step.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, CATALOG_TTL_MS } from '../config.js';
import { STORAGE } from './protocol.js';

// `token` is a signed-in teacher's Auth access token; without it requests run as the public (anon) role.
async function rest(path, { method = 'GET', body, prefer, token } = {}) {
  const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  if (token) headers.Authorization = `Bearer ${token}`;

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

// ---------- Sign-in: Supabase Auth email codes (OTP) ----------

// Errors carry Auth's HTTP status and error code (e.g. 429 'over_email_send_rate_limit', 403 'otp_expired').
async function authCall(path, { body, token } = {}) {
  const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body || {})
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    const err = new Error(`Supabase Auth ${path} failed (${res.status}) ${data?.msg || data?.error_description || ''}`.trim());
    err.status = res.status;
    err.code = data?.error_code || data?.code || data?.error || null;
    throw err;
  }
  return data;
}

// True when a PrepTip account already uses this email. Lets setup warn before sending a code.
export async function emailHasAccount(email) {
  return (await rest('rpc/teacher_email_exists', { method: 'POST', body: { p_email: email } })) === true;
}

// Emails the teacher a 6-digit code. Nothing is created in PrepTip until the code is verified.
export function sendSignInCode(email) {
  return authCall('otp', { body: { email, create_user: true } });
}

// Checks the code and returns the Auth session ({ access_token, ... }).
export function verifySignInCode(email, code) {
  return authCall('verify', { body: { type: 'email', email, token: code } });
}

// With a verified session: returns the teacher's existing account, or creates one with this name.
// -> { userId, firstName, lastName, email, isNew }
export async function signInTeacher(accessToken, { firstName, lastName }) {
  const rows = await rest('rpc/sign_in_teacher', {
    method: 'POST',
    token: accessToken,
    body: { p_first_name: firstName || null, p_last_name: lastName || null }
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row?.user_id) throw new Error('No account returned');
  return { userId: row.user_id, firstName: row.first_name || '', lastName: row.last_name || '', email: row.email, isNew: !!row.is_new };
}

// The Auth session is only used to prove the email, so it's ended right after sign-in.
export function endAuthSession(accessToken) {
  return authCall('logout', { token: accessToken }).catch(() => {});
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
