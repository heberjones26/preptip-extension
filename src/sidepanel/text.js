// Small, pure text helpers for the side panel. No DOM, no chrome.* calls, so they're easy to test.
import { parseTarget } from '../lib/sites.js';

// Escape any text that came from the database (or the user) before it goes into innerHTML.
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// "Google Sheets" -> "Sheets" (used in short labels like "All Sheets tips").
export function shortSiteName(name) {
  return (name || '').replace(/^Google\s+/, '') || name || '';
}

export function hostOf(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    // Already a bare host like "bit.ly"?
    return String(url || '').replace(/^www\./, '').split('/')[0];
  }
}

export function isWebUrl(url) {
  return /^https?:\/\//i.test(url || '');
}

export function isValidEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((email || '').trim());
}

// "role:Viewer" -> "Viewer". Some path segments carry a little prefix of their own.
export function cleanSegment(seg) {
  return (seg || '').replace(/^[a-z_]+:/i, '').trim();
}

export function targetPath(step) {
  return parseTarget(step?.target_element).path.map(cleanSegment).filter(Boolean);
}

export function targetKind(step) {
  return parseTarget(step?.target_element).kind;
}

// "Where it lives" breadcrumb: the deepest menu/button path in the tip,
// e.g. ["Format", "Conditional formatting"]. Returns null when the tip has none.
export function wherePath(tip) {
  let best = null;
  for (const step of tip.tip_steps || []) {
    const kind = targetKind(step);
    if (kind !== 'menu' && kind !== 'button') continue;
    const path = targetPath(step);
    if (!best) best = path;
    else if (path[0] === best[0] && path.length > best.length) best = path;
  }
  return best && best.length ? best : null;
}

// "Click Format in the top menu. It's highlighted." -> { head: "Click Format in the top menu.", rest: "It's highlighted." }
export function firstSentence(text) {
  const t = (text || '').trim();
  const m = t.match(/^(.+?[.!?])\s+(\S[\s\S]*)$/);
  return m ? { head: m[1], rest: m[2] } : { head: t, rest: '' };
}

// Escape the text, then bold the target names in it ("Click <b>Format</b> in the top menu").
export function emphasize(text, segments) {
  const safe = esc(text);
  const words = [...new Set(segments.map(esc).filter((s) => s.length > 1))]
    .sort((a, b) => b.length - a.length);
  if (!words.length) return safe;
  const pattern = words
    .map((w) => {
      const body = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const start = /^\w/.test(w) ? '\\b' : '';
      const end = /\w$/.test(w) ? '\\b' : '';
      return start + body + end;
    })
    .join('|');
  return safe.replace(new RegExp(pattern, 'g'), (m) => `<b>${m}</b>`);
}

// ---------- "Your turn" instructions -> numbered pins ----------

// Marks characters inside balanced (...) and "..." so we never split there.
function protectedMask(text) {
  const mask = new Array(text.length).fill(false);
  const open = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') open.push(i);
    if (text[i] === ')' && open.length) {
      const start = open.pop();
      for (let j = start; j <= i; j++) mask[j] = true;
    }
  }
  const quotes = [...text.matchAll(/"[^"]*"|“[^”]*”/g)];
  for (const q of quotes) for (let j = q.index; j < q.index + q[0].length; j++) mask[j] = true;
  return mask;
}

// Pieces that start with these words belong to the previous action ("..., including every column").
const JOINERS = /^(including|not|like|or|but|which|so|because|if|with|without|such)\b/i;

function tidy(part) {
  const t = part.trim().replace(/[.;]+$/, '');
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

// "Set your rule: type the range, choose a color, then click Done."
//   -> { lead: "Set your rule", items: ["Type the range", "Choose a color", "Click Done"] }
// Returns items = [] when the text is really one action (show it as one block).
export function splitActions(text) {
  const t = (text || '').trim();
  const mask = protectedMask(t);

  let lead = '';
  let body = t;
  const colon = t.indexOf(': ');
  if (colon > 0 && colon < 60 && !mask[colon]) {
    lead = t.slice(0, colon).trim();
    body = t.slice(colon + 1).trim();
  }

  const bodyStart = t.length - body.length;
  const separators = /,\s*(?:and\s+)?then\s+|\s+then\s+|,\s+|\.\s+(?=[A-Z])/g;
  const parts = [];
  let from = 0;
  for (const m of body.matchAll(separators)) {
    if (mask[bodyStart + m.index]) continue;
    parts.push(body.slice(from, m.index));
    from = m.index + m[0].length;
  }
  parts.push(body.slice(from));

  // Glue "including ..." / "not just ..." back onto the action before it.
  const items = [];
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    if (items.length && JOINERS.test(p)) items[items.length - 1] += `, ${p}`;
    else items.push(p);
  }

  const clean = items.map(tidy).filter(Boolean);
  return clean.length >= 2 ? { lead, items: clean } : { lead: '', items: [] };
}

// Copy for the off-track banner (mockup 4A).
export function offtrackCopy(off, step) {
  const path = targetPath(step);
  const leaf = path[path.length - 1] || off.expected;
  const title = `That’s the ${off.clicked} menu: easy mix-up!`;
  const lead = leaf && leaf !== off.expected
    ? `${leaf} lives under ${off.expected}.`
    : `You’re looking for ${off.expected}.`;
  return {
    title,
    body: `${lead} Close this menu and click ${off.expected} (it’s highlighted).`
  };
}
