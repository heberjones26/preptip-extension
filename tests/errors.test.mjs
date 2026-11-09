// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scrub, reportMessage, createErrorReporter, ERROR_CATEGORIES, REPORT_REASONS } from '../src/lib/errors.js';

const migration = readFileSync(new URL('../supabase/migrations/20261109000000_error_log.sql', import.meta.url), 'utf8');

test('scrub removes URLs, emails, keys, long tokens and phone-like numbers', () => {
  assert.equal(scrub('failed at https://docs.google.com/spreadsheets/d/abc/edit now'), 'failed at [url] now');
  assert.equal(scrub('Error in chrome-extension://abcdefgh/src/x.js:12'), 'Error in [url]');
  assert.equal(scrub('email me at nelly.parker@school.edu please'), 'email me at [email] please');
  assert.equal(scrub('bad key AIzaSyA1234567890abcdef'), 'bad key [key]');
  assert.equal(scrub('token eyJhbGciOiJIUzI1NiJ9abcdefghijklmnopqrstuv'), 'token [token]');
  assert.equal(scrub('call 801-555-0142 about it'), 'call [number] about it');
  assert.equal(scrub('only 3 steps and 2 menus'), 'only 3 steps and 2 menus');
});

test('scrub collapses whitespace, truncates and tolerates junk input', () => {
  assert.equal(scrub('  a \n\n b\t c '), 'a b c');
  assert.equal(scrub('x'.repeat(500)), '[token]', 'one huge unbroken run looks like a secret');
  assert.equal(scrub('word '.repeat(200)).length, 200, 'default cap is 200 characters');
  assert.equal(scrub('x y '.repeat(200), 50).length, 50);
  assert.equal(scrub(undefined), '');
  assert.equal(scrub(null), '');
  assert.equal(scrub({ not: 'a string' }).length > 0, true);
});

test('reportMessage prefixes the fixed reason and scrubs what the teacher typed', () => {
  assert.equal(reportMessage('steps', ''), 'The steps didn’t match my screen');
  assert.equal(reportMessage('other', 'the menu is gone, mail nelly@school.edu'), 'Something else: the menu is gone, mail [email]');
  assert.equal(reportMessage('nope', 'x'), '');
  assert.ok(reportMessage('other', 'y'.repeat(2000)).length <= 500);
});

test('the report reasons and categories match the database constraints', () => {
  for (const c of ERROR_CATEGORIES) assert.ok(migration.includes(`'${c}'`), `category ${c} missing from the migration`);
  const checkLine = migration.match(/category\s+text not null check \(category in \(([^)]*)\)/)[1];
  assert.deepEqual(checkLine.split(',').map((s) => s.trim().replace(/'/g, '')), ERROR_CATEGORIES);
  for (const r of REPORT_REASONS) {
    assert.ok(ERROR_CATEGORIES.includes(r.category), `${r.id} has a bad category`);
    assert.ok(migration.includes(`'${r.label}'`), `error_groups() would hide the label "${r.label}"`);
  }
});

test('the reporter sends a clean event with the version and context', () => {
  const sent = [];
  const report = createErrorReporter({ send: (e) => sent.push(e), version: '0.2.0' });
  assert.equal(report({ category: 'load', context: 'catalog', message: new Error('Failed to fetch https://x.supabase.co/rest/v1/tips'), userId: 7 }), true);
  assert.deepEqual(sent[0], {
    source: 'auto', category: 'load', message: 'Failed to fetch [url]', context: 'catalog',
    tipId: null, urlPattern: null, userId: 7, version: '0.2.0'
  });
});

test('the reporter drops duplicates inside the window, then allows them again', () => {
  let t = 0;
  const sent = [];
  const report = createErrorReporter({ send: (e) => sent.push(e), now: () => t, windowMs: 60000 });
  const e = { category: 'guide', context: 'target-not-found step 2', message: 'Couldn’t find "Format"', tipId: 5 };
  assert.equal(report(e), true);
  t = 30000; assert.equal(report(e), false);
  assert.equal(report({ ...e, tipId: 6 }), true, 'a different tip is a different problem');
  t = 61000; assert.equal(report(e), true);
  assert.equal(sent.length, 3);
});

test('the reporter caps automatic errors per session but never blocks teacher reports', () => {
  const sent = [];
  const report = createErrorReporter({ send: (e) => sent.push(e), maxAuto: 3 });
  for (let i = 0; i < 10; i++) report({ category: 'ui', message: `boom ${i}` });
  assert.equal(sent.filter((e) => e.source === 'auto').length, 3);
  assert.equal(report({ source: 'reported', category: 'guide', message: 'The steps didn’t match my screen' }), true);
  assert.equal(report({ source: 'reported', category: 'guide', message: 'The steps didn’t match my screen' }), true, 'reports are not de-duplicated');
});

test('the reporter ignores empty messages, normalises unknown categories, and never throws', () => {
  const sent = [];
  const report = createErrorReporter({ send: (e) => sent.push(e) });
  assert.equal(report({ category: 'ui', message: '   ' }), false);
  assert.equal(report({ category: 'nonsense', message: 'x' }), true);
  assert.equal(sent[0].category, 'other');
  assert.equal(report(), false);
  const angry = createErrorReporter({ send: () => { throw new Error('transport exploded'); } });
  assert.doesNotThrow(() => angry({ category: 'ui', message: 'x' }));
  const rejecting = createErrorReporter({ send: () => Promise.reject(new Error('offline')) });
  assert.doesNotThrow(() => rejecting({ category: 'ui', message: 'y' }));
});

// ---------------------------------------------------------------------------
// The report form
// ---------------------------------------------------------------------------
import { reportView, footer } from '../src/sidepanel/views.js';

const reportState = (report = {}) => ({
  view: 'report', setupDone: true, teacher: { userId: 1, username: 'nelly' }, catalog: { websites: [], tips: [] },
  report: { reason: '', text: '', saving: false, sent: false, error: '', tip: null, returnTo: 'tips', ...report }
});

test('the report form offers every reason, marks the chosen one, and escapes the tip title', () => {
  const html = reportView(reportState({ reason: 'highlight', tip: { title: '<img src=x onerror=alert(1)>' } }));
  for (const r of REPORT_REASONS) assert.ok(html.includes(`data-reason="${r.id}"`), r.id);
  assert.match(html, /data-reason="highlight" aria-pressed="true"/);
  assert.match(html, /data-reason="steps" aria-pressed="false"/);
  assert.ok(!html.includes('<img'), 'tip title must be escaped');
  assert.match(html, /student names/);
});

test('the report form shows errors, a sending state, and a thank-you', () => {
  assert.match(reportView(reportState({ error: 'Pick what went wrong first.' })), /role="alert">Pick what went wrong first/);
  assert.match(reportView(reportState({ saving: true })), /disabled>Sending/);
  const sent = reportView(reportState({ sent: true }));
  assert.match(sent, /Thanks, we got it/);
  assert.ok(!sent.includes('<form'));
});

test('"Report a problem" is in the footer everywhere except on the report form itself', () => {
  assert.match(footer({ ...reportState(), view: 'tips' }), /data-action="report-problem">Report a problem/);
  assert.ok(!footer(reportState()).includes('data-action="report-problem"'));
});

test('writes to error_log are capped in the database, per account and overall', () => {
  assert.match(migration, /create trigger error_log_throttle\s+before insert on public\.error_log/);
  assert.match(migration, />= 300 then/);
  assert.match(migration, />= 100 then/);
  assert.match(migration, /security definer\s+-- the public key can't read error_log/);
});
