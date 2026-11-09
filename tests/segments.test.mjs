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

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------
import {
  SUBJECTS, SITE_SUBJECTS, subjectLabel, isSubject, cleanSubjects, siteSubjects,
  fitsSubjects, splitByFit, profileLabel, matchBadge
} from '../src/data/segments.js';

test('SUBJECTS has the picker options, including the ones teachers asked for', () => {
  const ids = SUBJECTS.map((s) => s.id);
  for (const id of ['math', 'physics', 'ela', 'languages', 'other']) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.equal(subjectLabel('languages'), 'Spanish & world languages');
  assert.equal(isSubject('physics'), true);
  assert.equal(isSubject('underwater-basket-weaving'), false);
});

test('cleanSubjects keeps known ids once each, in menu order, and survives junk', () => {
  assert.deepEqual(cleanSubjects(['physics', 'bogus', 'math', 'physics']), ['math', 'physics']);
  assert.deepEqual(cleanSubjects(undefined), []);
  assert.deepEqual(cleanSubjects('math'), []);
  assert.deepEqual(cleanSubjects(null), []);
});

test('fitsSubjects: no pick or a universal item fits; otherwise one subject must overlap', () => {
  assert.equal(fitsSubjects(['math'], []), true);
  assert.equal(fitsSubjects([], ['physics']), true);
  assert.equal(fitsSubjects(undefined, ['physics']), true);
  assert.equal(fitsSubjects(['math', 'physics'], ['physics', 'art']), true);
  assert.equal(fitsSubjects(['math'], ['music']), false);
});

test('"Something else" answers the question but narrows nothing', () => {
  assert.equal(fitsSubjects(['math'], ['other']), true);
  assert.equal(profileLabel({ grade: '', subjects: ['other'] }), '');
  const items = [{ id: 'a', subjects: ['math'] }];
  assert.deepEqual(splitByFit(items, { grade: '', subjects: ['other'] }).recommended, []);
});

test('splitByFit: needs BOTH grade and subject, and puts items that name the subject first', () => {
  const items = [
    { id: 'universal-hs', grades: ['high'], subjects: [] },
    { id: 'physics-hs', grades: ['high'], subjects: ['physics'] },
    { id: 'physics-k3', grades: ['k3'], subjects: ['physics'] },
    { id: 'art-hs', grades: ['high'], subjects: ['art'] },
    { id: 'everything', grades: [], subjects: [] },
  ];
  const { recommended, other } = splitByFit(items, { grade: 'high', subjects: ['physics'] });
  assert.deepEqual(recommended.map((i) => i.id), ['physics-hs', 'universal-hs', 'everything']);
  assert.deepEqual(other.map((i) => i.id), ['physics-k3', 'art-hs']);
});

test('splitByFit: subject alone works, and no profile recommends nothing', () => {
  const items = [{ id: 'm', subjects: ['math'] }, { id: 'a', subjects: ['art'] }];
  assert.deepEqual(splitByFit(items, { subjects: ['math'] }).recommended.map((i) => i.id), ['m']);
  assert.equal(splitByFit(items, { grade: '', subjects: [] }).recommended.length, 0);
  assert.equal(splitByFit(items, undefined).other.length, 2);
});

test('profileLabel: grade, then subjects, trimmed to two with a +N', () => {
  assert.equal(profileLabel({ grade: 'high', subjects: [] }), 'High school');
  assert.equal(profileLabel({ grade: '', subjects: ['physics'] }), 'Physics');
  assert.equal(profileLabel({ grade: 'high', subjects: ['physics', 'math'] }), 'High school · Math, Physics');
  assert.equal(profileLabel({ grade: 'high', subjects: ['physics', 'math', 'chemistry'] }), 'High school · Math, Physics +1');
  assert.equal(profileLabel({}), '');
});

test('matchBadge: a named subject wins, then a named grade, never for universal items', () => {
  assert.equal(matchBadge(['high'], ['physics'], { grade: 'high', subjects: ['physics'] }), 'For Physics');
  assert.equal(matchBadge(['high'], [], { grade: 'high', subjects: ['physics'] }), 'For High school');
  assert.equal(matchBadge([], [], { grade: 'high', subjects: ['physics'] }), '');
  assert.equal(matchBadge(['high'], ['math'], { grade: 'middle', subjects: ['physics'] }), '');
});

test('tagging: every site/resource subject is a real id and a resource names a subject only once', () => {
  for (const [pattern, subs] of Object.entries(SITE_SUBJECTS)) {
    for (const s of subs) assert.ok(isSubject(s), `${pattern} has bad subject ${s}`);
  }
  assert.deepEqual(siteSubjects('desmos.com'), ['math', 'physics']);
  assert.deepEqual(siteSubjects('youtube.com'), []);
  for (const r of RESOURCES) {
    assert.ok(Array.isArray(r.subjects), `${r.name} needs a subjects array`);
    for (const s of r.subjects) assert.ok(isSubject(s), `${r.name} has bad subject ${s}`);
    assert.equal(new Set(r.subjects).size, r.subjects.length, `${r.name} repeats a subject`);
  }
});

test('every subject in the picker has something to recommend', () => {
  for (const s of SUBJECTS.filter((x) => x.id !== 'other')) {
    const { recommended } = splitByFit(RESOURCES, { subjects: [s.id] });
    const named = recommended.filter((r) => r.subjects.includes(s.id));
    assert.ok(named.length >= 1, `no resource names ${s.label}`);
  }
});

test('resource names and urls are unique', () => {
  assert.equal(new Set(RESOURCES.map((r) => r.name)).size, RESOURCES.length);
  assert.equal(new Set(RESOURCES.map((r) => r.url)).size, RESOURCES.length);
});

test('splitByFit: among items that name the subject, the most focused one ranks first', () => {
  const items = [
    { id: 'broad', subjects: ['ela', 'social', 'science', 'biology', 'chemistry', 'physics'] },
    { id: 'mid', subjects: ['physics', 'math', 'chemistry'] },
    { id: 'specific', subjects: ['physics'] },
    { id: 'universal', subjects: [] },
  ];
  const { recommended } = splitByFit(items, { subjects: ['physics'] });
  assert.deepEqual(recommended.map((i) => i.id), ['specific', 'mid', 'broad', 'universal']);
});

test('real data: a physics teacher sees physics-specific resources before broad ones', () => {
  const { recommended } = splitByFit(RESOURCES, { grade: 'high', subjects: ['physics'] });
  const names = recommended.map((r) => r.name);
  assert.ok(names.indexOf('The Physics Classroom') < names.indexOf('Newsela'));
  assert.ok(names.indexOf('The Physics Classroom') < names.indexOf('PBS LearningMedia'));
  assert.ok(names.indexOf('GeoGebra') < names.indexOf('OpenStax'));
});
