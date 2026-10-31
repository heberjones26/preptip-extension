// DEV ONLY. A tiny fake of the chrome.* APIs the side panel uses, so dev.html runs in a normal tab.
// Never loaded by the extension (sidepanel.html doesn't include it).
//
// URL params:  ?url=<page the fake tab is on>   ?reset=1 clears fake storage   ?teacher=1 skips setup
// Console:     ptDev.status(true, 'Format')    ptDev.status(false)
//              ptDev.offtrack('Data')         ptDev.backOnTrack()      ptDev.stepDone()
//              ptDev.setUrl(url)  (same tab)   ptDev.switchTab(url)     ptDev.redirect('https://bit.ly/x')
//              ptDev.failCatalog = true; then reload with ?reset=1 to see the error state
//              Sign-in: the emailed code is always ptDev.code ('123456'); ptDev.accounts lists existing
//              emails (nelly@school.edu); ptDev.failOtp = true fakes Auth's "wait a minute" rate limit.
//
// Writes (Supabase Auth, rpc/teacher_email_exists, rpc/sign_in_teacher, POST feedback) are intercepted
// here and never sent.
(function () {
  'use strict';
  const params = new URLSearchParams(location.search);
  const log = (...args) => console.info('%c[chrome stub]', 'color:#C2410C;font-weight:bold', ...args);

  // ---------- tiny event helper ----------
  function makeEvent() {
    const listeners = [];
    return {
      addListener: (fn) => listeners.push(fn),
      removeListener: (fn) => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); },
      hasListener: (fn) => listeners.includes(fn),
      _fire: (...args) => listeners.forEach((fn) => { try { fn(...args); } catch (e) { console.error(e); } })
    };
  }

  // ---------- storage backed by localStorage / sessionStorage so reloads keep state ----------
  const onChanged = makeEvent();

  function makeArea(name, backing) {
    const KEY = `ptDev.${name}`;
    let data = {};
    try { data = JSON.parse(backing.getItem(KEY) || '{}'); } catch { data = {}; }
    const persist = () => { try { backing.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ } };
    const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

    return {
      async get(keys) {
        if (keys == null) return clone(data);
        if (typeof keys === 'string') keys = [keys];
        const out = {};
        if (Array.isArray(keys)) {
          for (const k of keys) if (k in data) out[k] = clone(data[k]);
        } else {
          for (const [k, def] of Object.entries(keys)) out[k] = k in data ? clone(data[k]) : def;
        }
        return out;
      },
      async set(items) {
        const changes = {};
        for (const [k, v] of Object.entries(items)) {
          changes[k] = { oldValue: data[k], newValue: clone(v) };
          data[k] = clone(v);
        }
        persist();
        onChanged._fire(changes, name);
      },
      async remove(keys) {
        if (typeof keys === 'string') keys = [keys];
        const changes = {};
        for (const k of keys) if (k in data) { changes[k] = { oldValue: data[k] }; delete data[k]; }
        persist();
        if (Object.keys(changes).length) onChanged._fire(changes, name);
      },
      async clear() { data = {}; persist(); },
      _dump: () => clone(data)
    };
  }

  if (params.get('reset') === '1') {
    try { localStorage.removeItem('ptDev.local'); sessionStorage.removeItem('ptDev.session'); } catch { /* ignore */ }
  }
  const local = makeArea('local', localStorage);
  const session = makeArea('session', sessionStorage);

  if (params.get('teacher') === '1') {
    local.set({
      'pt.teacher': { userId: 4242, firstName: 'Nelly', lastName: 'Parker', email: 'nelly@school.edu' },
      'pt.setupDone': true
    });
  }

  // ---------- tabs ----------
  const WINDOW_ID = 1;
  let nextTabId = 101;
  let activeTab = {
    id: nextTabId,
    windowId: WINDOW_ID,
    active: true,
    url: params.get('url') || 'https://docs.google.com/spreadsheets/d/1abcDEF/edit#gid=0'
  };

  const onActivated = makeEvent();
  const onUpdated = makeEvent();
  const runtimeOnMessage = makeEvent();

  // The last PT_GUIDE_SHOW the panel sent, so console helpers know the tipId/stepIndex.
  let lastShow = null;

  function emitFromPage(msg) {
    log('page -> panel', msg);
    runtimeOnMessage._fire(msg, { tab: { id: activeTab.id, url: activeTab.url } }, () => {});
  }

  async function tabsSendMessage(tabId, msg) {
    log('panel -> tab', tabId, msg);
    if (window.ptDev.unscriptable) throw new Error('Could not establish connection. Receiving end does not exist.');
    if (msg.type === 'PT_PING') {
      if (window.ptDev.needsInject) throw new Error('Could not establish connection. Receiving end does not exist.');
      return { ok: true };
    }
    if (msg.type === 'PT_GUIDE_SHOW') {
      lastShow = msg;
      // Pretend guide.js found the first path segment on the page.
      if (window.ptDev.autoStatus && msg.step.step_type === 'guided') {
        const path = (msg.step.target_element.split(':').slice(1).join(':') || '').split('>').map((s) => s.trim());
        setTimeout(() => emitFromPage({ type: 'PT_GUIDE_STATUS', tipId: msg.tipId, stepIndex: msg.stepIndex, found: true, label: path[path.length - 1] || null }), 350);
      }
      return { ok: true };
    }
    if (msg.type === 'PT_GUIDE_CLEAR') { lastShow = null; return { ok: true }; }
    return undefined;
  }

  // ---------- fetch interception: never write to the real database from dev ----------
  const realFetch = window.fetch.bind(window);
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  let verifiedEmail = null; // the email the fake Auth "verified", read by the fake rpc/sign_in_teacher

  // Fake Supabase Auth: every code is "sent", and only ptDev.code verifies.
  function fakeAuth(url, body) {
    if (url.includes('/auth/v1/otp')) {
      return window.ptDev.failOtp ? json({ error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' }, 429) : json({});
    }
    if (url.includes('/auth/v1/verify')) {
      if (body.token !== window.ptDev.code) return json({ error_code: 'otp_expired', msg: 'Token has expired or is invalid' }, 403);
      verifiedEmail = body.email;
      return json({ access_token: 'dev-access-token', token_type: 'bearer', expires_in: 3600, refresh_token: 'dev' });
    }
    if (url.includes('/auth/v1/logout')) return new Response(null, { status: 204 });
    return json({ msg: 'not stubbed' }, 404);
  }

  function fakeSignIn(body) {
    const existing = window.ptDev.accounts.find((a) => a.email === verifiedEmail);
    if (existing) return json([{ ...existing, is_new: false }]);
    const account = { user_id: 4242 + window.ptDev.accounts.length, first_name: body.p_first_name, last_name: body.p_last_name, email: verifiedEmail };
    window.ptDev.accounts.push(account);
    return json([{ ...account, is_new: true }]);
  }

  window.fetch = async function (input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init.method || 'GET').toUpperCase();
    if (method === 'GET' && window.ptDev.failCatalog && url.includes('/rest/v1/')) {
      log('fetch blocked (failCatalog)', url);
      throw new TypeError('Failed to fetch');
    }
    if (method !== 'GET' && (url.includes('/rest/v1/') || url.includes('/auth/v1/'))) {
      const body = init.body ? JSON.parse(init.body) : {};
      log('intercepted', method, url, body);
      await new Promise((r) => setTimeout(r, 500)); // feel the "Saving..." state
      if (window.ptDev.failWrites) return new Response('{"message":"stubbed failure"}', { status: 500 });
      if (url.includes('/auth/v1/')) return fakeAuth(url, body);
      if (url.includes('/rpc/teacher_email_exists')) return json(window.ptDev.accounts.some((a) => a.email === body.p_email.trim().toLowerCase()));
      if (url.includes('/rpc/sign_in_teacher')) return fakeSignIn(body);
      // Real PostgREST answers "Prefer: return=minimal" inserts with 201 and an empty body.
      return new Response(null, { status: 201 });
    }
    return realFetch(input, init);
  };

  // ---------- the chrome object ----------
  window.chrome = {
    runtime: {
      id: 'dev-stub',
      onMessage: runtimeOnMessage,
      getURL: (p) => new URL('../../' + p, location.href).href,
      async sendMessage(msg) { log('runtime.sendMessage', msg); return undefined; }
    },
    storage: { local, session, onChanged },
    tabs: {
      onActivated,
      onUpdated,
      async query() { return [{ ...activeTab }]; },
      async get(id) { if (id !== activeTab.id) throw new Error('No tab with id ' + id); return { ...activeTab }; },
      sendMessage: tabsSendMessage
    },
    scripting: {
      async executeScript(opts) {
        log('scripting.executeScript', opts);
        if (window.ptDev.unscriptable) throw new Error('Cannot access a chrome:// URL');
        window.ptDev.needsInject = false;
        return [];
      },
      async insertCSS(opts) {
        log('scripting.insertCSS', opts);
        if (window.ptDev.unscriptable) throw new Error('Cannot access a chrome:// URL');
      }
    }
  };

  // ---------- console helpers ----------
  const cur = () => (lastShow ? { tipId: lastShow.tipId, stepIndex: lastShow.stepIndex } : {});
  window.ptDev = {
    autoStatus: true,
    needsInject: params.get('inject') === '1',
    unscriptable: !/^https?:/.test(activeTab.url),
    failCatalog: params.get('fail') === '1',
    failWrites: false,
    failOtp: false,                 // true: "send code" answers 429 like Auth's rate limit
    code: '123456',                 // the only code the fake Auth accepts
    accounts: [{ user_id: 4242, first_name: 'Nelly', last_name: 'Parker', email: 'nelly@school.edu' }],
    status: (found = true, label = null) => emitFromPage({ type: 'PT_GUIDE_STATUS', ...cur(), found, label }),
    stepDone: () => emitFromPage({ type: 'PT_GUIDE_STEP_DONE', ...cur() }),
    offtrack: (clicked = 'Data', expected) => {
      const path = lastShow ? lastShow.step.target_element.split(':').slice(1).join(':').split('>').map((s) => s.trim()) : [];
      emitFromPage({ type: 'PT_GUIDE_OFFTRACK', ...cur(), clicked, expected: expected || path[0] || 'Format' });
    },
    backOnTrack: () => emitFromPage({ type: 'PT_GUIDE_BACK_ON_TRACK', ...cur() }),
    setUrl(url) {
      activeTab = { ...activeTab, url };
      this.unscriptable = !/^https?:/.test(url);
      onUpdated._fire(activeTab.id, { url, status: 'loading' }, { ...activeTab });
    },
    switchTab(url) {
      activeTab = { id: ++nextTabId, windowId: WINDOW_ID, active: true, url };
      this.unscriptable = !/^https?:/.test(url);
      onActivated._fire({ tabId: activeTab.id, windowId: WINDOW_ID });
    },
    redirect(from = 'https://bit.ly/3xYz', to = activeTab.url) {
      session.set({ [`pt.redirect.${activeTab.id}`]: { from, to, at: Date.now(), kind: 'server' } });
    },
    contextChanged: () => runtimeOnMessage._fire({ type: 'PT_TAB_CONTEXT_CHANGED', tabId: activeTab.id, url: activeTab.url }, {}, () => {}),
    dump: () => ({ local: local._dump(), session: session._dump(), activeTab, lastShow })
  };
  log('ready on', activeTab.url);
})();
