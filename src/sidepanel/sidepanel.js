// PrepTip side panel: state, chrome events, and click handling.
// Rendering lives in views.js; talking to the on-page guide lives in guide-bridge.js.
import { MSG, STORAGE } from '../lib/protocol.js';
import { getCatalog, registerTeacher, submitFeedback, requestTip } from '../lib/supabase.js';
import { matchSite, tipsForSite } from '../lib/sites.js';
import * as views from './views.js';
import * as bridge from './guide-bridge.js';
import { isValidEmail, hostOf, isWebUrl } from './text.js';

// ---------------------------------------------------------------------------
// State. Everything the screens need lives here; render() turns it into HTML.
// ---------------------------------------------------------------------------
const state = {
  view: 'loading',          // 'setup' | 'loading' | 'error' | 'tips' | 'guide' | 'feedback'
  setupDone: false,
  teacher: null,            // { userId, firstName, lastName, email }
  setup: newSetup(),
  catalog: null,
  retrying: false,
  windowId: null,
  tab: null,                // { id, url } of the active tab in this window
  site: null,               // website row matching tab.url, or null
  browseSite: null,         // a site picked from "Sites with tips" while on an unsupported page
  query: '',
  request: newRequest(),
  redirect: null,           // { from, to, at, kind } for this tab, if it applies
  dismissedRedirects: new Set(),
  guide: null,              // { tip, stepIndex, tabId, live, canHighlight, status, offtrack }
  feedback: null            // { tip, isHelpful, reasons, text, phase, error }
};

function newSetup(teacher) {
  return {
    step: 0,
    first: teacher?.firstName || '',
    last: teacher?.lastName || '',
    email: teacher?.email || '',
    saving: false,
    error: ''
  };
}

function newRequest() {
  return { open: false, text: '', saving: false, sent: false, error: '' };
}

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

// Which site's tips the list shows (the browsed site wins over the tab's site).
function tipsContext() {
  const site = state.browseSite || state.site;
  const tips = site && state.catalog ? tipsForSite(state.catalog, site) : [];
  return { site, tips, browsing: !!state.browseSite };
}

function mainHtml() {
  switch (state.view) {
    case 'setup': return views.setupView(state);
    case 'loading': return views.loadingView();
    case 'error': return views.errorView(state);
    case 'guide': return views.guideView(state);
    case 'feedback': return views.feedbackView(state);
    default: {
      const ctx = tipsContext();
      return ctx.site && ctx.tips.length ? views.tipsView(state, ctx) : views.unsupportedView(state, ctx);
    }
  }
}

function render() {
  $('#header').innerHTML = views.header(state);
  $('#notice').innerHTML = state.view === 'setup' ? '' : views.redirectNotice(visibleRedirect());
  $('#view').innerHTML = mainHtml();
  $('#view').dataset.view = state.view;
  $('#footer').innerHTML = views.footer(state);
}

// While typing in search we only redraw the results, so the input keeps focus.
function renderResults() {
  const box = $('#results');
  if (!box) return render();
  box.innerHTML = views.resultsHtml(state, tipsContext());
  const clear = $('.search .clear');
  if (clear) clear.hidden = !state.query;
}

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
async function init() {
  wireDomEvents();
  wireChromeEvents();

  const local = await chrome.storage.local.get([STORAGE.TEACHER, STORAGE.SETUP_DONE]);
  state.teacher = local[STORAGE.TEACHER] || null;
  state.setupDone = local[STORAGE.SETUP_DONE] === true;
  if (!state.setupDone) state.view = 'setup';

  await refreshActiveTab({ silent: true });
  render();
  await loadCatalog();
}

async function loadCatalog({ force = false } = {}) {
  try {
    state.catalog = await getCatalog({ force });
  } catch (err) {
    console.warn('PrepTip: could not load tips', err);
    state.catalog = null;
  }
  state.retrying = false;
  updateSite();

  if (state.view === 'setup') return render(); // setup keeps going; the list waits
  if (!state.catalog) {
    state.view = 'error';
    return render();
  }
  await showHome();
}

// Home = resume a saved guide for this tab, or show the tips list.
async function showHome() {
  const saved = await readSavedGuide(state.tab?.id);
  const tip = saved && findTip(saved.tipId);
  if (tip) return startGuide(tip, Math.min(saved.stepIndex || 0, tip.tip_steps.length - 1));
  state.view = state.catalog ? 'tips' : 'error';
  render();
}

function findTip(tipId) {
  return state.catalog?.tips.find((t) => String(t.tip_id) === String(tipId)) || null;
}

// ---------------------------------------------------------------------------
// Active tab tracking (R3, R5)
// ---------------------------------------------------------------------------
function updateSite() {
  state.site = state.catalog && state.tab ? matchSite(state.tab.url, state.catalog.websites) : null;
}

async function refreshActiveTab({ silent = false } = {}) {
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch { return; }
  if (!tab) return;
  if (silent) {
    // First load: just record it.
    state.tab = { id: tab.id, url: tab.url || tab.pendingUrl || '' };
    state.windowId = tab.windowId;
    updateSite();
    await loadRedirect();
    return;
  }
  await onActiveTab(tab);
}

async function onActiveTab(tab) {
  const url = tab.url || tab.pendingUrl || '';
  const prev = state.tab;
  const sameTab = prev && prev.id === tab.id;
  if (sameTab && prev.url === url) return;

  state.tab = { id: tab.id, url };
  state.windowId = tab.windowId;
  updateSite();
  await loadRedirect();

  if (!state.catalog || ['setup', 'loading', 'error'].includes(state.view)) return render();

  if (!sameTab) {
    // Leave the old tab clean. Its saved guide stays in session storage so it resumes later.
    if (state.guide) bridge.clearGuide(state.guide.tabId);
    state.guide = null;
    state.feedback = null;
    resetListState();
    return showHome();
  }

  // Same tab, new URL.
  if (state.view === 'guide' && state.guide?.live) {
    if (state.site?.url_pattern === state.guide.tip.url_pattern) {
      resetStepStatus();
      render();
      sendCurrentStep(); // the page may have reloaded, so highlight again
    } else {
      await exitGuide();    // left the tool this guide is for
    }
    return;
  }
  if (state.view === 'tips') resetListState();
  render();
}

function resetListState() {
  state.browseSite = null;
  state.query = '';
  state.request = newRequest();
}

// ---------------------------------------------------------------------------
// Redirect note (supports R6): written by background.js as pt.redirect.<tabId>
// ---------------------------------------------------------------------------
async function loadRedirect() {
  state.redirect = null;
  if (!state.tab) return;
  const key = STORAGE.redirectKey(state.tab.id);
  try {
    const { [key]: info } = await chrome.storage.session.get(key);
    if (info && info.from && hostOf(info.to) === hostOf(state.tab.url)) state.redirect = info;
  } catch { /* session storage unavailable */ }
}

function visibleRedirect() {
  const r = state.redirect;
  if (!r || !isWebUrl(state.tab?.url)) return null;
  return state.dismissedRedirects.has(redirectId(r)) ? null : r;
}

function redirectId(r) {
  return `${state.tab?.id}:${r.at}:${r.from}`;
}

// ---------------------------------------------------------------------------
// Guide (S3–S5)
// ---------------------------------------------------------------------------
let sendToken = 0;

async function readSavedGuide(tabId) {
  if (tabId == null) return null;
  const key = STORAGE.guideKey(tabId);
  try {
    const { [key]: saved } = await chrome.storage.session.get(key);
    return saved || null;
  } catch { return null; }
}

function saveGuide() {
  const g = state.guide;
  if (!g) return;
  chrome.storage.session.set({ [STORAGE.guideKey(g.tabId)]: { tipId: g.tip.tip_id, stepIndex: g.stepIndex } })
    .catch(() => {});
}

function forgetGuide(tabId) {
  chrome.storage.session.remove(STORAGE.guideKey(tabId)).catch(() => {});
}

function resetStepStatus() {
  if (!state.guide) return;
  state.guide.status = null;
  state.guide.offtrack = null;
}

function startGuide(tip, stepIndex = 0) {
  state.guide = {
    tip,
    stepIndex,
    tabId: state.tab?.id,
    // Only highlight on the page when the tab is on the tip's own site.
    live: !!state.site && state.site.url_pattern === tip.url_pattern,
    canHighlight: null,
    status: null,
    offtrack: null
  };
  state.view = 'guide';
  saveGuide();
  render();
  window.scrollTo(0, 0);
  sendCurrentStep();
}

// Send PT_GUIDE_SHOW for the current step (injecting guide.js first if needed).
async function sendCurrentStep() {
  const g = state.guide;
  if (!g || !g.live) return;
  const token = ++sendToken;
  const ok = await bridge.showStep(g.tabId, g.tip, g.stepIndex);
  if (state.guide !== g || token !== sendToken) return; // something changed while we waited
  if (g.canHighlight !== ok) {
    g.canHighlight = ok;
    if (state.view === 'guide') render();
  }
}

function goToStep(index) {
  const g = state.guide;
  g.stepIndex = index;
  resetStepStatus();
  saveGuide();
  render();
  sendCurrentStep();
}

function completeStep() {
  const g = state.guide;
  if (!g) return;
  if (g.stepIndex < g.tip.tip_steps.length - 1) goToStep(g.stepIndex + 1);
  else finishGuide();
}

function finishGuide() {
  const g = state.guide;
  bridge.clearGuide(g.tabId);
  forgetGuide(g.tabId);
  state.guide = null;
  state.feedback = { tip: g.tip, isHelpful: null, reasons: [], text: '', phase: 'form', error: '' };
  state.view = 'feedback';
  render();
  window.scrollTo(0, 0);
}

// "Stop guide", the back link, or leaving the tip's site.
async function exitGuide() {
  const g = state.guide;
  if (g) {
    bridge.clearGuide(g.tabId);
    forgetGuide(g.tabId);
  }
  state.guide = null;
  state.view = 'tips';
  render();
}

// Messages from guide.js in the page we're guiding.
function onGuideMessage(msg, sender) {
  const g = state.guide;
  if (!g || state.view !== 'guide' || sender.tab?.id !== g.tabId) return;
  if (String(msg.tipId) !== String(g.tip.tip_id) || msg.stepIndex !== g.stepIndex) return;

  switch (msg.type) {
    case MSG.GUIDE_STATUS:
      g.status = { found: !!msg.found, label: msg.label || null };
      g.canHighlight = true;
      break;
    case MSG.GUIDE_STEP_DONE:
      return completeStep();
    case MSG.GUIDE_OFFTRACK:
      g.offtrack = { clicked: msg.clicked || 'other', expected: msg.expected || '' };
      break;
    case MSG.GUIDE_BACK_ON_TRACK:
      g.offtrack = null;
      break;
    default:
      return;
  }
  render();
}

// ---------------------------------------------------------------------------
// Setup (R2)
// ---------------------------------------------------------------------------
function startSetup() {
  if (state.guide) {
    bridge.clearGuide(state.guide.tabId);
    forgetGuide(state.guide.tabId);
    state.guide = null;
  }
  state.setup = newSetup(state.teacher);
  state.view = 'setup';
  render();
}

async function saveTeacher(form) {
  const s = state.setup;
  s.first = form.first.value.trim();
  s.last = form.last.value.trim();
  s.email = form.email.value.trim().toLowerCase();

  if (!s.first) s.error = 'Please add your first name.';
  else if (!isValidEmail(s.email)) s.error = 'That email doesn’t look quite right. Try something like name@school.edu.';
  else s.error = '';
  if (s.error) return render();

  s.saving = true;
  render();
  try {
    const userId = toUserId(await registerTeacher({ firstName: s.first, lastName: s.last, email: s.email }));
    if (userId == null) throw new Error('No user id returned');
    state.teacher = { userId, firstName: s.first, lastName: s.last, email: s.email };
    state.setupDone = true;
    await chrome.storage.local.set({ [STORAGE.TEACHER]: state.teacher, [STORAGE.SETUP_DONE]: true });
    s.step = 3;
  } catch (err) {
    console.warn('PrepTip: register failed', err);
    s.error = navigator.onLine === false
      ? 'You seem to be offline. Check your connection and try again.'
      : 'We couldn’t save that right now. Please try again in a moment.';
  }
  s.saving = false;
  render();
}

// rpc/register_teacher returns a bare number, but accept { user_id } or [n] too.
function toUserId(res) {
  if (typeof res === 'number' || typeof res === 'string') return res;
  if (Array.isArray(res)) return toUserId(res[0]);
  if (res && typeof res === 'object') return res.user_id ?? res.register_teacher ?? null;
  return null;
}

async function finishSetup() {
  state.setup = newSetup(state.teacher);
  if (!state.catalog) {
    state.view = 'loading';
    render();
    return loadCatalog();
  }
  await showHome();
}

// ---------------------------------------------------------------------------
// Supabase writes
// ---------------------------------------------------------------------------
async function sendRequest(text) {
  const r = state.request;
  r.text = text;
  if (!text.trim()) {
    r.error = 'Tell us what you’d like a tip about.';
    return render();
  }
  r.saving = true;
  r.error = '';
  render();
  const site = state.browseSite || state.site;
  const siteName = site?.name || (isWebUrl(state.tab?.url) ? hostOf(state.tab.url) : null);
  try {
    await requestTip({ userId: state.teacher?.userId ?? null, siteName, text: text.trim() });
    r.sent = true;
    r.open = false;
  } catch (err) {
    console.warn('PrepTip: request failed', err);
    r.error = 'We couldn’t send that. Check your connection and try again.';
  }
  r.saving = false;
  render();
}

async function sendFeedback() {
  const f = state.feedback;
  if (!f || !views.canSubmitFeedback(f)) return;
  const reasons = f.reasons.join('; ');
  const text = [reasons, f.text.trim()].filter(Boolean).join(' | ');
  f.phase = 'saving';
  f.error = '';
  render();
  try {
    await submitFeedback({
      userId: state.teacher?.userId ?? null,
      tipId: f.tip.tip_id,
      isHelpful: f.isHelpful,
      text: text || null
    });
    f.phase = 'sent';
  } catch (err) {
    console.warn('PrepTip: feedback failed', err);
    f.phase = 'form';
    f.error = 'We couldn’t send that. You can try again or skip.';
  }
  render();
}

// ---------------------------------------------------------------------------
// DOM events: one click handler for every data-action button.
// ---------------------------------------------------------------------------
const actions = {
  // setup
  'setup-next': () => { state.setup.step += 1; state.setup.error = ''; render(); },
  'setup-back': () => { state.setup.step = Math.max(0, state.setup.step - 1); state.setup.error = ''; render(); },
  'setup-finish': () => finishSetup(),
  'cancel-setup': () => finishSetup(),
  'change-teacher': () => startSetup(),

  // list + search
  'retry': () => { state.retrying = true; render(); loadCatalog({ force: true }); },
  'open-tip': (el) => { const tip = findTip(el.dataset.tipId); if (tip) startGuide(tip, 0); },
  'clear-search': () => { state.query = ''; render(); $('#search')?.focus(); },
  'set-query': (el) => { state.query = el.dataset.q || ''; render(); $('#search')?.focus(); },
  'browse-site': (el) => {
    state.browseSite = state.catalog.websites.find((w) => w.url_pattern === el.dataset.pattern) || null;
    state.query = '';
    state.request = newRequest();
    render();
    window.scrollTo(0, 0);
  },
  'end-browse': () => { resetListState(); render(); },
  'open-request': () => {
    state.request.open = true;
    state.request.text ||= state.query.trim();
    render();
    const box = $('#request-text');
    if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
  },
  'close-request': () => { state.request = newRequest(); render(); },
  'dismiss-redirect': () => {
    if (state.redirect) state.dismissedRedirects.add(redirectId(state.redirect));
    render();
  },

  // guide
  'stop-guide': () => exitGuide(),
  'step-done': () => completeStep(),
  'show-again': () => { resetStepStatus(); render(); sendCurrentStep(); },

  // feedback
  'thumb': (el) => {
    const f = state.feedback;
    f.isHelpful = el.dataset.value === 'up';
    if (f.isHelpful) f.reasons = [];
    render();
  },
  'reason': (el) => {
    const f = state.feedback;
    const r = el.dataset.reason;
    f.reasons = f.reasons.includes(r) ? f.reasons.filter((x) => x !== r) : [...f.reasons, r];
    render();
  },
  'submit-feedback': () => sendFeedback(),
  'skip-feedback': () => { state.feedback.phase = 'skipped'; render(); },
  'back-to-tips': () => { state.feedback = null; state.view = 'tips'; render(); window.scrollTo(0, 0); }
};

function wireDomEvents() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (fn) {
      e.preventDefault();
      fn(el);
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'search') {
      state.query = e.target.value;
      state.request = newRequest();
      renderResults();
    } else if (e.target.id === 'request-text') {
      state.request.text = e.target.value;
    } else if (e.target.id === 'fb-text' && state.feedback) {
      state.feedback.text = e.target.value;
      const btn = $('#fb-submit');
      if (btn) btn.disabled = state.feedback.phase === 'saving' || !views.canSubmitFeedback(state.feedback);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'search' && e.key === 'Escape' && state.query) {
      state.query = '';
      e.target.value = '';
      renderResults();
    }
  });

  document.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'setup-form') saveTeacher(e.target);
    if (e.target.id === 'request-form') sendRequest($('#request-text')?.value || '');
  });
}

// ---------------------------------------------------------------------------
// Chrome events
// ---------------------------------------------------------------------------
function wireChromeEvents() {
  chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
    if (state.windowId != null && windowId !== state.windowId) return; // another window's tab
    chrome.tabs.get(tabId).then(onActiveTab).catch(() => {});
  });

  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if (tabId !== state.tab?.id) return;
    if (info.url) return onActiveTab(tab);
    // Same URL finished reloading: the old highlight is gone, so show the step again.
    if (info.status === 'complete' && state.view === 'guide') {
      resetStepStatus();
      render();
      sendCurrentStep();
    }
  });

  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === MSG.TAB_CONTEXT_CHANGED) {
      // Re-check our own window's active tab; nothing happens if it didn't change.
      refreshActiveTab();
      return;
    }
    onGuideMessage(msg, sender);
  });

  // background.js may record a redirect after the panel is already open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session' || !state.tab) return;
    if (STORAGE.redirectKey(state.tab.id) in changes) loadRedirect().then(() => {
      if (state.view !== 'setup') $('#notice').innerHTML = views.redirectNotice(visibleRedirect());
    });
  });
}

init();
