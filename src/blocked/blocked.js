// PrepTip warning page (R7). Shown in place of a flagged URL by the DNR redirect rules in
// src/background.js. Classic script (MV3 forbids inline scripts). Every chrome.* call is guarded
// so the page still renders when opened outside the extension (e.g. from a local http server).
(() => {
  'use strict';

  const PROCEED_ANYWAY = 'PT_PROCEED_ANYWAY'; // keep in sync with src/lib/protocol.js
  const redirectKey = (tabId) => `pt.redirect.${tabId}`;
  const REDIRECT_FRESH_MS = 2 * 60 * 1000;

  const $ = (id) => document.getElementById(id);
  const ext = globalThis.chrome && globalThis.chrome.runtime && globalThis.chrome.runtime.id ? globalThis.chrome : null;

  // --- Parse the blocked URL ------------------------------------------------------------------
  // The DNR rule appends the original URL *unencoded* (?url=https://x.test/a?b=1&c=2), so take
  // everything after "?url=" instead of using URLSearchParams, which would cut it at the first "&".
  // A hand-made link may encode it instead (?url=https%3A%2F%2F...), so decode that form.
  function readTargetUrl() {
    const search = location.search || '';
    let raw = null;
    if (search.startsWith('?url=')) {
      raw = search.slice(5);
      if (/^https?%3A/i.test(raw)) {
        try { raw = decodeURIComponent(raw); } catch { raw = null; }
      }
    } else {
      raw = new URLSearchParams(search).get('url');
    }
    if (!raw) return null;
    try {
      const u = new URL(raw);
      return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
    } catch {
      return null;
    }
  }

  function readFallbackDomain() {
    const d = new URLSearchParams(location.search).get('domain');
    return d && /^[a-z0-9.-]+$/i.test(d) ? d.toLowerCase() : null;
  }

  const bare = (host) => String(host || '').toLowerCase().replace(/^www\./, '');
  function hostOf(url) {
    try { return new URL(url).hostname; } catch { return ''; }
  }

  // --- Blocklist reason ---------------------------------------------------------------------
  async function lookupReason(host) {
    if (!host) return null;
    try {
      const res = await fetch('../data/blocklist.json', { cache: 'no-store' });
      const json = await res.json();
      let best = null;
      for (const e of json.domains || []) {
        const d = String(e.domain || '').toLowerCase();
        if (d && (host === d || host.endsWith('.' + d)) && (!best || d.length > best.domain.length)) best = e;
      }
      return best ? String(best.reason || '') : null;
    } catch {
      return null;
    }
  }

  // --- Redirect origin ("You were sent here automatically from ...") ---------------------------
  async function currentTabId() {
    try {
      const tab = await ext?.tabs?.getCurrent?.();
      return tab?.id ?? null;
    } catch {
      return null;
    }
  }

  function redirectFromRecord(rec, host) {
    if (!rec || !rec.from || !rec.to) return null;
    if (bare(hostOf(rec.to)) !== bare(host)) return null; // a stale note about some other page
    if (typeof rec.at === 'number' && Date.now() - rec.at > REDIRECT_FRESH_MS) return null;
    const from = hostOf(rec.from);
    return from && bare(from) !== bare(host) ? from : null;
  }

  async function watchRedirect(host, onFound) {
    const tabId = await currentTabId();
    const session = ext?.storage?.session;
    if (tabId == null || !session) return;
    const key = redirectKey(tabId);

    try {
      const { [key]: rec } = await session.get(key);
      const from = redirectFromRecord(rec, host);
      if (from) return onFound(from);
    } catch { /* ignore */ }

    // A client redirect is recorded by the background when this page commits, which can land a
    // moment after we load. Listen briefly.
    const listener = (changes, area) => {
      if (area !== 'session' || !changes[key]) return;
      const from = redirectFromRecord(changes[key].newValue, host);
      if (from) { onFound(from); ext.storage.onChanged.removeListener(listener); }
    };
    ext.storage?.onChanged?.addListener(listener);
    setTimeout(() => ext.storage?.onChanged?.removeListener(listener), 4000);
  }

  // --- Navigation -----------------------------------------------------------------------------
  let leaving = false;
  addEventListener('beforeunload', () => { leaving = true; });

  async function openNewTabPage() {
    if (ext?.tabs?.update) {
      try {
        const tabId = await currentTabId();
        if (tabId != null) await ext.tabs.update(tabId, { url: 'chrome://newtab' });
        else await ext.tabs.update({ url: 'chrome://newtab' });
        return;
      } catch { /* fall through */ }
    }
    location.replace('about:blank');
  }

  function goBack() {
    if (history.length > 1) {
      history.back();
      // If there was nothing to go back to, nothing happens; then fall back to a new tab page.
      setTimeout(() => { if (!leaving && document.visibilityState === 'visible') openNewTabPage(); }, 1500);
    } else {
      openNewTabPage();
    }
  }

  async function proceed(url, button) {
    const errorEl = $('error');
    errorEl.hidden = true;
    if (!ext?.runtime?.sendMessage) {
      errorEl.textContent = 'Continuing only works inside the PrepTip extension.';
      errorEl.hidden = false;
      return;
    }
    button.disabled = true;
    try {
      const res = await ext.runtime.sendMessage({ type: PROCEED_ANYWAY, url: url.href });
      if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'PrepTip could not unblock this site.');
      location.replace(url.href);
    } catch (err) {
      errorEl.textContent = `Couldn't continue: ${err && err.message ? err.message : err}`;
      errorEl.hidden = false;
      button.disabled = false;
    }
  }

  // --- Render ---------------------------------------------------------------------------------
  async function init() {
    const target = readTargetUrl();
    const host = target ? target.hostname : readFallbackDomain();

    if (host) {
      $('host').textContent = host;
      $('hostRow').hidden = false;
      document.title = `Blocked: ${host} - PrepTip`;
    }
    if (target) {
      $('fullUrl').textContent = target.href;
      $('details').hidden = false;
    }

    $('back').addEventListener('click', goBack);

    // Only offer "continue" when we know exactly where to go, and never inside a frame
    // (a page could otherwise embed this warning and trick a click).
    const framed = (() => { try { return window.top !== window; } catch { return true; } })();
    if (target && !framed) {
      const btn = $('proceed');
      btn.hidden = false;
      btn.addEventListener('click', () => proceed(target, btn));
    }

    const reason = await lookupReason(host);
    if (reason) $('reason').textContent = reason;

    if (host) {
      watchRedirect(host, (fromHost) => {
        $('fromHost').textContent = fromHost;
        $('redirectNote').hidden = false;
      });
    }

    $('back').focus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
