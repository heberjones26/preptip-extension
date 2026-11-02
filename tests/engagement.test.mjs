import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateEngagement, engagementReport, createDwellTracker } from '../src/lib/engagement.js';
const event = (kind, sessionId = 's1', extra = {}) => ({ kind, sessionId, userId: 1, ...extra });
const now = new Date('2026-11-02T09:00:00');

test('opening denominator, deduplication, multiple tips, strict threshold and filtering', () => {
  let data;
  const apply = (e, id = 1) => { data = updateEngagement(data, e, id, now); };
  apply(event('open'));
  apply(event('open'));
  apply(event('open', 's2'));
  apply(event('click', 's1', { visitId: 'v1', tipId: 8 }));
  apply(event('click', 's1', { visitId: 'v1', tipId: 8 }));
  assert.equal(engagementReport(data).tipClicks, 1);
  assert.throws(() => apply(event('success', 's1', { visitId: 'v1', visibleMs: 10000 })));
  apply(event('success', 's1', { visitId: 'v1', visibleMs: 10001 }));
  apply(event('success', 's1', { visitId: 'v1', visibleMs: 11000 }));
  apply(event('click', 's1', { visitId: 'v2', tipId: 9 }));
  apply(event('success', 's1', { visitId: 'v2', visibleMs: 12000 }));
  assert.deepEqual(engagementReport(data), {
    openings: 2, openingsWithTipClick: 1, successfulOpenings: 1,
    tipClicks: 2, clickRate: 0.5, successfulUseRate: 0.5
  });
  assert.equal(engagementReport(data, { week: '2026-11-09' }).openings, 0);
  assert.equal(engagementReport(data, { userId: 2 }).successfulUseRate, null);
  assert.throws(() => apply(event('success', 's2', { visitId: 'missing', visibleMs: 11000 })));
  assert.throws(() => apply(event('click', 's1', { visitId: 'v3', tipId: 2 }), 2));
});

function timerHarness() {
  let clock = 0;
  let callback;
  const results = [];
  const tracker = createDwellTracker({ now: () => clock,
    schedule: (fn) => { callback = fn; return 1; }, cancel: () => { callback = null; },
    success: (...args) => results.push(args) });
  return { tracker, results, advanceWithoutCallbacks(ms) { clock += ms; }, tick(ms) { clock += ms; const fn = callback; callback = null; fn?.(); } };
}

test('dwell requires more than ten continuous visible seconds and emits once', () => {
  const h = timerHarness();
  h.tracker.start('v1');
  h.tick(10000);
  assert.equal(h.results.length, 0);
  h.tick(1);
  assert.deepEqual(h.results, [['v1', 10001]]);
  h.tick(10000);
  assert.equal(h.results.length, 1);
});

test('hidden time, leaving a tip, and switching tips cannot produce false success', () => {
  const h = timerHarness();
  h.tracker.start('v1');
  h.tick(9000);
  h.tracker.visibility(true);
  h.tick(60000);
  h.tracker.visibility(false);
  h.tick(9000);
  assert.equal(h.results.length, 0);
  h.tracker.start('v2');
  h.tick(9000);
  h.tracker.stop();
  h.tick(20000);
  assert.equal(h.results.length, 0);
  h.tracker.start('v3', true);
  h.tick(20000);
  assert.equal(h.results.length, 0);
  h.tracker.visibility(false);
  h.tick(10001);
  assert.equal(h.results[0][0], 'v3');
});


test('qualifying dwell is saved when leaving before a delayed timer callback', () => {
  for (const end of ['stop', 'hide', 'next-tip']) {
    const h = timerHarness();
    h.tracker.start('first');
    h.advanceWithoutCallbacks(11000);
    if (end === 'stop') h.tracker.stop();
    if (end === 'hide') h.tracker.visibility(true);
    if (end === 'next-tip') h.tracker.start('second');
    assert.deepEqual(h.results, [['first', 11000]]);
  }
});

test('reserved object keys and cross-teacher session reuse are rejected', () => {
  assert.throws(() => updateEngagement(null, event('open', '__proto__'), 1));
  assert.throws(() => updateEngagement(null, event('open', 'constructor'), 1));
  const data = updateEngagement(null, event('open'), 1, now);
  assert.throws(() => updateEngagement(data, event('open'), 2, now));
});
