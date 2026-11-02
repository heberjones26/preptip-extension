// PrepTip side panel: state, chrome events, and click handling.
// Rendering lives in views.js; talking to the on-page guide lives in guide-bridge.js.
import { MSG, STORAGE } from '../lib/protocol.js';
import {
  getCatalog, getTipRatings, submitFeedback, requestTip,
  createAccount, signIn, requestResource, logEvent
} from '../lib/supabase.js';
import { matchSite, tipsForSite } from '../lib/sites.js';
import * as views from './views.js';
import * as bridge from './guide-bridge.js';
import { createPanelEngagement } from './engagement-tracking.js';
import { hostOf, isWebUrl } from './text.js';

// ---------------------------------------------------------------------------
// State. Everything the screens need lives here; render() turns it into HTML.
// ---------------------------------------------------------------------------
const state = {
  view: 'loading',          // 'setup' | 'loading' | 'error' | 'tips' | 'guide' | 'feedback' | 'resources'
  setupDone: false,
  teacher: null,            // { userId, username, gradeLevel }
  resourceGradeOnly: true,  // Teacher Resources view: show only my-grade matches (vs. all)
  resourceCategory: '',     // Teacher Resources view: category filter ('' = all)
  setup: newSetup(),
  catalog: null,
  ratings: {},              // { [tip_id]: { helpful, total } } read live from feedback
  retrying: false,
  windowId: null,
  tab: null,                // { id, url } of the active tab in this window
  site: null,               // website row matching tab.url, or null
  browseSite: null,         // a site picked from "Sites with tips" while on an unsupported page
  query: '',
  request: newRequest(),
  guide: null,              // { tip, stepIndex, tabId, live, canHighlight, status, offtrack }
  feedback: null            // { tip, isHelpful, reasons, text, phase, error }
};

// Setup screens: 0 welcome, 1 pin, 2 username + password, 3 done (+ grade pick).
function newSetup({ step = 0, mode = 'signup', grade = '' } = {}) {
  return {
    step,
    mode,                   // 'signup' (create an account) | 'signin'
    username: '',
    password: '',
    confirm: '',            // signup only: the password typed again
    notice: null,           // 'taken' when signup picks a username that already exists
    grade,                  // chosen grade band ('' = all grades / not set)
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
    case 'resources': return views.resourcesView(state);
    default: {
      const ctx = tipsContext();
      return ctx.site && ctx.tips.length ? views.tipsView(state, ctx) : views.unsupportedView(state, ctx);
    }
  }
}

function render() {
  if (state.view !== 'guide') engagement.stop(); // dwell only counts while a tip is open
  $('#header').innerHTML = views.header(state);
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
// Usage/engagement tracking for OKR 3 & 4 (Carlos): records an app opening per teacher.
const engagement = createPanelEngagement();
function recordUsage() {
  const userId = state.teacher?.userId;
  if (state.setupDone && userId != null) engagement.open(userId);
}

async function init() {
  wireDomEvents();
  wireChromeEvents();

  const local = await chrome.storage.local.get([STORAGE.TEACHER, STORAGE.SETUP_DONE]);
  state.teacher = local[STORAGE.TEACHER] || null;
  state.setupDone = local[STORAGE.SETUP_DONE] === true;
  // Accounts from before usernames (name + email) no longer exist in the database.
  if (state.teacher && !state.teacher.username) {
    state.teacher = null;
    state.setupDone = false;
    await chrome.storage.local.remove([STORAGE.TEACHER, STORAGE.SETUP_DONE]);
  }
  if (!state.setupDone) state.view = 'setup';
  recordUsage();

  await refreshActiveTab({ silent: true });
  render();
  await loadCatalog();
}

async function loadCatalog({ force = false } = {}) {
  const ratings = loadRatings();
  try {
    state.catalog = await getCatalog({ force });
  } catch (err) {
    console.warn('PrepTip: could not load tips', err);
    state.catalog = null;
  }
  await ratings;
  state.retrying = false;
  updateSite();

  if (state.view === 'setup') return render(); // setup keeps going; the list waits
  if (!state.catalog) {
    state.view = 'error';
    return render();
  }
  await showHome();
}

// Helpful counts are nice-to-have: if they fail to load, cards just don't show them.
async function loadRatings() {
  try {
    const fresh = await getTipRatings();
    // Keep a just-submitted vote visible if the aggregate endpoint is briefly stale.
    for (const [tipId, previous] of Object.entries(state.ratings)) {
      const current = fresh[tipId] || {};
      fresh[tipId] = {
        helpful: Math.max(Number(previous.helpful || 0), Number(current.helpful || 0)),
        total: Math.max(Number(previous.total || 0), Number(current.total || 0))
      };
    }
    state.ratings = fresh;
    if (state.view === 'tips') render();
  } catch (err) {
    console.warn('PrepTip: could not load helpful counts', err);
  }
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
  engagement.stop();
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
  // OKR 2 numerator: a tip was followed through 100% of its steps.
  logEvent({ type: 'tip_complete', userId: state.teacher?.userId, tipId: g.tip.tip_id, urlPattern: g.tip.url_pattern });
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
// Setup and sign-in (R2): a unique username and a password.
// ---------------------------------------------------------------------------

const USERNAME_RE = /^[A-Za-z0-9._-]{3,30}$/; // same rule as the database

// Forget the teacher on this browser and go straight to the sign-in form.
async function signOut() {
  if (state.guide) {
    bridge.clearGuide(state.guide.tabId);
    forgetGuide(state.guide.tabId);
    state.guide = null;
  }
  state.feedback = null;
  resetListState();
  state.teacher = null;
  state.setupDone = false;
  await chrome.storage.local.remove([STORAGE.TEACHER, STORAGE.SETUP_DONE]);
  state.setup = newSetup({ step: 2, mode: 'signin' });
  state.view = 'setup';
  render();
}

// Keep whatever was typed; every render rebuilds the form from state.
function readAccountForm(form) {
  const s = state.setup;
  if (!form) return;
  s.username = form.username.value.trim();
  s.password = form.password.value;
  if (form.confirm) s.confirm = form.confirm.value;
}

function setSetupMode(mode) {
  const s = state.setup;
  readAccountForm($('#setup-form'));
  s.mode = mode;
  s.notice = null;
  s.error = '';
  render();
}

function offlineOr(message) {
  return navigator.onLine === false ? 'You seem to be offline. Check your connection and try again.' : message;
}

function accountFormError(s) {
  if (!USERNAME_RE.test(s.username)) {
    return s.mode === 'signup'
      ? 'Usernames are 3 to 30 letters or numbers. You can also use . - and _ (no spaces).'
      : 'Type the username you signed up with.';
  }
  if (s.mode === 'signin') return s.password ? '' : 'Type your password.';
  if (s.password.length < 8) return 'Passwords need at least 8 characters.';
  if (s.password !== s.confirm) return 'The two passwords don’t match. Type them again.';
  return '';
}

async function submitAccount(form) {
  const s = state.setup;
  readAccountForm(form);
  s.notice = null;
  s.error = accountFormError(s);
  if (s.error) return render();

  s.saving = true;
  render();
  try {
    const account = s.mode === 'signup'
      ? await createAccount({ username: s.username, password: s.password })
      : await signIn({ username: s.username, password: s.password });
    if (!account) {
      s.error = 'That username and password don’t match. Check them and try again.';
    } else {
      // Grade is picked on the "You're set" screen next, so it starts null and set-grade persists it.
      state.teacher = { ...account, gradeLevel: s.grade || null };
      state.setupDone = true;
      await chrome.storage.local.set({ [STORAGE.TEACHER]: state.teacher, [STORAGE.SETUP_DONE]: true });
      recordUsage();
      s.password = '';
      s.confirm = '';
      s.step = 3;
    }
  } catch (err) {
    console.warn('PrepTip: account request failed', err);
    if (err.code === '23505') s.notice = 'taken'; // one account per username
    else s.error = offlineOr('We couldn’t reach PrepTip right now. Please try again in a moment.');
  }
  s.saving = false;
  render();
}

async function finishSetup() {
  state.setup = newSetup();
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

async function sendResourceRequest(text) {
  const r = state.request;
  r.text = text;
  if (!text.trim()) {
    r.error = 'Tell us which site we should add.';
    return render();
  }
  r.saving = true;
  r.error = '';
  render();
  try {
    await requestResource({ userId: state.teacher?.userId ?? null, text: text.trim() });
    r.sent = true;
    r.open = false;
  } catch (err) {
    console.warn('PrepTip: resource request failed', err);
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
    if (f.isHelpful !== null) {
      const rating = state.ratings[f.tip.tip_id] || { helpful: 0, total: 0 };
      state.ratings[f.tip.tip_id] = {
        helpful: Number(rating.helpful || 0) + (f.isHelpful ? 1 : 0),
        total: Number(rating.total || 0) + 1
      };
    }
    f.phase = 'sent';
    loadRatings(); // refresh from the aggregate; list view also redraws if it is already open
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
  'setup-back': () => {
    const s = state.setup;
    s.step = Math.max(0, s.step - 1);
    s.error = '';
    s.notice = null;
    render();
  },
  'setup-mode': (el) => setSetupMode(el.dataset.mode),
  'setup-finish': () => finishSetup(),
  'sign-out': () => signOut(),
  'set-grade': (el) => {
    state.setup.grade = el.dataset.grade || '';
    if (state.teacher) {
      // On the "You're set" screen / "Change grade", a teacher already exists — persist right away.
      state.teacher = { ...state.teacher, gradeLevel: state.setup.grade || null };
      chrome.storage.local.set({ [STORAGE.TEACHER]: state.teacher }).catch(() => {});
    }
    render();
  },

  // grade + resources
  'change-grade': () => {
    if (state.guide) { bridge.clearGuide(state.guide.tabId); forgetGuide(state.guide.tabId); state.guide = null; }
    state.setup = newSetup({ step: 3, grade: state.teacher?.gradeLevel || '' }); // "You're set" screen holds the picker
    state.view = 'setup';
    render();
    window.scrollTo(0, 0);
  },
  'open-resources': () => { state.request = newRequest(); state.resourceCategory = ''; state.view = 'resources'; render(); window.scrollTo(0, 0); },
  'close-resources': () => showHome(),
  'toggle-resource-filter': () => { state.resourceGradeOnly = !state.resourceGradeOnly; render(); },
  'set-resource-category': (el) => { state.resourceCategory = el.dataset.cat || ''; render(); window.scrollTo(0, 0); },

  // list + search
  'retry': () => { state.retrying = true; render(); loadCatalog({ force: true }); },
  'open-tip': (el) => {
    const tip = findTip(el.dataset.tipId);
    if (!tip) return;
    // OKR 2 denominator: a teacher opened a tip / started a walkthrough.
    logEvent({ type: 'tip_open', userId: state.teacher?.userId, tipId: tip.tip_id, urlPattern: tip.url_pattern });
    startGuide(tip, 0);
    engagement.click(tip.tip_id); // OKR 4: a tip view begins; dwell >10s counts as successful use
  },
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
    if (e.target.id === 'setup-form') submitAccount(e.target);
    if (e.target.id === 'request-form') sendRequest($('#request-text')?.value || '');
    if (e.target.id === 'resource-request-form') sendResourceRequest($('#request-text')?.value || '');
  });

  // Log when a teacher opens a Common Teacher Resource (doesn't block the link from opening).
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a.res-open');
    if (a) logEvent({ type: 'resource_open', userId: state.teacher?.userId, label: a.dataset.res || null });
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

}

init();
