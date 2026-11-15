import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metricsHarness, chromeEvent } from './helpers/metrics-harness.mjs';
import { MSG, STORAGE } from '../src/lib/protocol.js';

// Exercise the real panel with Safari's browser namespace and an extension
// window whose active tab differs from the website window it follows.
test('detached guide follows its source window through browser-only APIs', async (t) => {
  const keys = ['document', 'window', 'browser', 'chrome', 'performance', 'setTimeout', 'clearTimeout'];
  const originals = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.ok(String(url).includes('/rest/v1/'), `Unexpected fetch: ${url}`);
    return new Response('[]', { status: 200 });
  });
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  const panelUrl = 'safari-web-extension://test/src/sidepanel/sidepanel.html?windowId=10';

  function fixture() {
    const h = metricsHarness({ modern: false });
    const { document, window, chrome: browser } = h.env;
    document.location.href = panelUrl;
    const nodes = new Map();
    document.querySelector = (selector) => {
      if (!nodes.has(selector)) nodes.set(selector, {
        innerHTML: '', dataset: {}, value: '', focus() {}, setSelectionRange() {}
      });
      return nodes.get(selector);
    };
    window.scrollTo = () => {};
    browser.runtime.getURL = (path) => `safari-web-extension://test/${path}`;
    browser.runtime.onMessage = chromeEvent();
    delete browser.sidePanel;
    browser.windows = {
      getCurrent: async () => ({ id: 20, type: 'popup' }),
      onRemoved: chromeEvent()
    };
    const helperTab = { id: 21, windowId: 20, active: true, url: panelUrl };
    let sourceTab = {
      id: 11, windowId: 10, active: true, url: 'https://docs.google.com/spreadsheets/d/test/edit'
    };
    const queries = [];
    const requestedTabs = [];
    const toPage = [];
    browser.tabs = {
      async query(query) {
        queries.push(structuredClone(query));
        return [query.windowId === 10 ? sourceTab : helperTab];
      },
      async get(tabId) {
        requestedTabs.push(tabId);
        if (tabId === sourceTab.id) return { ...sourceTab };
        if (tabId === helperTab.id) return { ...helperTab };
        throw new Error('Unknown tab');
      },
      async sendMessage(tabId, message) {
        toPage.push({ tabId, ...structuredClone(message) });
        return { ok: true };
      },
      onActivated: chromeEvent(), onUpdated: chromeEvent(), onRemoved: chromeEvent()
    };
    browser.storage.onChanged = chromeEvent();
    const sessionValues = {};
    browser.storage.session = {
      async get(keys) {
        keys = typeof keys === 'string' ? [keys] : keys;
        return Object.fromEntries(keys.filter((key) => key in sessionValues)
          .map((key) => [key, structuredClone(sessionValues[key])]));
      },
      async set(items) { Object.assign(sessionValues, structuredClone(items)); },
      async remove(keys) {
        for (const key of typeof keys === 'string' ? [keys] : keys) delete sessionValues[key];
      }
    };
    h.saved[STORAGE.CATALOG] = {
      fetchedAt: Date.now(),
      websites: [{ url_pattern: 'docs.google.com/spreadsheets', name: 'Google Sheets' }],
      tips: [{
        tip_id: 8, url_pattern: 'docs.google.com/spreadsheets', title: 'Freeze a header',
        summary: 'Keep the header visible.', description: 'Use the View menu.', feature_name: 'Testing',
        estimated_required_minutes: 1, keywords: 'freeze',
        tip_steps: [{
          step_id: 1, step_order: 1, step_type: 'guided',
          target_element: 'menu:View', step_description: 'Open View.'
        }]
      }]
    };
    return {
      h, document, window, browser, queries, requestedTabs, toPage, sessionValues,
      view: () => document.querySelector('#view'),
      setSourceTab(tab) { sourceTab = { windowId: 10, active: true, ...tab }; },
      click(action, extra = {}) {
        const el = { dataset: { action, ...extra }, disabled: false };
        document.emit('click', { target: { closest: () => el }, preventDefault() {} });
      },
      install() {
        delete globalThis.chrome;
        Object.assign(globalThis, {
          document, window, browser, performance: { now: h.env.now },
          setTimeout: h.env.schedule, clearTimeout: h.env.cancel
        });
      }
    };
  }

  const first = fixture();
  first.install();
  await import(`../src/sidepanel/sidepanel.js?detached-first=${crypto.randomUUID()}`);
  await settle();
  await settle();

  await t.test('startup queries the original website window and highlights its tab', async () => {
    assert.equal(globalThis.chrome, undefined);
    assert.deepEqual(first.queries, [{ active: true, windowId: 10 }]);
    assert.equal(first.view().dataset.view, 'tips');
    assert.match(first.view().innerHTML, /Freeze a header/);
    first.click('open-tip', { tipId: '8' });
    await settle();
    assert.equal(first.view().dataset.view, 'guide');
    const shown = first.toPage.filter((message) => message.type === MSG.GUIDE_SHOW);
    assert.equal(shown.at(-1).tabId, 11);
    assert.deepEqual(first.sessionValues['pt.guide.11'], { tipId: 8, stepIndex: 0 });
    assert.equal(first.sessionValues['pt.guide.21'], undefined);
    assert.ok(first.toPage.every((message) => message.tabId === 11));
  });

  await t.test('helper activation is ignored while source tab changes are followed', async () => {
    first.browser.tabs.onActivated.emit({ tabId: 21, windowId: 20 });
    await settle();
    assert.equal(first.view().dataset.view, 'guide');
    assert.deepEqual(first.requestedTabs, []);
    first.setSourceTab({ id: 12, url: 'https://docs.google.com/spreadsheets/d/another/edit' });
    first.browser.tabs.onActivated.emit({ tabId: 12, windowId: 10 });
    await settle();
    await settle();
    assert.deepEqual(first.requestedTabs, [12]);
    assert.equal(first.view().dataset.view, 'tips');
    assert.ok(first.toPage.some((message) => message.tabId === 11 && message.type === MSG.GUIDE_CLEAR));
    first.click('open-tip', { tipId: '8' });
    await settle();
    assert.equal(first.toPage.filter((message) => message.type === MSG.GUIDE_SHOW).at(-1).tabId, 12);
    assert.deepEqual(first.sessionValues['pt.guide.12'], { tipId: 8, stepIndex: 0 });
    first.browser.runtime.onMessage.emit({ type: MSG.TAB_CONTEXT_CHANGED }, {});
    await settle();
    assert.deepEqual(first.queries.at(-1), { active: true, windowId: 10 });
    assert.equal(first.view().dataset.view, 'guide');
    assert.ok(first.toPage.every((message) => message.tabId !== 21));
  });

  await t.test('closing the source window clears the current on-page guide', async () => {
    first.browser.windows.onRemoved.emit(99);
    assert.equal(first.view().dataset.view, 'guide');
    first.browser.windows.onRemoved.emit(10);
    await settle();
    assert.equal(first.view().dataset.view, 'tips');
    assert.doesNotMatch(first.view().innerHTML, /data-action="open-tip"/);
    assert.deepEqual(first.toPage.at(-1), { tabId: 12, type: MSG.GUIDE_CLEAR });
  });

  await t.test('reopening the helper sends a new document token using browser-only messaging', async () => {
    const firstEvents = first.h.sent.filter((message) => message.type === MSG.ENGAGEMENT);
    const opening = firstEvents.find((message) => message.kind === 'open');
    assert.ok(opening);
    assert.match(opening.panelDocumentId, /^[\w-]+$/);
    assert.ok(firstEvents.some((message) => message.kind === 'click'));
    assert.ok(firstEvents.every((message) => message.panelDocumentId === opening.panelDocumentId));
    first.window.emit('pagehide');
    await settle();

    const reopened = fixture();
    reopened.install();
    await import(`../src/sidepanel/sidepanel.js?detached-reopened=${crypto.randomUUID()}`);
    await settle();
    await settle();
    const nextOpening = reopened.h.sent.find((message) => message.kind === 'open');
    assert.ok(nextOpening);
    assert.notEqual(nextOpening.panelDocumentId, opening.panelDocumentId);
    assert.notEqual(nextOpening.sessionId, opening.sessionId);
    assert.equal(reopened.view().dataset.view, 'tips');
    assert.deepEqual(reopened.queries, [{ active: true, windowId: 10 }]);
    assert.equal(globalThis.chrome, undefined);
    reopened.window.emit('pagehide');
    await settle();
  });
});
