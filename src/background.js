// PrepTip service worker (ES module).
// Jobs: side panel behavior, per-tab badge (S1), nudge info for the on-page guide,
// redirect detection (R6), and blocking flagged domains with a warning page (R6-R7).
//
// The service worker can be stopped at any moment, so anything that must survive between
// events lives in chrome.storage.session, never in module globals.

import { MSG, STORAGE } from './lib/protocol.js';
import { getCatalog } from './lib/supabase.js';
import { matchSite, tipsForSite } from './lib/sites.js';

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

const BADGE_COLOR = '#15803D';
const BLOCKED_PAGE_PATH = 'src/blocked/blocked.html';
const BLOCKLIST_PATH = 'src/data/blocklist.json';

// Dynamic rules (persist across restarts): one redirect rule per flagged domain.
const BLOCK_RULE_ID_BASE = 1000;
const BLOCK_RULE_PRIORITY = 1;
// Session rules (cleared when the browser closes): "I understand the risk, continue".
// Separate id range and a higher priority so an allow beats the redirect.
const ALLOW_RULE_ID_BASE = 50000;
const ALLOW_RULE_PRIORITY = 100;

// Background-private session key: the last committed top-frame URL per tab. Used as the "from"
// of a client redirect (meta refresh / JS location change).
const lastUrlKey = (tabId) => `pt.lastUrl.${tabId}`;

// A redirect chain A -> B -> C is reported as "from A" when the hops happen this close together.
const CHAIN_WINDOW_MS = 10_000;

// ---------------------------------------------------------------------------------------------
// Pure helpers (exported so a Node script can check the DNR rules without Chrome)
// ---------------------------------------------------------------------------------------------

const DOMAIN_RE = /^(?=.{1,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

// Matches the whole URL of an http(s) request to `domain` or any subdomain of it.
// RE2-safe: no lookarounds, no backreferences. `\0` in the substitution is the whole match.
export function domainRegex(domain) {
  return `^https?://([^/?#]*[.@])?${escapeRegex(domain)}(:[0-9]+)?([/?#].*)?$`;
}

export function normalizeBlocklist(json) {
  const seen = new Set();
  const out = [];
  for (const entry of (json && Array.isArray(json.domains)) ? json.domains : []) {
    const domain = String(entry?.domain || '').trim().toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
    if (!DOMAIN_RE.test(domain) || seen.has(domain)) continue;
    seen.add(domain);
    out.push({ domain, reason: String(entry.reason || 'Flagged as unsafe') });
  }
  return out;
}

// One redirect rule per domain. The blocked page receives the original URL as ?url=<whole match>.
export function buildBlockRules(domains, blockedPageUrl) {
  return domains.map(({ domain }, i) => ({
    id: BLOCK_RULE_ID_BASE + i,
    priority: BLOCK_RULE_PRIORITY,
    action: {
      type: 'redirect',
      redirect: { regexSubstitution: `${blockedPageUrl}?url=\\0` }
    },
    condition: {
      regexFilter: domainRegex(domain),
      isUrlFilterCaseSensitive: false,
      requestDomains: [domain],
      resourceTypes: ['main_frame']
    }
  }));
}

// Fallback when Chrome rejects a regex (shouldn't happen, but never leave a domain unblocked):
// same block, but the page can't show the original URL.
function buildFallbackRule(rule, domain) {
  return {
    id: rule.id,
    priority: rule.priority,
    action: { type: 'redirect', redirect: { extensionPath: `/${BLOCKED_PAGE_PATH}?domain=${encodeURIComponent(domain)}` } },
    condition: { requestDomains: [domain], resourceTypes: ['main_frame'] }
  };
}

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

function isHttp(url) {
  try { return /^https?:$/.test(new URL(url).protocol); } catch { return false; }
}

const bareHost = (url) => hostOf(url).replace(/^www\./, '');

// ---------------------------------------------------------------------------------------------
// Everything below needs Chrome. The guard lets Node import this file to test the pure helpers.
// Listeners are still registered synchronously at the top level, as MV3 requires.
// ---------------------------------------------------------------------------------------------

const inExtension = Boolean(globalThis.chrome?.runtime?.id);

function blockedPageUrl() {
  return chrome.runtime.getURL(BLOCKED_PAGE_PATH);
}

function isBlockedPage(url) {
  return typeof url === 'string' && url.startsWith(blockedPageUrl());
}

// Fire-and-forget broadcast to the side panel. "Receiving end does not exist" just means it's closed.
function broadcast(msg) {
  try {
    const p = chrome.runtime.sendMessage(msg);
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch { /* panel closed */ }
}

// ---------------------------------------------------------------------------------------------
// Catalog (deduped so a burst of tab events triggers one fetch)
// ---------------------------------------------------------------------------------------------

let catalogInFlight = null;

async function catalogOrNull() {
  if (!catalogInFlight) {
    catalogInFlight = getCatalog()
      .catch((err) => { console.warn('[PrepTip] catalog unavailable:', err?.message || err); return null; })
      .finally(() => { setTimeout(() => { catalogInFlight = null; }, 0); });
  }
  return catalogInFlight;
}

async function siteInfoFor(url) {
  const catalog = url ? await catalogOrNull() : null;
  if (!catalog) return { site: null, tipCount: 0 };
  const site = matchSite(url, catalog.websites || []);
  return { site, tipCount: site ? tipsForSite(catalog, site).length : 0 };
}

// ---------------------------------------------------------------------------------------------
// Badge (S1)
// ---------------------------------------------------------------------------------------------

async function updateBadge(tabId, url) {
  try {
    const { site, tipCount } = await siteInfoFor(url);
    if (site && tipCount > 0) {
      await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
      if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ tabId, color: '#FFFFFF' });
      await chrome.action.setBadgeText({ tabId, text: String(tipCount) });
      await chrome.action.setTitle({ tabId, title: `PrepTip: ${tipCount} tip${tipCount === 1 ? '' : 's'} for ${site.name}` });
    } else {
      await chrome.action.setBadgeText({ tabId, text: '' });
      await chrome.action.setTitle({ tabId, title: 'PrepTip' });
    }
  } catch (err) {
    // Tab closed mid-update, etc.
    if (!/No tab with id/i.test(String(err?.message))) console.warn('[PrepTip] badge:', err?.message || err);
  }
}

async function refreshTab(tabId, url, active) {
  await updateBadge(tabId, url);
  if (active) broadcast({ type: MSG.TAB_CONTEXT_CHANGED, tabId, url: url || null });
}

// ---------------------------------------------------------------------------------------------
// Nudges
// ---------------------------------------------------------------------------------------------

async function getNudgesSeen() {
  const { [STORAGE.NUDGES_SEEN]: seen } = await chrome.storage.local.get(STORAGE.NUDGES_SEEN);
  return seen && typeof seen === 'object' ? seen : {};
}

async function markNudgeSeen(urlPattern) {
  if (!urlPattern) return;
  const seen = await getNudgesSeen();
  if (seen[urlPattern]) return;
  seen[urlPattern] = true;
  await chrome.storage.local.set({ [STORAGE.NUDGES_SEEN]: seen });
}

async function getSiteInfo(sender) {
  const url = sender.tab?.url || sender.url;
  const { site, tipCount } = await siteInfoFor(url);
  const seen = site ? await getNudgesSeen() : {};
  return {
    site: site ? { url_pattern: site.url_pattern, name: site.name } : null,
    tipCount,
    showNudge: Boolean(site && tipCount > 0 && !seen[site.url_pattern])
  };
}

// ---------------------------------------------------------------------------------------------
// Blocklist -> dynamic DNR rules (R6-R7)
// ---------------------------------------------------------------------------------------------

async function loadBlocklist() {
  const res = await fetch(chrome.runtime.getURL(BLOCKLIST_PATH));
  if (!res.ok) throw new Error(`blocklist.json ${res.status}`);
  return normalizeBlocklist(await res.json());
}

async function rebuildBlockRules() {
  try {
    const domains = await loadBlocklist();
    const rules = buildBlockRules(domains, blockedPageUrl());

    const checked = [];
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      let ok = true;
      if (chrome.declarativeNetRequest.isRegexSupported) {
        const r = await chrome.declarativeNetRequest.isRegexSupported({ regex: rule.condition.regexFilter, isCaseSensitive: false });
        ok = r.isSupported;
        if (!ok) console.warn('[PrepTip] regex not supported for', domains[i].domain, r.reason);
      }
      checked.push(ok ? rule : buildFallbackRule(rule, domains[i].domain));
    }

    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map((r) => r.id),
      addRules: checked
    });
    console.info(`[PrepTip] blocking ${checked.length} flagged domains`);
  } catch (err) {
    console.error('[PrepTip] could not build block rules:', err);
  }
}

// "I understand the risk, continue" -> allow this hostname for the rest of the browser session.
async function allowDomain(url) {
  if (!isHttp(url)) throw new Error('Only http(s) URLs can be allowed');
  const host = hostOf(url);
  if (!host) throw new Error('Bad URL');

  const { [STORAGE.ALLOWED_DOMAINS]: list = [] } = await chrome.storage.session.get(STORAGE.ALLOWED_DOMAINS);
  const allowed = Array.isArray(list) ? list : [];
  if (!allowed.includes(host)) {
    allowed.push(host);
    await chrome.storage.session.set({ [STORAGE.ALLOWED_DOMAINS]: allowed });
  }

  const sessionRules = await chrome.declarativeNetRequest.getSessionRules();
  const already = sessionRules.some((r) => r.action.type === 'allow' && r.condition.requestDomains?.includes(host));
  if (!already) {
    const nextId = Math.max(ALLOW_RULE_ID_BASE, ...sessionRules.map((r) => r.id)) + 1;
    await chrome.declarativeNetRequest.updateSessionRules({
      addRules: [{
        id: nextId,
        priority: ALLOW_RULE_PRIORITY,
        action: { type: 'allow' },
        condition: { requestDomains: [host], resourceTypes: ['main_frame'] }
      }]
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Redirect detection (R6)
// ---------------------------------------------------------------------------------------------

async function recordRedirect(tabId, from, to, kind) {
  const key = STORAGE.redirectKey(tabId);
  const { [key]: prev } = await chrome.storage.session.get(key);
  // Continue a chain: keep the first "from" so the teacher sees where it really started.
  const origin = prev && prev.to === from && Date.now() - prev.at < CHAIN_WINDOW_MS ? prev.from : from;
  if (bareHost(origin) === bareHost(to)) return; // same-site hop (http->https, add www, trailing slash)
  await chrome.storage.session.set({ [key]: { from: origin, to, at: Date.now(), kind } });
}

function onBeforeRedirect(details) {
  if (details.tabId < 0 || details.frameId !== 0) return;
  const { url: from, redirectUrl: to } = details;
  // Our own DNR redirect into the warning page is not a site redirect.
  if (!to || to.startsWith(`chrome-extension://${chrome.runtime.id}/`)) return;
  if (!isHttp(from) || !isHttp(to)) return;
  recordRedirect(details.tabId, from, to, 'server').catch(() => {});
}

async function onCommitted(details) {
  if (details.frameId !== 0 || details.tabId < 0) return;
  if (details.documentLifecycle && details.documentLifecycle !== 'active') return; // prerender
  const { tabId, url } = details;
  const q = details.transitionQualifiers || [];
  const lkey = lastUrlKey(tabId);
  const rkey = STORAGE.redirectKey(tabId);

  if (isBlockedPage(url)) {
    // A client redirect (JS / meta refresh) into a flagged domain lands here, since the flagged URL
    // never commits. Record where it came from so the warning page can say so.
    if (q.includes('client_redirect')) {
      const { [lkey]: last } = await chrome.storage.session.get(lkey);
      let target = null;
      try { target = new URL(url).searchParams.get('url'); } catch { /* ignore */ }
      if (last && target && isHttp(last)) await recordRedirect(tabId, last, target, 'client');
    }
    return; // keep lastUrl pointing at the real page the teacher was on
  }

  if (q.includes('client_redirect')) {
    const { [lkey]: last } = await chrome.storage.session.get(lkey);
    if (last && isHttp(last) && isHttp(url)) await recordRedirect(tabId, last, url, 'client');
  } else if (!q.includes('server_redirect')) {
    // An ordinary navigation: any older redirect note no longer describes this page.
    await chrome.storage.session.remove(rkey);
  }
  // server_redirect: onBeforeRedirect already wrote the record.

  await chrome.storage.session.set({ [lkey]: url });
}

// ---------------------------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------------------------

function respondAsync(promise, sendResponse) {
  promise.then(sendResponse, (err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true;
}

function onMessage(msg, sender, sendResponse) {
  if (!msg || typeof msg.type !== 'string') return false;

  switch (msg.type) {
    case MSG.GET_SITE_INFO:
      return respondAsync(getSiteInfo(sender), sendResponse);

    case MSG.NUDGE_DISMISSED:
      return respondAsync(markNudgeSeen(msg.urlPattern).then(() => ({ ok: true })), sendResponse);

    case MSG.OPEN_PANEL: {
      const tabId = sender.tab?.id;
      // Call open() synchronously, before any await, so Chrome can still see the user gesture.
      let opening;
      try {
        opening = tabId != null
          ? chrome.sidePanel.open({ tabId })
          : Promise.reject(new Error('No tab'));
      } catch (err) {
        opening = Promise.reject(err);
      }
      const markSeen = siteInfoFor(sender.tab?.url || sender.url)
        .then(({ site }) => markNudgeSeen(site?.url_pattern))
        .catch(() => {});
      return respondAsync(
        Promise.resolve(opening)
          .then(() => ({ ok: true }), (err) => ({ ok: false, error: String(err?.message || err) }))
          .then(async (res) => { await markSeen; return res; }),
        sendResponse
      );
    }

    case MSG.PROCEED_ANYWAY: {
      // Only our own warning page may unblock a domain (not content scripts or other pages).
      if (sender.id !== chrome.runtime.id || !String(sender.url || '').startsWith(blockedPageUrl())) {
        sendResponse({ ok: false, error: 'Not allowed' });
        return false;
      }
      return respondAsync(allowDomain(msg.url).then(() => ({ ok: true })), sendResponse);
    }

    default:
      return false; // not ours: let the side panel's listeners answer
  }
}

// ---------------------------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------------------------

if (inExtension) {
  Promise.resolve()
    .then(() => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }))
    .catch((err) => console.warn('[PrepTip] setPanelBehavior:', err));

  // Tabs that were already open when PrepTip was installed or Chrome started get their badge too.
  const refreshAllTabs = () => chrome.tabs.query({})
    .then((tabs) => Promise.all(tabs.map((t) => updateBadge(t.id, t.url))))
    .catch(() => {});

  chrome.runtime.onInstalled.addListener(() => { rebuildBlockRules(); refreshAllTabs(); });
  chrome.runtime.onStartup.addListener(() => { rebuildBlockRules(); refreshAllTabs(); });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' || changeInfo.url) {
      refreshTab(tabId, tab.url || changeInfo.url, tab.active);
    }
  });

  chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
      const tab = await chrome.tabs.get(tabId);
      refreshTab(tabId, tab.url, true);
    } catch { /* tab vanished */ }
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.session.remove([STORAGE.redirectKey(tabId), lastUrlKey(tabId)]).catch(() => {});
  });

  chrome.webRequest.onBeforeRedirect.addListener(onBeforeRedirect, { urls: ['<all_urls>'], types: ['main_frame'] });
  chrome.webNavigation.onCommitted.addListener((d) => { onCommitted(d).catch((e) => console.warn('[PrepTip] onCommitted:', e)); });

  chrome.runtime.onMessage.addListener(onMessage);
}
