import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metricsHarness, chromeEvent } from './helpers/metrics-harness.mjs';
import { STORAGE, MSG } from '../src/lib/protocol.js';
import { USAGE_KEY } from '../src/lib/usage.js';
import { ENGAGEMENT_KEY, engagementReport } from '../src/lib/engagement.js';

// Runs the actual panel and background modules. Only browser/DOM/network APIs
// are replaced; clicks, renders, message validation and storage wiring are real.
test('panel and service-worker integration', async (t) => {
  const h = metricsHarness();
  const { document, window, chrome } = h.env;
  const nodes = new Map();
  document.querySelector = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, { innerHTML: '', dataset: {}, value: '', focus() {}, setSelectionRange() {} });
    return nodes.get(selector);
  };
  window.scrollTo = () => {};
  let activeTab = { id: 11, windowId: 10, url: 'https://docs.google.com/spreadsheets/d/test/edit', active: true };
  chrome.tabs = {
    query: async () => [activeTab], get: async () => activeTab,
    sendMessage: async () => ({ ok: true }),
    onActivated: chromeEvent(), onUpdated: chromeEvent(), onRemoved: chromeEvent()
  };
  chrome.action = { setBadgeBackgroundColor: async () => {}, setBadgeText: async () => {}, setTitle: async () => {} };
  chrome.sidePanel.setPanelBehavior = async () => {};
  chrome.webRequest = { onBeforeRedirect: chromeEvent() };
  chrome.webNavigation = { onCommitted: chromeEvent() };
  chrome.storage.onChanged = chromeEvent();
  const sessionValues = {};
  chrome.storage.session = {
    async get(key) { return { [key]: structuredClone(sessionValues[key]) }; },
    async set(items) { Object.assign(sessionValues, structuredClone(items)); },
    async remove(key) { delete sessionValues[key]; }
  };
  const messageListeners = [];
  chrome.runtime.onMessage = { addListener(fn) { messageListeners.push(fn); } };
  chrome.runtime.onInstalled = chromeEvent(); chrome.runtime.onStartup = chromeEvent();
  const sender = { id: 'test', url: document.location.href, documentId: 'actual-panel-document' };
  const dispatch = (message, from = sender) => new Promise((resolve) => {
    let asynchronous = false;
    for (const listener of messageListeners) {
      if (listener(message, from, resolve) === true) asynchronous = true;
    }
    if (!asynchronous) resolve(undefined);
  });
  chrome.runtime.sendMessage = dispatch;
  const tip = (id) => ({ tip_id: id, url_pattern: 'docs.google.com/spreadsheets', title: `Tip ${id}`, summary: 'Test tip',
    description: 'Steps', feature_name: 'Testing', estimated_required_minutes: 1, keywords: 'test',
    tip_steps: [1, 2].map((n) => ({ step_id: n, step_order: n, step_type: 'guided', target_element: 'menu:File', step_description: `Step ${n}` })) });
  h.saved[STORAGE.CATALOG] = { fetchedAt: Date.now(), websites: [{ url_pattern: 'docs.google.com/spreadsheets', name: 'Google Sheets' }], tips: [tip(8), tip(9)] };
  let registrationId = 1;
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.ok(String(url).includes('/rest/v1/'), `Unexpected fetch: ${url}`);
    return new Response(JSON.stringify(String(url).includes('register_teacher') ? registrationId : []), { status: 200 });
  });
  const originals = new Map(['document', 'window', 'chrome', 'performance', 'setTimeout', 'clearTimeout'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  Object.assign(globalThis, { document, window, chrome, performance: { now: h.env.now }, setTimeout: h.env.schedule, clearTimeout: h.env.cancel });
  t.after(() => {
    for (const [k, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k];
    }
  });
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const click = (action, extra = {}) => {
    const el = { dataset: { action, ...extra }, disabled: false };
    document.emit('click', { target: { closest: () => el }, preventDefault() {} });
  };
  const totals = () => engagementReport(h.saved[ENGAGEMENT_KEY]);
  const allOpenings = () => Object.values(h.saved[USAGE_KEY]?.teachers || {}).reduce((n, u) => n + Object.values(u.days).reduce((sum, d) => sum + d.opens, 0), 0);

  await import('../src/background.js');
  await import('../src/sidepanel/sidepanel.js');
  await settle();
  await t.test('startup records both metrics while normal renders do not add openings', async () => {
    assert.equal(document.querySelector('#view').dataset.view, 'tips');
    assert.equal(totals().openings, 1); assert.equal(allOpenings(), 1);
    chrome.runtime.onMessage.addListener(() => {});
    await dispatch({ type: MSG.TAB_CONTEXT_CHANGED }); await settle();
    click('clear-search'); await settle();
    assert.equal(totals().openings, 1);
  });
  await t.test('real tip clicks, steps and completion obey the strict timer', async () => {
    click('open-tip', { tipId: '8' }); await settle();
    assert.equal(document.querySelector('#view').dataset.view, 'guide');
    await h.tick(6000); click('step-done'); await settle();
    await h.tick(4000); await settle();
    assert.equal(totals().successfulOpenings, 0);
    await h.tick(1); await settle();
    assert.equal(totals().successfulOpenings, 1);
    click('step-done'); await settle();
    assert.equal(document.querySelector('#view').dataset.view, 'feedback');
    assert.equal(totals().tipClicks, 1);
  });
  await t.test('stopping early and navigating away do not qualify another visit', async () => {
    click('back-to-tips'); click('open-tip', { tipId: '9' }); await settle();
    await h.tick(8000); click('stop-guide'); await h.tick(20000); await settle();
    const visits = () => Object.values(Object.values(h.saved[ENGAGEMENT_KEY].sessions)[0].visits);
    assert.equal(visits()[1].successful, false);
    click('open-tip', { tipId: '9' }); await settle();
    await h.tick(5000);
    activeTab = { ...activeTab, url: 'https://example.com/' };
    chrome.tabs.onUpdated.emit(11, { url: activeTab.url }, activeTab);
    await settle(); await h.tick(20000); await settle();
    assert.equal(document.querySelector('#view').dataset.view, 'tips');
    assert.equal(visits()[2].successful, false);
  });
  await t.test('teacher setup transitions record A → B → A consistently', async () => {
    for (const id of [2, 1]) {
      click('change-teacher'); registrationId = id;
      document.emit('submit', { preventDefault() {}, target: {
        id: 'setup-form', first: { value: 'Test' }, last: { value: 'Teacher' }, email: { value: `test${id}@example.com` }
      } });
      await settle(); click('setup-finish'); await settle();
    }
    assert.equal(totals().openings, 3); assert.equal(allOpenings(), 3);
  });
  await t.test('auto-restored guide is excluded, explicit click is included', async () => {
    sessionValues['pt.guide.12'] = { tipId: 8, stepIndex: 0 };
    activeTab = { id: 12, windowId: 10, url: 'https://docs.google.com/spreadsheets/d/other/edit', active: true };
    const before = totals().tipClicks;
    chrome.tabs.onActivated.emit({ tabId: 12, windowId: 10 });
    await settle(); await h.tick(11000); await settle();
    assert.equal(document.querySelector('#view').dataset.view, 'guide');
    assert.equal(totals().tipClicks, before);
    click('stop-guide'); click('open-tip', { tipId: '8' }); await settle();
    assert.equal(totals().tipClicks, before + 1);
  });
  await t.test('background rejects website and wrong-extension messages', async () => {
    const message = { type: MSG.ENGAGEMENT, kind: 'open', sessionId: 'foreign', userId: 1 };
    assert.equal((await dispatch(message, { ...sender, url: 'https://example.com/' })).ok, false);
    assert.equal((await dispatch(message, { ...sender, id: 'other' })).ok, false);
    assert.equal(totals().openings, 3);
  });
});
