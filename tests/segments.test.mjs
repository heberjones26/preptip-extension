// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRADES, SITE_GRADES, gradeLabel, isGrade, fitsGrade, splitByGrade, siteGrades } from '../src/data/segments.js';
import { RESOURCES } from '../src/data/resources.js';

test('GRADES carries the six bands from the card plus special education', () => {
  assert.deepEqual(GRADES.map((g) => g.id), ['preschool', 'k3', 'g46', 'middle', 'high', 'college', 'special']);
  assert.equal(gradeLabel('k3'), 'Kindergarten–3rd');
  assert.equal(gradeLabel('nope'), '');
  assert.equal(isGrade('high'), true);
  assert.equal(isGrade('grad-school'), false);
});

test('fitsGrade: no teacher grade means everything shows', () => {
  assert.equal(fitsGrade(['high'], null), true);
  assert.equal(fitsGrade(['high'], ''), true);
});

test('fitsGrade: an item with no grades is universal', () => {
  assert.equal(fitsGrade([], 'preschool'), true);
  assert.equal(fitsGrade(undefined, 'college'), true);
});

test('fitsGrade: otherwise the grade must be in the item list', () => {
  assert.equal(fitsGrade(['middle', 'high'], 'high'), true);
  assert.equal(fitsGrade(['middle', 'high'], 'preschool'), false);
});

test('splitByGrade: no grade → everything is "other", nothing recommended', () => {
  const items = [{ grades: ['high'] }, { grades: [] }];
  const { recommended, other } = splitByGrade(items, null);
  assert.equal(recommended.length, 0);
  assert.equal(other.length, 2);
});

test('splitByGrade: recommends grade matches and universals, orders preserved', () => {
  const items = [
    { id: 'a', grades: ['preschool'] },
    { id: 'b', grades: ['high', 'college'] },
    { id: 'c', grades: [] }, // universal
    { id: 'd', grades: ['middle'] },
  ];
  const { recommended, other } = splitByGrade(items, 'high');
  assert.deepEqual(recommended.map((i) => i.id), ['b', 'c']);
  assert.deepEqual(other.map((i) => i.id), ['a', 'd']);
});

test('splitByGrade: custom getGrades for site rows', () => {
  const sites = [{ url_pattern: 'desmos.com' }, { url_pattern: 'youtube.com' }];
  const { recommended, other } = splitByGrade(sites, 'preschool', (s) => siteGrades(s.url_pattern));
  // desmos is middle/high/college → not preschool; youtube is universal → recommended
  assert.deepEqual(recommended.map((s) => s.url_pattern), ['youtube.com']);
  assert.deepEqual(other.map((s) => s.url_pattern), ['desmos.com']);
});

test('every resource has the fields the view needs and valid grade ids', () => {
  assert.ok(RESOURCES.length >= 8);
  for (const r of RESOURCES) {
    assert.ok(r.name && r.url && r.blurb && r.category, `resource ${r.name} missing a field`);
    assert.match(r.url, /^https:\/\//, `resource ${r.name} url must be https`);
    for (const g of r.grades) assert.ok(isGrade(g), `resource ${r.name} has bad grade ${g}`);
  }
});

test('SITE_GRADES only references valid grade ids', () => {
  for (const [pattern, grades] of Object.entries(SITE_GRADES)) {
    for (const g of grades) assert.ok(isGrade(g), `${pattern} has bad grade ${g}`);
  }
});
