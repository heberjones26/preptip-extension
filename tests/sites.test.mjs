// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchSite, searchTips, parseTarget } from '../src/lib/sites.js';

const websites = [
  { url_pattern: 'docs.google.com/spreadsheets', name: 'Google Sheets' },
  { url_pattern: 'docs.google.com/document', name: 'Google Docs' },
  { url_pattern: 'canva.com', name: 'Canva' },
  { url_pattern: 'instructure.com', name: 'Canvas' },
  { url_pattern: 'youtube.com', name: 'YouTube' }
];

test('matchSite picks the right Google app by path', () => {
  assert.equal(matchSite('https://docs.google.com/spreadsheets/d/abc/edit#gid=0', websites).name, 'Google Sheets');
  assert.equal(matchSite('https://docs.google.com/document/d/xyz/edit', websites).name, 'Google Docs');
  assert.equal(matchSite('https://docs.google.com/presentation/d/1', websites), null);
});

test('matchSite handles www and subdomains', () => {
  assert.equal(matchSite('https://www.youtube.com/watch?v=1', websites).name, 'YouTube');
  assert.equal(matchSite('https://byu.instructure.com/courses/1', websites).name, 'Canvas');
  assert.equal(matchSite('https://www.canva.com/', websites).name, 'Canva');
});

test('matchSite rejects lookalikes and non-web pages', () => {
  assert.equal(matchSite('https://notcanva.com/', websites), null);
  assert.equal(matchSite('https://docs.google.com/spreadsheetsfake', websites), null);
  assert.equal(matchSite('chrome://extensions', websites), null);
  assert.equal(matchSite('not a url', websites), null);
});

test('searchTips ranks teacher wording', () => {
  const tips = [
    { tip_id: 1, title: 'Color-code grades automatically', feature_name: 'Conditional formatting', keywords: 'red, low grades, make bad grades red', summary: '' },
    { tip_id: 2, title: 'Average a row of scores', feature_name: 'Formulas', keywords: 'average, grade, mean', summary: '' },
    { tip_id: 3, title: 'Keep the header row visible', feature_name: 'Freeze', keywords: 'freeze, header', summary: '' }
  ];
  assert.equal(searchTips(tips, 'make bad grades red')[0].tip_id, 1);
  assert.equal(searchTips(tips, 'how do I freeze')[0].tip_id, 3);
  assert.deepEqual(searchTips(tips, 'zebra'), []);
  assert.deepEqual(searchTips(tips, '   '), []);
});

test('parseTarget splits kind and path', () => {
  assert.deepEqual(parseTarget('menu:View > Freeze > 1 row'), { kind: 'menu', path: ['View', 'Freeze', '1 row'] });
  assert.deepEqual(parseTarget('formula_bar'), { kind: 'formula_bar', path: [] });
  assert.deepEqual(parseTarget(null), { kind: null, path: [] });
});
