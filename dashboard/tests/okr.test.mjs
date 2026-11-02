// Run: node --test "dashboard/tests/**/*.test.mjs"   (or npm test from the repo root)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { okr1FromRatings, okr2FromEvents, okrStatus, pctLabel } from '../okr.js';

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
