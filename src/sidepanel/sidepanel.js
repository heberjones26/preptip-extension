// PrepTip side panel: state, chrome events, and click handling.
// Rendering lives in views.js; talking to the on-page guide lives in guide-bridge.js.
import { MSG, STORAGE } from '../lib/protocol.js';
import {
  getCatalog, getTipRatings, submitFeedback, requestTip,
  createAccount, signIn, requestResource, logEvent, logError, submitErrorReport
} from '../lib/supabase.js';
import { createErrorReporter, REPORT_REASONS, reportMessage } from '../lib/errors.js';
import { matchSite, tipsForSite, parseTarget } from '../lib/sites.js';
import * as views from './views.js';
import * as bridge from './guide-bridge.js';
import { createPanelEngagement } from './engagement-tracking.js';
import { hostOf, isWebUrl } from './text.js';
import { cleanSubjects, rememberProfile, recallProfile } from '../data/segments.js';
import { promptFor, parseAiTip, toTip, cleanSavedTips, cleanQuestion, dbTipId } from '../lib/ai-tip.js';
import { generateWithGemini, isUserFixable } from '../lib/gemini.js';
import { createKeyStore } from '../lib/ai-key.js';
import { sharePrepTip } from '../lib/share.js';

// ---------------------------------------------------------------------------
// State. Everything the screens need lives here; render() turns it into HTML.
// ---------------------------------------------------------------------------
const state = {
  view: 'loading',          // 'setup' | 'loading' | 'error' | 'tips' | 'guide' | 'feedback' | 'resources' | 'sites'
  setupDone: false,
  teacher: null,            // { userId, username, gradeLevel, subjects }
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
  sharePhase: 'idle',
  request: newRequest(),
  guide: null,              // { tip, stepIndex, tabId, live, canHighlight, status, offtrack }
  feedback: null,           // { tip, isHelpful, reasons, text, phase, error }
  report: newReport(),      // the "Report a problem" form
  ai: newAi(),              // the "Build a tip with AI" screen
  aiTips: [],               // AI-built tips saved in this browser (newest first)
  profiles: {},             // class settings remembered per account on this computer (see segments.js)
  aiKey: { has: false, remembered: false } // whether a Gemini key is saved (the key itself is never kept in state)
};

// Setup screens: 0 welcome, 1 pin, 2 username + password, 3 done (+ grade and subject pick).
// `editing` = reopened later from the footer to change grade/subjects (not first-run).
function newSetup({ step = 0, mode = 'signup', grade = '', subjects = [], editing = false } = {}) {
  return {
    step,
    mode,                   // 'signup' (create an account) | 'signin'
    username: '',
    password: '',
    confirm: '',            // signup only: the password typed again
    notice: null,           // 'taken' when signup picks a username that already exists
    grade,                  // chosen grade band ('' = all grades / not set)
    subjects: cleanSubjects(subjects), // chosen subject ids (any number)
    editing,
    saving: false,
    error: ''
  };
}

function newRequest() {
  return { open: false, text: '', saving: false, sent: false, error: '' };
}

// The "Build a tip with AI" screen. `returnTo` is the view to go back to.
function newAi({ question = '', site = '', returnTo = 'tips' } = {}) {
  return {
    question, site, reply: '', tip: null, finished: null,
    pasteError: '', geminiError: '', copied: false, copyFailed: false,
    building: false, key: '', remember: false, keyOpen: false, returnTo
  };
}

// The "Report a problem" form. `tip` is the tip being followed when it was opened (if any);
// `returnTo` is the view to go back to.
function newReport({ tip = null, returnTo = 'tips' } = {}) {
  return { reason: '', text: '', saving: false, sent: false, error: '', tip, returnTo };
}

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------------------
// Error log: what goes wrong for teachers (src/lib/errors.js + the error_log migration)
// ---------------------------------------------------------------------------
const extensionVersion = (() => { try { return chrome.runtime.getManifest().version; } catch { return ''; } })();
const reportError = createErrorReporter({ send: logError, version: extensionVersion });

// An automatic report, with the signed-in teacher filled in. Scrubbed, de-duplicated and capped
// inside the reporter; never throws.
function problem(category, context, err, extra = {}) {
  reportError({ source: 'auto', category, context, message: err?.message ?? err, userId: state.teacher?.userId ?? null, ...extra });
}

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
    case 'report': return views.reportView(state);
    case 'ai': return views.aiView(state);
    case 'sites': return views.sitesView(state);
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
  const request = $('#tip-request');
  if (request) request.innerHTML = views.tipRequestHtml(state);
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

  const local = await chrome.storage.local.get([STORAGE.TEACHER, STORAGE.SETUP_DONE, STORAGE.AI_TIPS, STORAGE.PROFILES]);
  state.profiles = local[STORAGE.PROFILES] && typeof local[STORAGE.PROFILES] === 'object' ? local[STORAGE.PROFILES] : {};
  state.teacher = local[STORAGE.TEACHER] || null;
  state.aiTips = cleanSavedTips(local[STORAGE.AI_TIPS]);
  loadAiKey();
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
    problem('load', 'catalog', err);
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
    problem('load', 'ratings', err);
  }
}

// Home = resume a saved guide for this tab (or the one `carried` over from the tab that opened it),
// or show the tips list.
async function showHome(carried = null) {
  const saved = (await readSavedGuide(state.tab?.id)) || carried;
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

  // The AI tip builder sends teachers to another tab (ChatGPT, Claude, Gemini) and back, and an AI tip's
  // steps are followed on the teacher's own page, so a tab switch must not reset either of them.
  if (state.view === 'ai' || (state.view === 'guide' && state.guide?.tip.ai)) return render();

  if (!sameTab) {
    // Leave the old tab clean. Its saved guide stays in session storage so it resumes later.
    const left = state.guide;
    if (left) bridge.clearGuide(left.tabId);
    // A link in the guided tab opened this one (target=_blank): bring the guide along.
    const carried = left && tab.openerTabId === left.tabId
      ? { tipId: left.tip.tip_id, stepIndex: left.stepIndex }
      : null;
    state.guide = null;
    state.feedback = null;
    state.view = 'loading'; // until showHome picks a view (another tab event may render meanwhile)
    resetListState();
    return showHome(carried);
  }

  // Same tab, new URL: a link or button the tip asked for, a redirect, a reload or an in-app route.
  // (AI tips aren't tied to a site and never highlight, so there is nothing to pause or resume.)
  if (state.view === 'guide' && state.guide && !state.guide.tip.ai) {
    const g = state.guide;
    if (state.site?.url_pattern === g.tip.url_pattern) {
      if (!g.live) {
        g.live = true;          // back on the tip's site: highlight again
        g.canHighlight = null;
      }
      resetStepStatus();
      render();
      sendCurrentStep(); // the page may have reloaded, so highlight again
    } else {
      pauseGuide();
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
    if (!ok) problem('guide', 'highlight-unavailable', 'Could not show the on-page guide', { tipId: g.tip.tip_id, urlPattern: g.tip.url_pattern });
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
  if (g.tip.ai) { // AI tips only exist in this browser: nothing to rate or count
    bridge.clearGuide(g.tabId);
    forgetGuide(g.tabId);
    state.guide = null;
    state.ai.tip = g.tip;
    state.ai.finished = g.tip.title;
    state.view = 'ai';
    render();
    window.scrollTo(0, 0);
    return;
  }
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

// The tab left the tip's site: a sign-in page, a redirect hop, a page the tip's link leads to,
// or somewhere else entirely. Keep the tip and step (and the saved copy) so the teacher doesn't
// lose their place; highlighting picks up again when the tab is back on the tip's site.
function pauseGuide() {
  const g = state.guide;
  if (g.live) {
    sendToken++; // ignore a highlight request still in flight
    g.live = false;
    g.canHighlight = null;
    bridge.clearGuide(g.tabId);
  }
  resetStepStatus();
  engagement.stop(); // time spent elsewhere doesn't count as reading the tip
  render();
}

// "Stop guide" or the back link.
async function exitGuide() {
  const g = state.guide;
  if (g) {
    bridge.clearGuide(g.tabId);
    forgetGuide(g.tabId);
  }
  state.guide = null;
  state.view = g?.tip.ai ? 'ai' : 'tips';
  render();
}

// If a guided step's target still can't be found after a while, the tip's steps probably no longer
// match the real page. That's exactly what the team needs to know, so log it once per tip + step.
const MISSING_TARGET_MS = 8000;
let missingTimer = 0;
function watchForMissingTarget(g) {
  clearTimeout(missingTimer);
  const step = g.tip.tip_steps[g.stepIndex];
  if (g.status.found || step?.step_type !== 'guided' || g.offtrack) return;
  const { tip, stepIndex } = g;
  missingTimer = setTimeout(() => {
    const now = state.guide;
    if (state.view !== 'guide' || !now || now.tip !== tip || now.stepIndex !== stepIndex || now.status?.found) return;
    const { kind, path } = parseTarget(step.target_element); // "menu:Format > Conditional formatting"
    problem('guide', `target-not-found step ${stepIndex + 1}`,
      `Couldn’t find “${path.join(' > ') || step.target_element}”${kind ? ` (${kind})` : ''} on the page`,
      { tipId: tip.tip_id, urlPattern: tip.url_pattern });
  }, MISSING_TARGET_MS);
}

// Messages from guide.js in the page we're guiding.
function onGuideMessage(msg, sender) {
  const g = state.guide;
  if (!g || state.view !== 'guide' || sender.tab?.id !== g.tabId) return;
  if (String(msg.tipId) !== String(g.tip.tip_id) || msg.stepIndex !== g.stepIndex) return;

  switch (msg.type) {
    case MSG.GUIDE_STATUS:
      g.status = { found: !!msg.found, label: msg.label || null, offscreen: msg.offscreen || null };
      g.canHighlight = true;
      watchForMissingTarget(g);
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
  await chrome.storage.local.remove([STORAGE.TEACHER, STORAGE.SETUP_DONE, STORAGE.AI_TIPS]);
  await keyStore().clear(); // the Gemini key and AI tips belong to this teacher, not the next person on this computer
  state.aiTips = [];
  state.aiKey = { has: false, remembered: false };
  state.ai = newAi();
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
      // Grade and subjects are picked on the "You're set" screen next; set-grade / toggle-subject persist them.
      // Whatever was picked on this computer last time this account signed in comes back with it.
      const saved = recallProfile(state.profiles, account.userId);
      state.teacher = {
        ...account,
        gradeLevel: s.grade || saved.gradeLevel,
        subjects: cleanSubjects(s.subjects).length ? cleanSubjects(s.subjects) : saved.subjects
      };
      s.grade = state.teacher.gradeLevel || '';       // so the pickers on the next screen show them
      s.subjects = state.teacher.subjects;
      state.setupDone = true;
      await chrome.storage.local.set({ [STORAGE.TEACHER]: state.teacher, [STORAGE.SETUP_DONE]: true });
      recordUsage();
      s.password = '';
      s.confirm = '';
      s.step = 3;
    }
  } catch (err) {
    console.warn('PrepTip: account request failed', err);
    if (err.code === '23505') {
      s.notice = 'taken'; // one account per username
    } else {
      problem('account', s.mode, err); // an unexpected failure, not a typo or a taken name
      s.error = offlineOr('We couldn’t reach PrepTip right now. Please try again in a moment.');
    }
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
    problem('network', 'tip-request', err);
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
    problem('network', 'resource-request', err);
    r.error = 'We couldn’t send that. Check your connection and try again.';
  }
  r.saving = false;
  render();
}

// ---------------------------------------------------------------------------
// Build a tip with AI (src/lib/ai-tip.js, src/lib/gemini.js, src/lib/ai-key.js)
// ---------------------------------------------------------------------------
const keyStore = () => createKeyStore({ local: chrome.storage.local, session: chrome.storage.session });

// Pre-fill the website box from where the teacher is; they can change or clear it.
function aiSiteGuess() {
  const site = state.browseSite || state.site;
  if (site) return site.name;
  return isWebUrl(state.tab?.url) ? hostOf(state.tab.url) : '';
}

async function loadAiKey() {
  const { key, remembered } = await keyStore().get();
  state.aiKey = { has: !!key, remembered };
  return key;
}

async function saveAiTips() {
  state.aiTips = state.aiTips.slice(0, 10);
  try { await chrome.storage.local.set({ [STORAGE.AI_TIPS]: state.aiTips }); } catch { /* it still works this session */ }
}

// Keep the grade and subjects with the account on this computer, not just in the signed-in session,
// so they're still there after signing out and back in.
function saveClassSettings() {
  state.profiles = rememberProfile(state.profiles, state.teacher.userId, {
    gradeLevel: state.teacher.gradeLevel, subjects: state.teacher.subjects
  });
  chrome.storage.local.set({ [STORAGE.TEACHER]: state.teacher, [STORAGE.PROFILES]: state.profiles }).catch(() => {});
}

// A tip was built: show it, keep it, count it (a count only — never the question or the answer).
async function aiTipReady(parsed, method) {
  const tip = toTip(parsed, { siteName: state.ai.site });
  state.ai.tip = tip;
  state.ai.finished = null;
  state.ai.pasteError = '';
  state.ai.geminiError = '';
  state.aiTips = [tip, ...state.aiTips];
  await saveAiTips();
  logEvent({ type: method === 'gemini' ? 'ai_tip_gemini' : 'ai_tip_pasted', userId: state.teacher?.userId });
}

async function aiCopy() {
  const text = promptFor(state.ai, state.teacher);
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch { /* fall back to selecting the text */ }
  if (!ok) {
    const box = $('#ai-prompt');
    if (box) { try { box.focus(); box.select(); ok = document.execCommand('copy'); } catch { /* ignore */ } }
  }
  state.ai.copied = ok;
  state.ai.copyFailed = !ok;
  if (ok) logEvent({ type: 'ai_prompt_copied', userId: state.teacher?.userId });
  render();
}

async function aiBuildFromReply() {
  const a = state.ai;
  const parsed = parseAiTip(a.reply);
  if (!parsed.ok) {
    a.pasteError = parsed.error;
    if (a.reply.trim()) problem('other', 'ai-parse', 'A pasted AI answer was not in the requested format'); // never the answer itself
    return render();
  }
  await aiTipReady(parsed.tip, 'paste');
  a.reply = '';
  render();
  window.scrollTo(0, 0);
}

async function aiBuildWithGemini() {
  const a = state.ai;
  if (a.building) return;
  const typed = a.key.trim();
  const key = typed || await loadAiKey();
  if (!key) { a.geminiError = 'Paste your Gemini key first.'; return render(); }

  a.building = true;
  a.geminiError = '';
  render();
  try {
    const text = await generateWithGemini({ key, prompt: promptFor(a, state.teacher) });
    const parsed = parseAiTip(text);
    if (!parsed.ok) {
      const err = new Error('Gemini answered in an unusable format');
      err.friendly = 'Gemini answered, but not in a form we could use. Try again, or use copy and paste.';
      throw err;
    }
    if (typed) { // only keep a key that just worked
      await keyStore().set(typed, a.remember);
      state.aiKey = { has: true, remembered: a.remember };
      a.key = '';
    }
    await aiTipReady(parsed.tip, 'gemini');
  } catch (err) {
    a.geminiError = err.friendly || 'Something went wrong. Try again, or use copy and paste.';
    if (!isUserFixable(err)) problem('other', 'ai-gemini', err); // a wrong key or the free limit is not our bug
  }
  a.building = false;
  render();
  if (a.tip) window.scrollTo(0, 0);
}

async function sendReport() {
  const r = state.report;
  const reason = REPORT_REASONS.find((x) => x.id === r.reason);
  if (!reason) { r.error = 'Pick what went wrong first.'; return render(); }
  if (reason.id === 'other' && !r.text.trim()) { r.error = 'Tell us a little about what happened.'; return render(); }
  r.saving = true;
  r.error = '';
  render();
  try {
    await submitErrorReport({
      source: 'reported', category: reason.category, context: 'teacher-report',
      message: reportMessage(reason.id, r.text),
      tipId: dbTipId(r.tip), urlPattern: r.tip?.ai ? null : r.tip?.url_pattern ?? null,
      userId: state.teacher?.userId ?? null, version: extensionVersion
    });
    r.sent = true;
  } catch (err) {
    console.warn('PrepTip: report failed', err);
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
    problem('network', 'feedback', err, { tipId: f.tip.tip_id, urlPattern: f.tip.url_pattern });
    f.phase = 'form';
    f.error = 'We couldn’t send that. You can try again or skip.';
  }
  render();
}

// ---------------------------------------------------------------------------
// DOM events: one click handler for every data-action button.
// ---------------------------------------------------------------------------
const actions = {
  'share-preptip': async () => {
    if (state.sharePhase === 'sharing') return;
    // Start sharing directly from the click to retain browser user activation.
    const result = sharePrepTip();
    state.sharePhase = 'sharing';
    $('#footer').innerHTML = views.footer(state);
    state.sharePhase = await result;
    $('#footer').innerHTML = views.footer(state);
    if (state.sharePhase === 'manual') {
      const text = $('#share-text');
      text?.focus();
      text?.select();
    }
  },
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
      saveClassSettings();
    }
    render();
  },
  'toggle-subject': (el) => {
    const picked = new Set(state.setup.subjects);
    if (!picked.delete(el.dataset.subject)) picked.add(el.dataset.subject);
    state.setup.subjects = cleanSubjects([...picked]);
    if (state.teacher) {
      state.teacher = { ...state.teacher, subjects: state.setup.subjects };
      saveClassSettings();
    }
    render();
  },

  // build a tip with AI
  'open-ai': () => {
    state.ai = newAi({ question: cleanQuestion(state.request.text || state.query || ''), site: aiSiteGuess(), returnTo: state.view });
    state.view = 'ai';
    render();
    window.scrollTo(0, 0);
    loadAiKey().then(() => { if (state.view === 'ai') render(); });
  },
  'ai-back': () => {
    state.view = ['tips', 'resources', 'sites'].includes(state.ai.returnTo) ? state.ai.returnTo : 'tips';
    render();
    window.scrollTo(0, 0);
  },
  'ai-copy': () => aiCopy(),
  'ai-build': () => aiBuildFromReply(),
  'ai-gemini': () => aiBuildWithGemini(),
  'ai-key-forget': async () => {
    await keyStore().clear();
    state.aiKey = { has: false, remembered: false };
    state.ai.key = '';
    render();
  },
  'ai-follow': () => { if (state.ai.tip) startGuide(state.ai.tip, 0); },
  'ai-discard': () => { state.ai.tip = null; state.ai.finished = null; render(); },
  'ai-open-saved': (el) => {
    const tip = state.aiTips.find((t) => t.tip_id === el.dataset.id);
    if (!tip) return;
    state.ai.tip = tip;
    state.ai.finished = null;
    render();
    window.scrollTo(0, 0);
  },
  'ai-remove': async (el) => {
    state.aiTips = state.aiTips.filter((t) => t.tip_id !== el.dataset.id);
    if (state.ai.tip?.tip_id === el.dataset.id) state.ai.tip = null;
    await saveAiTips();
    render();
  },

  // report a problem
  'report-problem': () => {
    state.report = newReport({ tip: state.view === 'guide' ? state.guide?.tip ?? null : null, returnTo: state.view });
    state.view = 'report';
    render();
    window.scrollTo(0, 0);
  },
  'report-reason': (el) => { state.report.reason = el.dataset.reason; state.report.error = ''; render(); },
  'report-back': () => {
    const back = state.report.returnTo;
    const canReturn = { guide: !!state.guide, feedback: !!state.feedback, resources: true, sites: true, tips: true };
    state.view = canReturn[back] ? back : 'tips';
    render();
    window.scrollTo(0, 0);
  },

  // grade, subjects + resources
  'change-grade': () => {
    if (state.guide) { bridge.clearGuide(state.guide.tabId); forgetGuide(state.guide.tabId); state.guide = null; }
    // The last setup screen holds both pickers.
    state.setup = newSetup({ step: 3, grade: state.teacher?.gradeLevel || '', subjects: state.teacher?.subjects, editing: true });
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
    state.view = 'tips';
    render();
    window.scrollTo(0, 0);
  },
  'show-sites': () => { state.browseSite = null; state.view = 'sites'; render(); window.scrollTo(0, 0); },
  'end-browse': () => {
    if (state.browseSite) {
      state.browseSite = null;
      state.query = '';
      state.view = 'sites';
    } else {
      resetListState();
      state.view = 'tips';
    }
    render();
    window.scrollTo(0, 0);
  },
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
  'skip-feedback': () => { state.feedback = null; state.view = 'tips'; render(); window.scrollTo(0, 0); },
  'back-to-tips': () => { state.feedback = null; state.view = 'tips'; render(); window.scrollTo(0, 0); }
};

function wireDomEvents() {
  // Anything uncaught in the panel goes to the error log (de-duplicated and capped).
  window.addEventListener('error', (e) => problem('ui', 'script-error', e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => problem('ui', 'unhandled-rejection', e.reason));

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
    } else if (e.target.id === 'ai-question' || e.target.id === 'ai-site') {
      state.ai[e.target.id === 'ai-site' ? 'site' : 'question'] = e.target.value;
      const box = $('#ai-prompt'); // keep the visible prompt in step without re-drawing (and losing focus)
      if (box) box.value = promptFor(state.ai, state.teacher);
      state.ai.copied = false;
    } else if (e.target.id === 'ai-reply') {
      state.ai.reply = e.target.value;
    } else if (e.target.id === 'ai-key') {
      state.ai.key = e.target.value;
    } else if (e.target.id === 'ai-remember') {
      state.ai.remember = e.target.checked;
    } else if (e.target.id === 'report-text') {
      state.report.text = e.target.value;
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
    if (e.target.id === 'report-form') sendReport();
    if (e.target.id === 'resource-request-form') sendResourceRequest($('#request-text')?.value || '');
  });

  // <details> doesn't bubble 'toggle', so listen while it's still travelling down.
  document.addEventListener('toggle', (e) => { if (e.target.id === 'ai-gemini-box') state.ai.keyOpen = e.target.open; }, true);

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
