import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPanelController, extensionApi, getExtensionApi, PANEL_PATH } from '../src/lib/browser.js';
import { isPanelSender, panelDocumentId, createMetricsRecorder } from '../src/lib/metrics.js';
import { STORAGE, MSG } from '../src/lib/protocol.js';

function storageArea(initial = {}) {
  const values = structuredClone(initial);
  return {
    values,
    async get(keys) {
      if (keys == null) return structuredClone(values);
      if (typeof keys === 'string') keys = [keys];
      return Object.fromEntries(keys.filter((key) => key in values).map((key) => [key, structuredClone(values[key])]));
    },
    async set(items) { Object.assign(values, structuredClone(items)); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]; }
  };
}

function event() {
  const listeners = [];
  return { listeners, addListener(fn) { listeners.push(fn); }, emit(...args) { return listeners.map((fn) => fn(...args)); } };
}

function windowApi(scheme = 'safari-web-extension') {
  const windows = new Map();
  const created = [];
  const focused = [];
  let nextId = 100;
  const api = {
    runtime: { id: 'preptip', getURL: (path) => `${scheme}://generated-host/${path}` },
    storage: { session: storageArea() },
    action: { onClicked: event() },
    windows: {
      async create(details) {
        created.push(details);
        const entry = { id: nextId++, tabs: [{ url: details.url }] };
        windows.set(entry.id, entry);
        return entry;
      },
      async get(id) { if (!windows.has(id)) throw Error('Window closed'); return windows.get(id); },
      async update(id, details) { focused.push({ id, ...details }); },
      async getLastFocused() { return { id: 7 }; }
    }
  };
  return { api, windows, created, focused };
}

function globals(t, values) {
  const original = new Map(Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
  t.after(() => {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
}

test('the extension API resolves lazily and prefers the browser Promise namespace', (t) => {
  const chromium = { runtime: { id: 'chromium' } };
  const firefox = { runtime: { id: 'firefox' } };
  globals(t, { chrome: chromium, browser: undefined });
  assert.equal(extensionApi.runtime, chromium.runtime);
  globalThis.browser = firefox;
  assert.equal(extensionApi.runtime, firefox.runtime);
  assert.equal(getExtensionApi(), firefox);
  delete globalThis.browser;
  delete globalThis.chrome;
  assert.equal(extensionApi.runtime, undefined);
});

test('Chrome, Edge and Brave call the native panel synchronously from the click', async () => {
  for (const browser of ['Chrome', 'Edge', 'Brave']) {
    const h = windowApi('chrome-extension');
    const opened = [];
    const behavior = [];
    h.api.sidePanel = {
      open(details) { opened.push(details); return Promise.resolve(); },
      setPanelBehavior(details) { behavior.push(details); return Promise.resolve(); }
    };
    const controller = createPanelController(h.api);
    controller.configure();
    const opening = controller.open({ id: 11, windowId: 7 });
    assert.deepEqual(opened, [{ tabId: 11 }], browser);
    await opening;
    h.api.action.onClicked.emit({ id: 12, windowId: 7 });
    assert.deepEqual(opened[1], { tabId: 12 }, browser);
    assert.deepEqual(behavior, [{ openPanelOnActionClick: true }]);
    assert.equal(h.created.length, 0);
  }
});

test('Firefox toolbar opens its sidebar within the original user gesture', async () => {
  const h = windowApi('moz-extension');
  let opened = false;
  h.api.sidebarAction = { open() { opened = true; return Promise.resolve(); } };
  const controller = createPanelController(h.api);
  controller.configure();
  h.api.action.onClicked.emit({ id: 11, windowId: 7 });
  assert.equal(opened, true);
  await Promise.resolve();
  assert.equal(h.created.length, 0);
});

test('a Firefox content-script click can fall back when sidebar user activation is rejected', async () => {
  const h = windowApi('moz-extension');
  h.api.sidebarAction = { open() { return Promise.reject(Error('User action required')); } };
  await createPanelController(h.api).open({ id: 11, windowId: 7 });
  assert.equal(h.created[0].type, 'popup');
  assert.equal(h.created[0].url, `${h.api.runtime.getURL(PANEL_PATH)}?windowId=7`);
});

test('guide windows preserve the source window, deduplicate clicks and survive worker restarts', async () => {
  const h = windowApi();
  const controller = createPanelController(h.api);
  await Promise.all([controller.open({ windowId: 7 }), controller.open({ windowId: 7 })]);
  assert.equal(h.created.length, 1);
  assert.equal(h.created[0].type, 'popup');
  assert.match(h.created[0].url, /\?windowId=7$/);
  await createPanelController(h.api).open({ windowId: 7 });
  assert.equal(h.created.length, 1);
  assert.deepEqual(h.focused, [{ id: 100, focused: true }]);
  await controller.open({ windowId: 8 });
  assert.equal(h.created.length, 2);
  assert.match(h.created[1].url, /\?windowId=8$/);
  h.windows.delete(100);
  await controller.open({ windowId: 7 });
  assert.equal(h.created.length, 3);
  // Window IDs can be recycled: never focus an unrelated browser window.
  h.windows.set(102, { id: 102, tabs: [{ url: 'https://school.example/' }] });
  await controller.open({ windowId: 7 });
  assert.equal(h.created.length, 4);
});

test('sidebar failures fall back to a usable guide window', async () => {
  const h = windowApi('chrome-extension');
  h.api.sidePanel = { open() { throw Error('Unsupported'); } };
  await createPanelController(h.api).open({ windowId: 7 });
  assert.equal(h.created.length, 1);
  await createPanelController(h.api).open();
  assert.equal(h.created.length, 1);
});

test('metrics authenticate the generated extension namespace and only the guide page', () => {
  for (const scheme of ['chrome-extension', 'moz-extension', 'safari-web-extension']) {
    const { api } = windowApi(scheme);
    const sender = { id: api.runtime.id, url: api.runtime.getURL(PANEL_PATH) };
    assert.equal(isPanelSender(sender, api), true, scheme);
    assert.equal(isPanelSender({ ...sender, url: `${sender.url}?windowId=7` }, api), true);
    for (const url of [
      'https://generated-host/src/sidepanel/sidepanel.html',
      `${scheme}://other-host/src/sidepanel/sidepanel.html`,
      `${sender.url}.other`, `${sender.url}?windowId=7&windowId=8`,
      `${sender.url}?windowId=other`, `${sender.url}?debug=1`, `${sender.url}#anything`
    ]) assert.equal(isPanelSender({ ...sender, url }, api), false, url);
    assert.equal(isPanelSender({ ...sender, id: 'other-extension' }, api), false);
  }
});

test('metrics use a stable per-document identity on browsers lacking sender.documentId', async () => {
  assert.equal(panelDocumentId({ documentId: 'native-document' }, { panelDocumentId: 'fallback-token' }), 'native-document');
  assert.equal(panelDocumentId({}, {}), null);
  assert.equal(panelDocumentId({}, { panelDocumentId: '../bad-token' }), null);
  const storage = storageArea({ [STORAGE.TEACHER]: { userId: 1 }, [STORAGE.SETUP_DONE]: true });
  const recorder = createMetricsRecorder(storage);
  const message = { kind: 'open', sessionId: 'opening-1', userId: 1, panelDocumentId: 'document-token-1' };
  assert.equal((await recorder(message, panelDocumentId({}, message))).ok, true);
  assert.equal((await recorder(message, panelDocumentId({}, message))).ok, true);
  assert.equal((await recorder(message, panelDocumentId({}, { panelDocumentId: 'different-document' }))).ok, false);
});

test('Firefox background registers messages without Chromium or optional navigation APIs', async (t) => {
  const h = windowApi('moz-extension');
  const { api } = h;
  api.storage.local = storageArea({
    [STORAGE.TEACHER]: { userId: 1 }, [STORAGE.SETUP_DONE]: true,
    [STORAGE.CATALOG]: { fetchedAt: Date.now(), websites: [], tips: [] }
  });
  api.runtime.onMessage = event();
  api.runtime.onInstalled = event();
  api.runtime.onStartup = event();
  api.tabs = { onUpdated: event(), onActivated: event(), onRemoved: event(), query: async () => [] };
  let sidebars = 0;
  api.sidebarAction = { open() { sidebars++; return Promise.resolve(); } };
  globals(t, { browser: api, chrome: undefined });
  await import(`../src/background.js?firefox-runtime-test`);
  assert.equal(api.runtime.onMessage.listeners.length, 1);
  assert.equal(api.action.onClicked.listeners.length, 1);
  const dispatch = (message, sender) => new Promise((resolve) => {
    const isAsync = api.runtime.onMessage.listeners[0](message, sender, resolve);
    if (!isAsync) queueMicrotask(() => resolve(undefined));
  });
  const sender = { id: api.runtime.id, url: `${api.runtime.getURL(PANEL_PATH)}?windowId=7` };
  const message = { type: MSG.ENGAGEMENT, kind: 'open', sessionId: 'firefox-session', userId: 1, panelDocumentId: 'firefox-document' };
  assert.equal((await dispatch(message, sender)).ok, true);
  assert.equal((await dispatch(message, { ...sender, url: 'https://school.example/' })).ok, false);
  assert.equal((await dispatch({ type: MSG.OPEN_PANEL }, { tab: { id: 11, windowId: 7 } })).ok, true);
  assert.equal(sidebars, 1);
  await api.storage.session.set({ [STORAGE.redirectKey(11)]: { from: 'a' }, 'pt.lastUrl.11': 'a' });
  api.tabs.onRemoved.emit(11);
  await Promise.resolve();
  assert.deepEqual(api.storage.session.values, {});
});

test('navigation warning fallback retains explicit unsafe-domain acknowledgement', async (t) => {
  const h = windowApi();
  const { api } = h;
  const navigations = [];
  api.storage.local = storageArea({ [STORAGE.CATALOG]: { fetchedAt: Date.now(), websites: [], tips: [] } });
  api.runtime.onMessage = event();
  api.tabs = {
    onUpdated: event(), onActivated: event(), onRemoved: event(), query: async () => [],
    async update(id, details) { navigations.push({ id, ...details }); }
  };
  api.action.setBadgeText = async () => {};
  api.action.setTitle = async () => {};
  globals(t, { browser: api, chrome: undefined });
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ domains: [{ domain: 'unsafe.example' }] })));
  await import('../src/background.js?safari-warning-test');
  const settle = async () => { for (let n = 0; n < 4; n++) await new Promise((resolve) => setImmediate(resolve)); };
  api.tabs.onUpdated.emit(11, { url: 'https://sub.unsafe.example/' }, { url: 'https://sub.unsafe.example/', active: false });
  await settle();
  assert.equal(navigations.length, 1);
  assert.equal(new URL(navigations[0].url).searchParams.get('url'), 'https://sub.unsafe.example/');
  const result = await new Promise((resolve) => api.runtime.onMessage.listeners[0](
    { type: MSG.PROCEED_ANYWAY, url: 'https://sub.unsafe.example/' },
    { id: api.runtime.id, url: api.runtime.getURL('src/blocked/blocked.html') }, resolve));
  assert.equal(result.ok, true);
  api.tabs.onUpdated.emit(11, { url: 'https://sub.unsafe.example/' }, { url: 'https://sub.unsafe.example/', active: false });
  await settle();
  assert.equal(navigations.length, 1);
});

test('declarative blocking, allow rules and redirect notes work with a Safari runtime URL', async (t) => {
  const h = windowApi();
  const { api } = h;
  const dynamicUpdates = [];
  const sessionUpdates = [];
  const navigations = [];
  let failRules = false;
  api.declarativeNetRequest = {
    async getDynamicRules() { return [{ id: 1000 }]; },
    async updateDynamicRules(details) { if (failRules) throw Error('Rules unavailable'); dynamicUpdates.push(details); },
    async getSessionRules() { return []; },
    async updateSessionRules(details) { sessionUpdates.push(details); },
    async isRegexSupported() { return { isSupported: true }; }
  };
  api.storage.local = storageArea({ [STORAGE.CATALOG]: { fetchedAt: Date.now(), websites: [], tips: [] } });
  api.runtime.onMessage = event(); api.runtime.onInstalled = event(); api.runtime.onStartup = event();
  api.tabs = {
    onUpdated: event(), onActivated: event(), onRemoved: event(), query: async () => [],
    async update(id, details) { navigations.push({ id, ...details }); }
  };
  api.action.setBadgeText = async () => {}; api.action.setTitle = async () => {};
  api.webRequest = { onBeforeRedirect: event() };
  api.webNavigation = { onCommitted: event(), onBeforeNavigate: event() };
  globals(t, { browser: api, chrome: undefined });
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ domains: [{ domain: 'unsafe.example' }] })));
  await import('../src/background.js?safari-declarative-test');
  const settle = async () => { for (let n = 0; n < 4; n++) await new Promise((resolve) => setImmediate(resolve)); };
  api.runtime.onInstalled.emit();
  await settle();
  assert.equal(dynamicUpdates.length, 1);
  assert.deepEqual(dynamicUpdates[0].removeRuleIds, [1000]);
  assert.match(dynamicUpdates[0].addRules[0].action.redirect.regexSubstitution, /^safari-web-extension:\/\/generated-host\//);
  api.webRequest.onBeforeRedirect.emit({ tabId: 11, frameId: 0, url: 'https://teacher.example/', redirectUrl: 'https://destination.example/' });
  await settle();
  assert.equal(api.storage.session.values[STORAGE.redirectKey(11)].from, 'https://teacher.example/');
  api.webRequest.onBeforeRedirect.emit({ tabId: 11, frameId: 0, url: 'https://unsafe.example/', redirectUrl: api.runtime.getURL('src/blocked/blocked.html') });
  await settle();
  assert.equal(api.storage.session.values[STORAGE.redirectKey(11)].from, 'https://teacher.example/');
  const dispatch = (url, sender) => new Promise((resolve) => api.runtime.onMessage.listeners[0](
    { type: MSG.PROCEED_ANYWAY, url }, sender, resolve));
  assert.equal((await dispatch('https://unsafe.example/', { id: api.runtime.id, url: 'https://teacher.example/' })).ok, false);
  assert.equal(sessionUpdates.length, 0);
  assert.equal((await dispatch('https://unsafe.example/', { id: api.runtime.id, url: api.runtime.getURL('src/blocked/blocked.html') })).ok, true);
  assert.deepEqual(sessionUpdates[0].addRules[0].condition.requestDomains, ['unsafe.example']);
  await api.storage.session.remove(STORAGE.ALLOWED_DOMAINS);
  failRules = true;
  // A browser reporting the API but rejecting rule installation must still warn.
  t.mock.method(console, 'error', () => {});
  api.runtime.onStartup.emit();
  await settle();
  api.webNavigation.onBeforeNavigate.emit({ tabId: 12, frameId: 0, url: 'https://unsafe.example/' });
  await settle();
  assert.equal(navigations.length, 1);
  assert.equal(new URL(navigations[0].url).searchParams.get('url'), 'https://unsafe.example/');
});
