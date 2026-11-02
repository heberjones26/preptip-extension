import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addOpening, openingDetails, weeklyReport } from '../src/lib/usage.js';
const at = (date) => openingDetails(new Date(`${date}T09:30:00`));

test('three distinct office days qualify exactly once; repeats and weekends do not', () => {
  let data;
  for (const date of ['2026-10-26', '2026-10-26', '2026-10-27', '2026-10-31', '2026-11-01']) data = addOpening(data, 1, at(date));
  assert.equal(weeklyReport(data, '2026-10-26').qualifyingTeachers, 0);
  data = addOpening(data, 1, at('2026-10-30'));
  const report = weeklyReport(data, '2026-10-26');
  assert.equal(report.qualifyingTeachers, 1);
  assert.equal(report.averageOfficeDays, 3);
  assert.equal(report.teachers[0].totalOpens, 6);
  assert.equal(data.teachers['teacher:1'].days['2026-10-26'].hours[9], 2);
  assert.equal(weeklyReport(data, '2026-11-02').averageOfficeDays, 0);
});

test('local calendar boundaries, year rollover and separate teachers', () => {
  assert.equal(at('2027-01-01').week, '2026-12-28');
  let data = addOpening(null, 1, at('2026-10-26'));
  data = addOpening(data, 2, at('2026-11-02'));
  assert.equal(weeklyReport(data, '2026-10-26').teacherCount, 1);
  assert.equal(weeklyReport(data, '2026-11-02').averageOfficeDays, 0.5);
  assert.throws(() => weeklyReport(data, '2026-10-27'));
  assert.equal(weeklyReport(null, '2026-10-26').averageOfficeDays, null);
});


test('all five weekdays still yield one metric and the next Monday starts fresh', () => {
  let data;
  for (const date of ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']) {
    data = addOpening(data, 1, at(date));
  }
  assert.equal(weeklyReport(data, '2026-10-26').teachers[0].metric, 1);
  assert.equal(weeklyReport(data, '2026-10-26').averageOfficeDays, 5);
  data = addOpening(data, 1, at('2026-11-02'));
  assert.equal(weeklyReport(data, '2026-11-02').teachers[0].metric, 0);
});

test('local midnight, Sunday/Monday and daylight-saving boundaries use calendar dates', () => {
  const sunday = openingDetails(new Date(2026, 10, 1, 23, 59, 59));
  const monday = openingDetails(new Date(2026, 10, 2, 0, 0, 0));
  assert.equal(sunday.date, '2026-11-01');
  assert.equal(sunday.week, '2026-10-26');
  assert.equal(sunday.weekday, 0);
  assert.equal(sunday.hour, 23);
  assert.equal(monday.date, '2026-11-02');
  assert.equal(monday.week, '2026-11-02');
  assert.equal(monday.hour, 0);
  const before = openingDetails(new Date(2026, 10, 1, 0, 30));
  const after = openingDetails(new Date(2026, 10, 1, 3, 30));
  const data = addOpening(addOpening(null, 1, before), 1, after);
  assert.equal(Object.keys(data.teachers['teacher:1'].days).length, 1);
});
