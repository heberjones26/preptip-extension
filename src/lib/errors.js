// Error reporting for the extension itself: scrub, de-duplicate and cap what gets sent.
// Pure and dependency-free so it can be unit-tested; the actual network call is injected
// (supabase.js logError). Reporting must never break the panel, so nothing in here throws.

// Keep in sync with the CHECK on error_log.category (tests/errors.test.mjs compares them).
export const ERROR_CATEGORIES = ['load', 'network', 'guide', 'ui', 'account', 'other'];

const MAX_AUTO = 200;
const MAX_REPORT = 500;

// What a teacher can pick in "Report a problem". The label is stored as the start of the message
// (before the first ':'), and error_groups() in the migration only returns these exact labels.
export const REPORT_REASONS = [
  { id: 'steps', label: 'The steps didn’t match my screen', category: 'guide' },
  { id: 'highlight', label: 'The highlight was in the wrong place', category: 'guide' },
  { id: 'load', label: 'Something didn’t load', category: 'load' },
  { id: 'other', label: 'Something else', category: 'other' }
];

// Strip anything that could identify a person, a page or a secret before it leaves the browser.
export function scrub(text, max = MAX_AUTO) {
  return String(text ?? '')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, '[url]')       // https://…, chrome-extension://…
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]')
    .replace(/\b(?:sk-|AIza|ghp_|gho_|sb_)[\w-]{8,}/g, '[key]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[token]')
    .replace(/\b\d[\d\s().-]{6,}\d\b/g, '[number]')             // phone / ID-like digit runs
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// The message a teacher's report is stored with: "<reason label>: <what they wrote>".
export function reportMessage(reasonId, text) {
  const reason = REPORT_REASONS.find((r) => r.id === reasonId);
  if (!reason) return '';
  const note = scrub(text, MAX_REPORT - reason.label.length - 2);
  return note ? `${reason.label}: ${note}` : reason.label;
}

// Returns report(event): true when it was sent, false when it was dropped (duplicate, over the cap,
// or empty). Automatic errors are de-duplicated for `windowMs` and capped per session, so one broken
// page can't flood the log.
export function createErrorReporter({ send, version = '', now = Date.now, windowMs = 60000, maxAuto = 20 }) {
  const lastSent = new Map();
  let autoCount = 0;

  return function report(event = {}) {
    try {
      const source = event.source === 'reported' ? 'reported' : 'auto';
      const category = ERROR_CATEGORIES.includes(event.category) ? event.category : 'other';
      const message = scrub(event.message instanceof Error ? event.message.message : event.message,
        source === 'reported' ? MAX_REPORT : MAX_AUTO);
      if (!message) return false;
      const context = scrub(event.context, 80) || null;

      if (source === 'auto') {
        const key = [category, context, message, event.tipId ?? ''].join('|');
        const t = now();
        if (lastSent.has(key) && t - lastSent.get(key) < windowMs) return false;
        if (autoCount >= maxAuto) return false;
        lastSent.set(key, t);
        autoCount += 1;
      }

      Promise.resolve(send({
        source, category, message, context,
        tipId: event.tipId ?? null,
        urlPattern: event.urlPattern ?? null,
        userId: event.userId ?? null,
        version
      })).catch(() => {});
      return true;
    } catch {
      return false;
    }
  };
}
