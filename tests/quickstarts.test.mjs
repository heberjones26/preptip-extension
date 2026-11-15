import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SITE_GRADES } from '../src/data/segments.js';
import { quickStartFor } from '../src/data/quickstarts.js';

test('every supported website has a distinct, complete orientation guide', () => {
  const guides = Object.keys(SITE_GRADES).map((url_pattern) => quickStartFor({ url_pattern }));
  assert.equal(new Set(guides.map((guide) => guide.overview)).size, guides.length);
  for (const guide of guides) {
    assert.match(guide.title, / QuickStart$/);
    assert.ok(guide.overview.length > 50);
    assert.equal(guide.sections.length, 5, `${guide.title} needs a site-specific guide`);
    assert.ok(Number.isInteger(guide.minutes) && guide.minutes > 0);
    for (const section of guide.sections) {
      assert.ok(section.title && section.body.length > 100, `${guide.title} has an incomplete section`);
    }
    assert.match(guide.sections.at(-1).title, /first classroom task/i);
  }
});

test('every bundled development catalog website has a site-specific guide', async () => {
  const catalog = JSON.parse(await readFile(new URL('../src/sidepanel/dev-catalog.json', import.meta.url), 'utf8'));
  for (const site of catalog.websites) {
    const guide = quickStartFor(site);
    assert.equal(guide.sections.length, 5, `${site.name} needs an orientation guide`);
  }
});

test('guides normalize site patterns and match school subdomains and Google app paths', () => {
  assert.deepEqual(quickStartFor({ url_pattern: ' HTTPS://WWW.CANVA.COM/design/example/?x=1 ' }), quickStartFor('canva.com'));
  assert.deepEqual(quickStartFor('school.instructure.com/courses/123'), quickStartFor('instructure.com'));
  assert.deepEqual(quickStartFor('docs.google.com/document/d/example/edit'), quickStartFor('docs.google.com/document'));
  assert.deepEqual(quickStartFor('*.instructure.com'), quickStartFor('instructure.com'));
});

test('legacy Google app hosts and current Microsoft and Kahoot hosts keep the correct guide', () => {
  for (const [alias, canonical] of [
    ['sheets.google.com', 'docs.google.com/spreadsheets'],
    ['slides.google.com', 'docs.google.com/presentation'],
    ['microsoft365.com', 'office.com'],
    ['m365.cloud.microsoft', 'office.com'],
    ['kahoot.it', 'kahoot.com'],
  ]) assert.deepEqual(quickStartFor(alias), quickStartFor(canonical), alias);
});

test('unknown catalog sites receive a usable, named first-time guide without pretending to know their UI', () => {
  const guide = quickStartFor({ url_pattern: 'newtool.example', name: ' New Classroom Tool ' });
  assert.equal(guide.title, 'New Classroom Tool QuickStart');
  assert.match(guide.overview, /New Classroom Tool/);
  assert.equal(guide.sections.length, 4);
  assert.match(guide.sections[0].body, /Help or Getting started/);
  assert.match(guide.sections[2].body, /student account/);
  assert.equal(quickStartFor('newtool.example').title, 'newtool.example QuickStart');
  assert.equal(quickStartFor({ name: 'A new tool' }).title, 'A new tool QuickStart');
});

test('invalid or deceptively similar patterns do not select an unrelated site guide', () => {
  assert.equal(quickStartFor('https://canva.com.evil.example').sections.length, 4);
  assert.equal(quickStartFor('docs.google.com/documentation').sections.length, 4);
  assert.equal(quickStartFor({ url_pattern: 'javascript:alert(1)', name: 'A tool' }).sections.length, 4);
  assert.equal(quickStartFor({ url_pattern: 42, name: 'A tool' }).title, 'A tool QuickStart');
});

test('absent site yields no guide and returned content cannot mutate future guides', () => {
  for (const site of [undefined, null, '', false, 42]) assert.equal(quickStartFor(site), null);
  const guide = quickStartFor('canva.com');
  guide.title = 'Changed';
  guide.sections[0].body = 'Changed';
  guide.sections.pop();
  const next = quickStartFor('canva.com');
  assert.equal(next.title, 'Canva QuickStart');
  assert.equal(next.sections.length, 5);
  assert.notEqual(next.sections[0].body, 'Changed');
});
