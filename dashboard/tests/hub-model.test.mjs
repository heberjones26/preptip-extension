// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, sampleRaw, trimWeeks, sparkline, dotsFor, deltaFor, statusFor, pct, mondays, agoText } from '../hub-model.js';

const empty = { mode: 'live', asof: new Date(), catalog: {}, ratings: { up: 0, total: 0 }, completions: { started: 0, finished: 0 }, usageWeeks: [], engagement: { opens: 0, engaged: 0 }, engWeeks: [], requests: [], tipPerf: [], resources: [], ai: {}, errors: {} };

test('no minimums: one rating shows its value with its sample size, never a "not enough data" state', () => {
  const m = buildModel({ ...empty, ratings: { up: 1, total: 1 } });
  const t = m.tiles.kr1;
  assert.equal(t.valueText, '100%');
  assert.equal(t.status, 'on');
  assert.match(t.sub, /1 of 1 rating was thumbs-up/);
  assert.deepEqual(t.dots, [true]);
  assert.ok(!JSON.stringify(m).toLowerCase().includes('not enough data'));
});

test('an empty database renders every tile as "No data yet" without crashing', () => {
  const m = buildModel(empty);
  assert.equal(m.hasAnyData, false);
  for (const t of Object.values(m.tiles)) { assert.equal(t.status, 'none'); assert.equal(t.statusText, 'No data yet'); assert.equal(t.valueText, '—'); }
  assert.deepEqual(m.requests, []); assert.deepEqual(m.usage.resources, []);
});

test('status is value against goal, nothing else', () => {
  assert.equal(statusFor(80, 80), 'on'); assert.equal(statusFor(79, 80), 'below'); assert.equal(statusFor(null, 80), 'none');
  assert.equal(pct(7, 10), 70); assert.equal(pct(0, 0), null);
});

test('KR3 uses the latest week that has teachers, and says which week', () => {
  const m = buildModel({ ...empty, usageWeeks: [
    { week_start: '2026-11-02', teachers: 2, qualifying: 0, avg_office_days: 0.5 },
    { week_start: '2026-11-09', teachers: 4, qualifying: 2, avg_office_days: 2.0 },
    { week_start: '2026-11-16', teachers: 0, qualifying: 0, avg_office_days: 0 }] });
  assert.equal(m.tiles.kr3.valueText, '2.0');
  assert.match(m.tiles.kr3.sub, /2 of 4 teachers .* week of Nov 9/);
  assert.equal(m.tiles.kr3.status, 'below');
  assert.equal(m.tiles.kr3.delta.dir, 1, 'up from 0.5 to 2.0 across the two weeks with data');
  assert.match(m.tiles.kr3.delta.text, /^\+1\.5 days vs last week$/);
  assert.equal(m.tiles.kr3.spark, null, 'two weeks of data is not a trend line');
});

test('trimWeeks starts at the first active week but never shows fewer than 4', () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({ week_start: `w${i}`, v: i >= 5 ? 3 : 0 }));
  assert.deepEqual(trimWeeks(rows, 'v').map((r) => r.week_start), ['w4', 'w5', 'w6', 'w7']);
  const early = Array.from({ length: 8 }, (_, i) => ({ week_start: `w${i}`, v: i >= 1 ? 3 : 0 }));
  assert.equal(trimWeeks(early, 'v').length, 7);
  assert.equal(trimWeeks(rows.map((r) => ({ ...r, v: 0 })), 'v').length, 4, 'all empty: still 4 columns');
  assert.deepEqual(trimWeeks(null, 'v'), []);
});

test('sparkline breaks at gaps instead of drawing a false zero, and stays inside its box', () => {
  const s = sparkline([1, null, 3, 4], 5, 96, 28);
  assert.equal((s.d.match(/M/g) || []).length, 2, 'a gap starts a new segment');
  assert.ok(s.last.x <= 96 && s.last.y >= 0 && s.last.y <= 28);
  assert.equal(sparkline([null, null], 5), null);
  assert.equal(sparkline([], 5), null);
  assert.ok(sparkline([9], 5).last.y >= 0, 'values above the domain are clamped');
});

test('unit dots only for modest counts', () => {
  assert.deepEqual(dotsFor(2, 3), [true, true, false]);
  assert.equal(dotsFor(0, 0), null); assert.equal(dotsFor(50, 100), null); assert.equal(dotsFor(47, 52).length, 52, 'a few dozen still fits as small dots');
});

test('deltaFor compares the last two points that have data', () => {
  assert.deepEqual(deltaFor([null, 40, null, 55], (x) => String(x), ' pts'), { text: '+15 pts vs last week', dir: 1 });
  assert.equal(deltaFor([5], (x) => x), null);
  assert.equal(deltaFor([3, 3], (x) => x).dir, 0);
});

test('the sample set drives the same model and is fully populated', () => {
  const m = buildModel(sampleRaw(new Date('2026-11-16T12:00:00')));
  assert.equal(m.mode, 'sample');
  assert.ok(m.hasAnyData);
  assert.deepEqual(Object.values(m.tiles).map((t) => t.status), ['on', 'on', 'on', 'on']);
  assert.equal(m.requests.length, 6); assert.equal(m.tipPerf.length, 6); assert.equal(m.usage.resources.length, 5);
  assert.equal(m.trends.opens.length, 7, 'starts at the first active week'); assert.ok(m.trends.opens[0].opens > 0 && m.trends.teachers[0].teachers > 0);
  assert.ok(m.requests[0].width === 100 && m.requests.every((r, i, a) => !i || r.width <= a[i - 1].width), 'ranked, widest first');
  assert.ok(m.health.per100 > 0);
});

test('small helpers', () => {
  assert.equal(mondays(3, new Date('2026-11-18T12:00:00')).at(-1), '2026-11-16');
  assert.equal(agoText('2026-11-16T10:00:00Z', Date.parse('2026-11-16T10:30:00Z')), '30m ago');
  assert.equal(agoText('2026-11-14T10:00:00Z', Date.parse('2026-11-16T12:00:00Z')), '50h ago'.replace('50h', '2d'));
});
