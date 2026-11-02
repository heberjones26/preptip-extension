import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metricsHarness } from './helpers/metrics-harness.mjs';
import { USAGE_KEY, weeklyReport } from '../src/lib/usage.js';
import { ENGAGEMENT_KEY, engagementReport } from '../src/lib/engagement.js';
import { createMetricsRecorder } from '../src/lib/metrics.js';
import { STORAGE } from '../src/lib/protocol.js';
const summary = (h) => engagementReport(h.saved[ENGAGEMENT_KEY]);
const openings = (h) => weeklyReport(h.saved[USAGE_KEY], '2026-11-02').teachers.reduce((n, t) => n + t.totalOpens, 0);

test('both trackers count A → B → A consistently and normalize ID types', async () => {
  const h = metricsHarness();
  for (const id of [1, 2, 1, '1']) {
    h.saved[STORAGE.TEACHER] = { userId: id };
    h.tracker.open(id);
    await h.tracker.flush();
  }
  assert.equal(openings(h), 3);
  assert.equal(summary(h).openings, 3);
  assert.equal(weeklyReport(h.saved[USAGE_KEY], '2026-11-02').teachers[0].distinctOfficeDays, 1);
});

test('opening, click and success survive failed writes and lost acknowledgements exactly once', async () => {
  const h = metricsHarness();
  h.fail();
  h.tracker.open(1);
  h.tracker.click(9);
  await h.tracker.flush();
  assert.equal(summary(h).openings, 0);
  await h.tick(250);
  assert.equal(summary(h).openings, 1);
  assert.equal(summary(h).tipClicks, 1);
  h.loseAck();
  await h.tick(10001);
  await h.tick(250);
  assert.equal(summary(h).successfulOpenings, 1);
  assert.equal(openings(h), 1);
  h.loseAck();
  h.lifecycle(false); h.lifecycle(true);
  await h.tracker.flush();
  await h.tick(250);
  assert.equal(openings(h), 2);
  assert.equal(summary(h).openings, 2);
});

test('hiding resets dwell; hiding/restoring a window does not create extra openings', async () => {
  const h = metricsHarness(); h.tracker.open(1); h.tracker.click(8);
  await h.tick(9000);
  h.hidden(true);
  await h.tick(60000);
  h.hidden(false);
  await h.tick(9000);
  assert.equal(summary(h).successfulOpenings, 0);
  await h.tick(1001);
  assert.equal(summary(h).successfulOpenings, 1);
  assert.equal(openings(h), 1);
});

test('native close/reopen of a retained document counts once and requires a new click', async () => {
  const h = metricsHarness(); h.tracker.open(1); h.tracker.click(8);
  await h.tick(5000);
  h.lifecycle(false);
  await h.tick(20000);
  assert.equal(summary(h).successfulOpenings, 0);
  h.lifecycle(true); h.lifecycle(true);
  await h.tick(11000);
  assert.equal(summary(h).openings, 2);
  assert.equal(openings(h), 2);
  assert.equal(summary(h).successfulOpenings, 0);
  h.tracker.click(8); await h.tick(10001);
  assert.equal(summary(h).successfulUseRate, 0.5);
});

test('events for other panels/windows do not alter this panel', async () => {
  const h = metricsHarness(); h.tracker.open(1); await h.tracker.flush();
  h.lifecycle(false, 20); h.lifecycle(true, 20);
  h.lifecycle(false, 10, 'another.html'); h.lifecycle(true, 10, 'another.html');
  h.tracker.click(8); await h.tick(10001);
  assert.equal(summary(h).openings, 1);
  assert.equal(summary(h).successfulOpenings, 1);
});

test('hidden startup waits for visibility; previews never record', async () => {
  const h = metricsHarness({ hidden: true }); h.tracker.open(1); await h.tracker.flush();
  assert.equal(summary(h).openings, 0);
  h.hidden(false); await h.tracker.flush();
  assert.equal(summary(h).openings, 1);
  const preview = metricsHarness({ preview: true });
  preview.tracker.open(1); preview.tracker.click(8); await preview.tick(20000);
  assert.equal(preview.sent.length, 0);
});

test('older Chrome works without optional lifecycle APIs', async () => {
  const h = metricsHarness({ modern: false }); h.tracker.open(1); h.tracker.click(8);
  await h.tick(10001);
  assert.equal(summary(h).successfulUseRate, 1);
});

test('session identity survives profile changes and worker restarts, rejects other documents', async () => {
  const h = metricsHarness(); h.tracker.open(1); h.tracker.click(8); await h.tracker.flush();
  h.saved[STORAGE.TEACHER] = { userId: 2 };
  h.resetWorker();
  await h.tick(10001);
  assert.equal(engagementReport(h.saved[ENGAGEMENT_KEY], { userId: 1 }).successfulOpenings, 1);
  const record = createMetricsRecorder(h.storage);
  const result = await record({ ...h.sent[1], visitId: 'foreign' }, 'other-document');
  assert.equal(result.ok, false);
  assert.equal(summary(h).tipClicks, 1);
});

test('concurrent panels and retries preserve both counters and old KR 3 history', async () => {
  const h = metricsHarness();
  h.saved[USAGE_KEY] = { version: 1, teachers: { 'teacher:1': { userId: 1, firstSeen: '2026-10-26T10:00:00Z', days: {
    '2026-10-26': { date: '2026-10-26', week: '2026-10-26', weekday: 1, opens: 3, hours: Array(24).fill(0), firstOpen: '2026-10-26T10:00:00Z', lastOpen: '2026-10-26T10:00:00Z' }
  } } } };
  const record = createMetricsRecorder(h.storage, { now: () => new Date('2026-11-02T09:00:00') });
  await Promise.all(Array.from({ length: 20 }, (_, i) => record({ kind: 'open', sessionId: `session-${i % 10}`, userId: 1 }, `doc-${i % 10}`)));
  assert.equal(openings(h), 10);
  assert.equal(summary(h).openings, 10);
  assert.equal(weeklyReport(h.saved[USAGE_KEY], '2026-10-26').teachers[0].totalOpens, 3);
});

test('delayed close and rapid tips save success against the correct visit', async () => {
  const h = metricsHarness(); h.tracker.open(1); h.tracker.click(8); await h.tracker.flush();
  h.advance(11000); h.tracker.click(9); await h.tracker.flush();
  const visits = Object.values(Object.values(h.saved[ENGAGEMENT_KEY].sessions)[0].visits);
  assert.equal(visits[0].tipId, 8); assert.equal(visits[0].successful, true);
  assert.equal(visits[1].successful, false);
});

test('initial native opened event does not duplicate the document opening', async () => {
  const h = metricsHarness();
  h.lifecycle(true);
  h.tracker.open(1);
  await h.tracker.flush();
  h.lifecycle(true);
  await h.tracker.flush();
  assert.equal(openings(h), 1);
  assert.equal(summary(h).openings, 1);
});

test('unregistered use and invalid messages do not create metrics', async () => {
  const h = metricsHarness();
  h.saved[STORAGE.SETUP_DONE] = false;
  h.tracker.open(1); await h.tracker.flush();
  assert.equal(summary(h).openings, 0);
  const record = createMetricsRecorder(h.storage);
  assert.equal((await record({ kind: 'open', sessionId: 'bad', userId: 1 }, undefined)).ok, false);
  h.saved[STORAGE.SETUP_DONE] = true;
  assert.equal((await record({ kind: 'open', sessionId: 'bad', userId: 1, at: 'invalid' }, 'doc')).ok, false);
  assert.equal(summary(h).openings, 0);
});
