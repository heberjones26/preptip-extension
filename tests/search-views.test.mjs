import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultsHtml, unsupportedView, footer } from '../src/sidepanel/views.js';

const docs = { url_pattern: 'docs.google.com/document', name: 'Google Docs' };
const canva = { url_pattern: 'canva.com', name: 'Canva' };
const tips = [
  { tip_id: 1, url_pattern: docs.url_pattern, title: 'Leave a comment', keywords: 'feedback', tip_steps: [] },
  { tip_id: 2, url_pattern: canva.url_pattern, title: 'Classroom poster', keywords: 'template', tip_steps: [] }
];
const state = (query, request = {}) => ({
  query, view: 'tips', setupDone: true, tab: { url: 'https://example.com' },
  catalog: { websites: [docs, canva], tips },
  request: { open: false, text: '', saving: false, sent: false, error: '', ...request }
});
const context = { site: docs, tips: [tips[0]] };

test('unmatched searches lead with an actionable request and safely escape search text', () => {
  const html = resultsHtml(state('<script>alert("seating chart")</script>'), context);
  assert.match(html, /don&rsquo;t currently have a tip/);
  assert.match(html, /Submit the problem/);
  assert.match(html, /data-action="open-request">Submit a tip request/);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('class="tip-card'));
});

test('another tool having a matching tip still offers a request for the current tool', () => {
  const html = resultsHtml(state('classroom poster'), context);
  assert.match(html, /currently have a tip for this on Docs/);
  assert.equal((html.match(/data-action="open-request"/g) || []).length, 1);
  assert.ok(html.indexOf('Submit a tip request') < html.indexOf('On other sites'));
  assert.match(html, /Classroom poster/);
});

test('unsupported-site searches have one request form immediately after results', () => {
  const html = unsupportedView(state('seating chart', { open: true, text: 'seating chart' }), { site: null, tips: [] });
  assert.equal((html.match(/id="request-form"/g) || []).length, 1);
  assert.equal((html.match(/id="request-text"/g) || []).length, 1);
  assert.ok(html.indexOf('id="request-form"') < html.indexOf('Sites with tips'));
  assert.match(html, />seating chart<\/textarea>/);
});

test('request success and failures remain visible in unmatched search results', () => {
  assert.match(resultsHtml(state('seating chart', { sent: true }), context), /Your request was sent/);
  const html = resultsHtml(state('seating chart', { open: true, text: 'seating chart', error: 'Try again' }), context);
  assert.match(html, /role="alert">Try again/);
  assert.match(html, />seating chart<\/textarea>/);
});

test('sharing feedback and a selectable invitation appear in the footer', () => {
  assert.match(footer({ ...state(''), sharePhase: 'copied' }), /Invite copied/);
  assert.match(footer({ ...state(''), sharePhase: 'manual' }), /id="share-text"[^>]*readonly/);
});
