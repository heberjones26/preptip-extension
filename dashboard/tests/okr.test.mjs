// Run: node --test "dashboard/tests/**/*.test.mjs"   (or npm test from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { okr1FromRatings, okr2FromEvents, okrStatus, pctLabel, kr3Weeks, kr4Weeks, daysSpread } from '../okr.js';

test('okr1: sums 👍/👎 across tips into one program-wide percent', () => {
  const ratings = {
    1: { helpful: 8, total: 10 },
    2: { helpful: 1, total: 2 },
    3: { helpful: 0, total: 0 }, // a tip no one has rated yet contributes nothing
  };
  const r = okr1FromRatings(ratings);
  assert.equal(r.helpful, 9);
  assert.equal(r.total, 12);
  assert.equal(r.pct, 9 / 12);
  assert.equal(r.enough, true); // 12 >= floor 5
  assert.equal(r.status, 'below'); // 9/12 = 75% < 80% target
});

test('okr1: 75% is below the 80% target', () => {
  const r = okr1FromRatings({ 1: { helpful: 9, total: 12 } });
  assert.equal(r.status, 'below');
});

test('okr1: under the response floor reads as insufficient, not a fake 100%', () => {
  const r = okr1FromRatings({ 1: { helpful: 3, total: 3 } }); // 100% but only 3 responses
  assert.equal(r.pct, 1);
  assert.equal(r.enough, false);
  assert.equal(r.status, 'insufficient');
});

test('okr1: no ratings at all → null percent, insufficient', () => {
  const r = okr1FromRatings({});
  assert.equal(r.total, 0);
  assert.equal(r.pct, null);
  assert.equal(r.status, 'insufficient');
});

test('okr1: meets target at exactly 80% with enough responses', () => {
  const r = okr1FromRatings({ 1: { helpful: 8, total: 10 } });
  assert.equal(r.pct, 0.8);
  assert.equal(r.status, 'on-track');
});

test('okr2: completion count is the headline; rate is completions/opens', () => {
  const r = okr2FromEvents({ opens: 10, completions: 7 });
  assert.equal(r.completions, 7);
  assert.equal(r.rate, 0.7);
  assert.equal(r.enough, true);
  assert.equal(r.status, 'on-track'); // 70% >= default 60%
});

test('okr2: below the floor is insufficient regardless of rate', () => {
  const r = okr2FromEvents({ opens: 2, completions: 2 });
  assert.equal(r.rate, 1);
  assert.equal(r.enough, false);
  assert.equal(r.status, 'insufficient');
});

test('okr2: no opens yet → null rate', () => {
  const r = okr2FromEvents({ opens: 0, completions: 0 });
  assert.equal(r.rate, null);
  assert.equal(r.status, 'insufficient');
});

test('okr2: respects a custom target rate from config', () => {
  const r = okr2FromEvents({ opens: 20, completions: 10 }, { targetRate: 0.8 });
  assert.equal(r.rate, 0.5);
  assert.equal(r.status, 'below');
});

test('okrStatus: insufficient wins even above target', () => {
  assert.equal(okrStatus(1, 0.8, { enough: false }), 'insufficient');
  assert.equal(okrStatus(0.9, 0.8, { enough: true }), 'on-track');
  assert.equal(okrStatus(0.5, 0.8, { enough: true }), 'below');
});

test('pctLabel: rounds, and dashes on no data', () => {
  assert.equal(pctLabel(0.754), '75%');
  assert.equal(pctLabel(1), '100%');
  assert.equal(pctLabel(null), '—');
  assert.equal(pctLabel(NaN), '—');
});

// --- OKR 3 / 4 week by week -----------------------------------------------------------------
test('kr3Weeks: averages per week, flags weeks that meet the target, marks the newest as partial', () => {
  const w = kr3Weeks([
    { week_start: '2026-11-02', teachers: 2, qualifying: 1, avg_office_days: '3.50' },
    { week_start: '2026-11-09', teachers: 3, qualifying: 1, avg_office_days: '1.33' },
  ], { targetDays: 3, ofDays: 5 });
  assert.deepEqual(w.map((x) => x.value), [3.5, 1.33]);
  assert.deepEqual(w.map((x) => x.hit), [true, false]);
  assert.deepEqual(w.map((x) => x.partial), [false, true]);
  assert.equal(w[0].qualifying, 1);
});

test('kr3Weeks: a week with no teachers is "no data", not zero days; values are clamped to the scale', () => {
  const w = kr3Weeks([
    { week_start: '2026-10-26', teachers: 0, qualifying: 0, avg_office_days: 0 },
    { week_start: '2026-11-02', teachers: 1, qualifying: 1, avg_office_days: 9 },
  ]);
  assert.equal(w[0].value, null);
  assert.equal(w[0].hit, false);
  assert.equal(w[1].value, 5);
  assert.deepEqual(kr3Weeks(null), []);
  assert.deepEqual(kr3Weeks('nope'), []);
});

test('kr4Weeks: engaged over opens per week; an empty week is null (not 0%); never above 100%', () => {
  const w = kr4Weeks([
    { week_start: '2026-10-26', opens: 0, engaged: 0 },
    { week_start: '2026-11-02', opens: 7, engaged: 1 },
    { week_start: '2026-11-09', opens: 2, engaged: 5 }, // a dwell can land in a later week than its open
  ]);
  assert.equal(w[0].value, null);
  assert.equal(w[1].value, 1 / 7);
  assert.equal(w[2].value, 1);
  assert.equal(w[2].partial, true);
  assert.deepEqual(kr4Weeks(undefined), []);
});

test('daysSpread: reads like a sentence, skips empty rows, handles weekend-only and singular', () => {
  assert.equal(daysSpread([
    { office_days: 0, teachers: 1 }, { office_days: 1, teachers: 2 }, { office_days: 2, teachers: 0 }, { office_days: 3, teachers: 1 },
  ]), '1 teacher on weekends only · 2 teachers on 1 office day · 1 teacher on 3 office days');
  assert.equal(daysSpread([]), '');
  assert.equal(daysSpread(null), '');
  assert.equal(daysSpread([{ office_days: 'x', teachers: 3 }]), '');
});
