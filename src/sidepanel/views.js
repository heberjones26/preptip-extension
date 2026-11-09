// Every screen of the side panel, as HTML strings.
// Rule: any text from the database or the teacher goes through esc() (or emphasize(), which escapes first).
// Buttons carry data-action="..." and sidepanel.js handles the clicks in one place.
import { searchTips } from '../lib/sites.js';
import {
  esc, plural, shortSiteName, hostOf, isWebUrl, wherePath, firstSentence,
  emphasize, splitActions, offtrackCopy, targetPath, targetKind
} from './text.js';
import {
  LOGO, SEARCH, GLOBE, CHECK, THUMB, PUZZLE, PIN, INFO, OFFLINE, WAND, STEPS, CAP, BOOKS, EXTERNAL, siteIcon
} from './icons.js';
import { GRADES, gradeLabel, splitByGrade, siteGrades } from '../data/segments.js';
import { RESOURCES } from '../data/resources.js';
import { SHARE_MESSAGE } from '../lib/share.js';

// The teacher's chosen grade band (or '' for all grades / not set).
function teacherGrade(state) {
  return state.teacher?.gradeLevel || '';
}

export const FEEDBACK_REASONS = ['Too many steps', 'Steps didn’t match my screen', 'Not what I needed'];

// ---------- shared bits ----------

function siteName(state, urlPattern) {
  return state.catalog?.websites.find((w) => w.url_pattern === urlPattern)?.name || urlPattern;
}

function minutes(tip) {
  const n = Number(tip.estimated_required_minutes);
  return n > 0 ? `~${n} min` : '';
}

// Shows "N teachers found this helpful" from the feedback table (state.ratings, see loadRatings in sidepanel.js).
function helpfulLine(rating) {
  const n = rating?.helpful || 0;
  if (!n) return "";
  return `<span class="tc-rating">${THUMB}${n === 1 ? "1 teacher" : `${n} teachers`} found this helpful</span>`;
}

function tipCard(state, tip, { featured = false, site = null } = {}) {
  const steps = tip.tip_steps?.length || 0;
  const mins = minutes(tip);
  return `
    <button type="button" class="tip-card${featured ? ' link' : ''}" data-action="open-tip" data-tip-id="${esc(tip.tip_id)}">
      <span class="tc-top"><b>${esc(tip.title)}</b>${site ? `<span class="site-tag">${esc(site)}</span>` : ''}</span>
      <span class="tc-sum">${esc(tip.summary)}</span>
      <span class="tc-meta">
        <span class="tag">${plural(steps, 'step')}</span>
        ${mins ? `<span class="tag">${mins}</span>` : ''}
        <span class="feat">${esc(tip.feature_name)}</span>
        <span class="go" aria-hidden="true">&rarr;</span>
      </span>
      ${helpfulLine(state.ratings?.[tip.tip_id])}
    </button>`;
}

function searchBox(query) {
  return `
    <label class="search">
      ${SEARCH}
      <input id="search" type="search" autocomplete="off" spellcheck="false"
        placeholder="Search how to… e.g. &ldquo;freeze top row&rdquo;" value="${esc(query)}" aria-label="Search tips">
      <button type="button" class="clear" data-action="clear-search" title="Clear search" ${query ? '' : 'hidden'}>&times;</button>
    </label>`;
}

function staleNote(state) {
  if (!state.catalog?.stale) return '';
  return `<p class="stale">${OFFLINE}<span>Offline, showing saved tips</span></p>`;
}

function sectionHead(title, sub) {
  return `<div class="sec-h"><h4>${title}</h4>${sub ? `<small>${sub}</small>` : ''}</div>`;
}

// "Request a tip": a button, then a small form, then a thank-you.
function requestBlock(state, label, hint = '') {
  const r = state.request;
  if (r.sent) {
    return `<div class="thanks">${CHECK}<div><b>Thanks! Your request was sent.</b><p>We read every request when choosing which tips to add next.</p></div></div>`;
  }
  if (r.open) {
    return `
      <form id="request-form" class="request">
        <label class="field"><span>What do you want to learn how to do?</span>
          <textarea id="request-text" rows="3" maxlength="500" placeholder="e.g. Print a seating chart">${esc(r.text)}</textarea>
        </label>
        ${r.error ? `<p class="form-error" role="alert">${esc(r.error)}</p>` : ''}
        <div class="row">
          <button type="button" class="btn ghost sm" data-action="close-request">Cancel</button>
          <button type="submit" class="btn primary sm grow" ${r.saving ? 'disabled' : ''}>${r.saving ? 'Sending…' : 'Send request'}</button>
        </div>
      </form>`;
  }
  return `<button type="button" class="btn outline full" data-action="open-request">${label}</button>${hint ? `<small class="muted">${hint}</small>` : ''}`;
}

// Unsupported-site search keeps this outside the results so there is only one form.
export function tipRequestHtml(state) {
  return requestBlock(state, 'Submit a tip request');
}

// ---------- header, notice, footer ----------

export function header(state) {
  const name = state.teacher?.username;
  const who = name
    ? `<span class="who"><span class="avatar">${esc(name[0].toUpperCase())}</span>${esc(name)}</span>`
    : '';
  return `<span class="brand">${LOGO}<b>PrepTip</b></span>${who}`;
}

export function footer(state) {
  if (state.view === 'setup' || !state.setupDone) return '';
  const name = state.teacher?.username || '';
  const grade = teacherGrade(state);
  const gradeBtn = `<button type="button" class="linkish grade" data-action="change-grade" title="${grade ? 'Change your grade' : 'Set the grade you teach'}">${CAP}${grade ? esc(gradeLabel(grade)) : 'Set grade'}</button>`;
  const resourcesLink = state.view === 'resources'
    ? ''
    : `<button type="button" class="linkish" data-action="open-resources">${BOOKS}Teacher resources</button><span class="sep" aria-hidden="true">&middot;</span>`;
  return `
    ${name ? `<span class="foot-who">Signed in as ${esc(name)}</span><span class="sep" aria-hidden="true">&middot;</span>` : ''}
    ${gradeBtn}<span class="sep" aria-hidden="true">&middot;</span>
    ${resourcesLink}
    <button type="button" class="linkish" data-action="sign-out">Sign out</button>
    <span class="sep" aria-hidden="true">&middot;</span>
    <button type="button" class="linkish" data-action="share-preptip" ${state.sharePhase === 'sharing' ? 'disabled' : ''}>Share PrepTip</button>
    <div class="share-status" role="status">${state.sharePhase === 'copied' ? 'Invite copied! Paste it into a message to another teacher.' : state.sharePhase === 'shared' ? 'Thanks for sharing PrepTip!' : ''}</div>
    ${state.sharePhase === 'manual' ? `<label class="field share-fallback"><span>Copy this invitation to share with another teacher:</span><textarea id="share-text" rows="4" readonly>${esc(SHARE_MESSAGE)}</textarea></label>` : ''}`;
}

// ---------- setup (R2) ----------

function setupWelcome() {
  return `
    <div class="hero">${LOGO}</div>
    <h2>Welcome to PrepTip</h2>
    <p class="lede">Quick, teacher-friendly how-tos for the web tools you already use.</p>
    <ul class="features">
      <li><span class="fi">${STEPS}</span><div><b>Tips for the site you&rsquo;re on</b><small>Open Google Sheets, Docs, Canvas and more. PrepTip shows the top how-tos for that tool.</small></div></li>
      <li><span class="fi">${WAND}</span><div><b>We point, you click</b><small>An orange highlight shows exactly where to click, one step at a time.</small></div></li>
      <li><span class="fi">${SEARCH}</span><div><b>Search in plain words</b><small>Type what you want to do, like &ldquo;freeze top row&rdquo;.</small></div></li>
    </ul>
    <button type="button" class="btn primary full" data-action="setup-next">Get started</button>`;
}

function setupPin() {
  return `
    <h2>Pin PrepTip to your toolbar</h2>
    <p class="lede">So it&rsquo;s always one click away.</p>
    <div class="pin-demo" aria-hidden="true">
      <div class="pd-bar"><span class="pd-omni"></span><span class="pd-ic hl">${PUZZLE}</span></div>
      <div class="pd-menu"><small>Extensions</small><div class="pd-row">${LOGO}<b>PrepTip</b><span class="pd-ic hl">${PIN}</span></div></div>
    </div>
    <ol class="howto">
      <li><span class="pin">1</span><div><b>Click the puzzle piece</b><p>It&rsquo;s at the top right of Chrome, next to the address bar.</p></div></li>
      <li><span class="pin">2</span><div><b>Find PrepTip and click the pin</b><p>The orange lightbulb now stays in your toolbar.</p></div></li>
      <li><span class="pin">3</span><div><b>Click the lightbulb anytime</b><p>This panel opens with tips for whatever site you&rsquo;re on.</p></div></li>
    </ol>
    <div class="row">
      <button type="button" class="btn ghost" data-action="setup-back">Back</button>
      <button type="button" class="btn primary grow" data-action="setup-next">Next</button>
    </div>`;
}

// Grade-band picker, shown on the "You're set" screen and re-reached via "Change grade".
function gradePicker(s) {
  const chip = (id, label) => {
    const on = (s.grade || '') === id;
    return `<button type="button" class="grade-chip${on ? ' on' : ''}" data-action="set-grade" data-grade="${esc(id)}" aria-pressed="${on}">${esc(label)}</button>`;
  };
  return `
    <fieldset class="field grades">
      <legend><span class="gl">${CAP}</span> What grade do you teach? <span class="opt">optional</span></legend>
      <div class="grade-grid">
        ${GRADES.map((g) => chip(g.id, g.label)).join('')}
        ${chip('', 'All grades')}
      </div>
    </fieldset>`;
}

// Shown when signup picks a username someone already has.
function takenNotice(s) {
  if (s.notice !== 'taken') return '';
  return `
    <div class="offtrack" role="alert">
      <b>&ldquo;${esc(s.username)}&rdquo; is already taken</b>
      <p>Each username belongs to one account. Pick a different one, or sign in if it&rsquo;s yours.</p>
      <button type="button" class="btn primary sm" data-action="setup-mode" data-mode="signin">It&rsquo;s mine, sign in</button>
    </div>`;
}

function setupForm(state) {
  const s = state.setup;
  const dis = s.saving ? 'disabled' : '';
  const signup = s.mode === 'signup';
  const busy = signup ? 'Creating…' : 'Signing in…';
  return `
    <h2>${signup ? 'Create your account' : 'Sign in to PrepTip'}</h2>
    <p class="lede">${signup
      ? 'Pick a username and password. We use them to keep your feedback and tip requests together.'
      : 'Use the username and password you picked when you signed up.'}</p>
    <form id="setup-form" class="form" novalidate>
      <label class="field"><span>Username</span><input name="username" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="30" value="${esc(s.username)}" ${dis}></label>
      ${takenNotice(s)}
      <label class="field"><span>Password</span><input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" maxlength="200" value="${esc(s.password)}" ${dis}></label>
      ${signup ? `<label class="field"><span>Type the password again</span><input name="confirm" type="password" autocomplete="new-password" maxlength="200" value="${esc(s.confirm)}" ${dis}></label>
      <p class="tiny-note">At least 8 characters. Keep it somewhere safe: there&rsquo;s no way to reset a forgotten password yet.</p>` : ''}
      ${s.error ? `<p class="form-error" role="alert">${esc(s.error)}</p>` : ''}
      <div class="row">
        <button type="button" class="btn ghost" data-action="setup-back" ${dis}>Back</button>
        <button type="submit" class="btn primary grow" ${dis}>${s.saving ? busy : signup ? 'Create account' : 'Sign in'}</button>
      </div>
      <p class="alt">${signup
        ? `Already have an account? <button type="button" class="linkish" data-action="setup-mode" data-mode="signin" ${dis}>Sign in</button>`
        : `New to PrepTip? <button type="button" class="linkish" data-action="setup-mode" data-mode="signup" ${dis}>Create an account</button>`}</p>
    </form>`;
}

function setupDone(state) {
  const sites = state.catalog?.websites || [];
  const name = esc(state.teacher?.username || 'teacher');
  return `
    <div class="win"><span class="win-ic">${CHECK}</span>
      <h4>${state.setup.mode === 'signin' ? `Welcome back, ${name}!` : `You&rsquo;re set, ${name}!`}</h4>
      <p>Open any of these sites and PrepTip will have tips ready.</p>
    </div>
    ${sites.length ? `<div class="chips center">${sites.map((w) => `<span class="chip">${esc(w.name)}</span>`).join('')}</div>` : ''}
    ${gradePicker(state.setup)}
    <button type="button" class="btn primary full" data-action="setup-finish">Show me tips</button>`;
}

export function setupView(state) {
  const step = state.setup.step;
  const screens = [setupWelcome, setupPin, setupForm, setupDone];
  const dots = screens.map((_, i) => `<i class="${i === step ? 'on' : i < step ? 'done' : ''}"></i>`).join('');
  return `
    <div class="setup">
      <div class="dots" role="img" aria-label="Step ${step + 1} of ${screens.length}">${dots}</div>
      ${screens[step](state)}
    </div>`;
}

// ---------- loading / error ----------

export function loadingView() {
  return '<div class="loading"><span class="spinner"></span>Loading tips…</div>';
}

export function errorView(state) {
  return `
    <div class="empty">
      <div class="empty-ic">${OFFLINE}</div>
      <h4>We couldn&rsquo;t load tips</h4>
      <p>Check your internet connection, then try again.</p>
    </div>
    <button type="button" class="btn primary full" data-action="retry" ${state.retrying ? 'disabled' : ''}>${state.retrying ? 'Trying…' : 'Retry'}</button>`;
}

// ---------- tips list + search (S2, R3/R4) ----------

// ctx = { site, tips, browsing } from sidepanel.js
export function tipsView(state, ctx) {
  const { site, tips, browsing } = ctx;
  const grade = teacherGrade(state);
  const recForGrade = grade && siteGrades(site.url_pattern).includes(grade);
  return `
    ${browsing ? '<button type="button" class="back" data-action="end-browse">&larr; All sites with tips</button>' : ''}
    <button type="button" class="site-chip site-switch" data-action="show-sites" aria-label="Browse all sites with tips">
      <span class="fav">${siteIcon(site)}</span>
      <span class="site-copy"><b>${esc(site.name)}</b><small>${plural(tips.length, 'tip')} for this site</small></span>
      ${recForGrade ? `<span class="rec-badge"><span class="gl">${CAP}</span>For ${esc(gradeLabel(grade))}</span>` : ''}
      <span class="site-switch-icon" aria-hidden="true">&#8964;</span>
    </button>
    ${browsing ? `<p class="tiny-note">You&rsquo;re not on ${esc(site.name)} right now, so tips open as a step list. Open ${esc(site.name)} to get the orange highlights.</p>` : ''}
    ${staleNote(state)}
    ${searchBox(state.query)}
    <div id="results" class="stack">${resultsHtml(state, ctx)}</div>`;
}

// The part under the search box. sidepanel.js re-renders only this while the teacher types.
export function resultsHtml(state, ctx) {
  const q = state.query.trim();
  const supported = ctx.site && ctx.tips.length;
  if (!supported) return q ? anywhereResults(state, q) : '';
  if (!q) {
    return sectionHead(`Top tips for ${esc(ctx.site.name)}`) +
      `<div class="cards">${ctx.tips.map((t, i) => tipCard(state, t, { featured: i === 0 })).join('')}</div>`;
  }
  return siteResults(state, ctx, q);
}

function siteResults(state, ctx, q) {
  const all = searchTips(state.catalog.tips, q);
  if (!all.length) return noResults(state, ctx, q);

  const here = all.filter((t) => t.url_pattern === ctx.site.url_pattern);
  const elsewhere = all.filter((t) => t.url_pattern !== ctx.site.url_pattern);
  const short = esc(shortSiteName(ctx.site.name));
  let html = '';

  if (here.length) {
    html += sectionHead(`${here.length === 1 ? '1 match' : `${here.length} matches`} on ${short}`);
    html += `<div class="cards">${here.map((t) => tipCard(state, t)).join('')}</div>`;
  } else {
    html += noResults(state, ctx, q);
  }
  if (elsewhere.length) {
    html += sectionHead('On other sites');
    html += `<div class="cards">${elsewhere.map((t) => tipCard(state, t, { site: siteName(state, t.url_pattern) })).join('')}</div>`;
  }
  if (here.length) html += `<div class="next"><div class="next-row"><b>Not quite it?</b>${requestBlock(state, 'Request a tip')}</div></div>`;
  return html;
}

// A clear request path whenever the current tool cannot help with this search.
function noResults(state, ctx, q, includeRequest = true) {
  return `
    <div class="empty">
      <div class="empty-ic">${SEARCH}</div>
      <h4>We don&rsquo;t currently have a tip for this${ctx.site ? ` on ${esc(shortSiteName(ctx.site.name))}` : ''}.</h4>
      <p>No tips match &ldquo;${esc(q)}&rdquo;${ctx.site ? ` on ${esc(shortSiteName(ctx.site.name))}` : ''}. Submit the problem so we can make a tip to help.</p>
    </div>
    ${includeRequest ? `<div class="next">
      ${tipRequestHtml(state)}
    </div>` : ''}`;
}

// Search from the unsupported-site view: every site, each card labeled.
function anywhereResults(state, q) {
  const all = searchTips(state.catalog.tips, q);
  if (!all.length) return noResults(state, { site: null }, q, false);
  return `<div class="cards">${all.map((t) => tipCard(state, t, { site: siteName(state, t.url_pattern) })).join('')}</div>`;
}

// ---------- unsupported site (R5, mockup 2B) ----------

function siteChip(w, rec = false) {
  return `<button type="button" class="chip link${rec ? ' rec' : ''}" data-action="browse-site" data-pattern="${esc(w.url_pattern)}">${rec ? `<span class="rec-dot" aria-hidden="true"></span>` : ''}${esc(w.name)}</button>`;
}

export function sitesView(state) {
  const sites = state.catalog?.websites || [];
  const grade = teacherGrade(state);
  const { recommended, other } = splitByGrade(sites, grade, (s) => siteGrades(s.url_pattern));
  return `
    <button type="button" class="back" data-action="end-browse">&larr; Back to tips</button>
    <div class="sec-h sites-heading"><h4>Sites with tips</h4><small>Choose a site to see its guides.</small></div>
    ${grade && recommended.length ? `
      <div class="next-row"><b><span class="gl">${CAP}</span> Recommended for ${esc(gradeLabel(grade))}</b><div class="chips">${recommended.map((w) => siteChip(w, true)).join('')}</div></div>
      ${other.length ? `<div class="next-row"><b>More sites with tips</b><div class="chips">${other.map((w) => siteChip(w)).join('')}</div></div>` : ''}`
      : `<div class="next-row"><b>Choose a site</b><div class="chips">${sites.map((w) => siteChip(w)).join('')}</div></div>`}`;
}

// "Sites with tips", split into a "Recommended for your grade" group when a grade is set.
function sitesWithTipsBlock(state, sites) {
  const grade = teacherGrade(state);
  const { recommended, other } = splitByGrade(sites, grade, (s) => siteGrades(s.url_pattern));
  if (grade && recommended.length) {
    return `
      <div class="next-row"><b><span class="gl">${CAP}</span> Recommended for ${esc(gradeLabel(grade))}</b><div class="chips">${recommended.map((w) => siteChip(w, true)).join('')}</div></div>
      ${other.length ? `<div class="next-row"><b>More sites with tips</b><div class="chips">${other.map((w) => siteChip(w)).join('')}</div></div>` : ''}`;
  }
  return `<div class="next-row"><b>Sites with tips</b><div class="chips">${sites.map((w) => siteChip(w)).join('')}</div></div>`;
}

export function unsupportedView(state, ctx) {
  const url = state.tab?.url || '';
  const label = ctx.site?.name || (isWebUrl(url) ? hostOf(url) : 'This page');
  const sites = state.catalog?.websites || [];
  return `
    <div class="site-chip muted"><span class="fav">${GLOBE}</span><div><b>${esc(label)}</b><small>Not supported yet</small></div></div>
    ${staleNote(state)}
    <div class="empty">
      <div class="empty-ic">${GLOBE}</div>
      <h4>No tips available for this site</h4>
      <p>We don&rsquo;t have guides for this website yet. Here&rsquo;s what you can do instead:</p>
    </div>
    <div class="sec-h"><h4>Looking for help with another tool?</h4></div>
    ${searchBox(state.query)}
    <div id="results" class="stack">${resultsHtml(state, ctx)}</div>
    <div class="next"><div id="tip-request" class="next-row">${tipRequestHtml(state)}</div></div>
    <div class="next">${sitesWithTipsBlock(state, sites)}</div>`;
}

// ---------- tip guide (S3, S4, S5) ----------

// Short label for a step in the list: "Set your rule" instead of the whole paragraph.
function stepText(step) {
  if (step.step_type === 'your_turn') {
    const { lead } = splitActions(step.step_description);
    if (lead) return lead;
  }
  return firstSentence(step.step_description).head;
}

function stepItem(g, step, i) {
  const n = i + 1;
  if (i < g.stepIndex) {
    return `<li class="done"><span class="sm">${CHECK}</span><div>${esc(stepText(step))}</div></li>`;
  }
  if (i > g.stepIndex) {
    return `<li class="todo"><span class="sm">${n}</span><div>${esc(stepText(step))}</div></li>`;
  }

  // The current step.
  if (step.step_type === 'your_turn') {
    return '';
  }
  const { head, rest } = firstSentence(step.step_description);
  const path = targetPath(step);
  let small = rest ? esc(rest) : '';
  if (g.offtrack) {
    small = path.length > 1
      ? `Re-open <b>${esc(g.offtrack.expected)}</b> first, then pick it from the list.`
      : `Click <b>${esc(g.offtrack.expected)}</b> (it&rsquo;s highlighted).`;
  }
  return `<li class="now${g.offtrack ? ' warn' : ''}"><span class="sm">${n}</span><div>${emphasize(head, path)}${small ? `<small>${small}</small>` : ''}</div></li>`;
}

// One line under the intro that says what the page is doing.
function liveLine(state, g, step) {
  if (!g.live) {
    const name = esc(siteName(state, g.tip.url_pattern));
    return `<p class="tiny-note">This tip is for ${name}. Open ${name} to see the orange highlights. You can still follow the steps here.</p>`;
  }
  if (g.canHighlight === false) {
    return '<p class="tiny-note">We can&rsquo;t highlight things on this page, so follow the steps below.</p>';
  }
  if (step.step_type !== 'guided' || g.offtrack) return '';
  if (g.status?.found) {
    const label = g.status.label || targetPath(step).slice(-1)[0] || 'the page';
    if (g.status.offscreen) {
      return `<div class="live"><i></i><span>Scroll ${g.status.offscreen === 'below' ? 'down' : 'up'} to find <b>${esc(label)}</b></span></div>`;
    }
    return `<div class="live"><i></i><span>Look for the orange highlight on <b>${esc(label)}</b></span></div>`;
  }
  if (g.status && !g.status.found) {
    const first = targetPath(step)[0];
    const where = targetKind(step) === 'menu' ? 'in the menu bar' : 'on the page';
    return `<p class="tiny-note">Can&rsquo;t spot it? Look for <b>${esc(first || 'it')}</b> ${where}.</p>`;
  }
  return '<div class="live wait"><i></i><span>Finding it on your page…</span></div>';
}

function offtrackBanner(g, step) {
  if (!g.offtrack) return '';
  const copy = offtrackCopy(g.offtrack, step);
  return `
    <div class="offtrack" role="alert">
      <b>${esc(copy.title)}</b>
      <p>${esc(copy.body)}</p>
      <button type="button" class="btn primary sm" data-action="show-again">Take me back to step ${g.stepIndex + 1}</button>
    </div>`;
}

function introCard(g) {
  const tip = g.tip;
  const where = wherePath(tip);
  const crumbs = where
    ? where.map((p) => `<span class="crumb">${esc(p)}</span>`).join('<span class="sep" aria-hidden="true">&rsaquo;</span>')
    : `<span class="crumb">${esc(tip.feature_name)}</span>`;
  return `
    <details class="intro">
      <summary>What it does</summary>
      <p>${esc(tip.description || tip.summary)}</p>
      <b class="where-h">Where it lives</b>
      <div class="crumbs">${crumbs}</div>
    </details>`;
}

function yourTurnCard(step) {
  const { lead, items } = splitActions(step.step_description);
  const body = items.length
    ? `<ol class="howto">${items.map((t, i) => `<li><span class="pin">${i + 1}</span><div><p>${esc(t)}</p></div></li>`).join('')}</ol>`
    : `<p class="yt-block">${esc(step.step_description)}</p>`;
  return `<section class="yt" aria-label="Your turn to take over"><div class="yt-heading"><span class="yt-mark" aria-hidden="true">↗</span><div><h4>Your turn</h4><p>Take over here and complete this step.</p></div></div>${lead ? `<p class="yt-lead">${esc(lead)}</p>` : ''}${body}</section>`;
}

export function guideView(state) {
  const g = state.guide;
  const tip = g.tip;
  const steps = tip.tip_steps;
  const step = steps[g.stepIndex];
  const total = steps.length;
  const pct = Math.round(((g.stepIndex + 1) / total) * 100);
  const yourTurn = step.step_type === 'your_turn';
  const overview = steps.map((s, i) => stepItem(g, s, i)).join('');

  const buttons = yourTurn
    ? `<button type="button" class="btn primary sm" data-action="step-done">I&rsquo;m done</button>`
    : `<button type="button" class="btn outline sm" data-action="step-done">I did this step</button>
       ${g.live && g.canHighlight !== false ? '<button type="button" class="btn ghost sm" data-action="show-again">Show me again</button>' : ''}`;
  const menuHint = !g.offtrack && g.live && targetKind(step) === 'menu' && g.status?.found
    ? '<p class="tiny-note">Clicked something else by accident? No problem: we&rsquo;ll notice and point you back.</p>' : '';

  return `
    <div class="g-head">
      <button type="button" class="back" data-action="stop-guide">&larr; All ${esc(shortSiteName(siteName(state, tip.url_pattern)))} tips</button>
      <h3>${esc(tip.title)}</h3>
      <div class="prog"><div class="prog-track"><i style="width:${pct}%"></i></div><span>Step ${g.stepIndex + 1} of ${total}</span></div>
    </div>
    ${offtrackBanner(g, step)}
    ${liveLine(state, g, step)}
    ${overview ? `<ol class="steps">${overview}</ol>` : ''}
    ${yourTurn ? yourTurnCard(step) : ''}
    ${introCard(g)}
    ${menuHint}
    <div class="g-foot">
      ${buttons}
      <button type="button" class="linkish stop" data-action="stop-guide">Stop guide</button>
    </div>`;
}

// ---------- feedback (S6) ----------

export function feedbackView(state) {
  const f = state.feedback;
  const tip = f.tip;
  const short = esc(shortSiteName(siteName(state, tip.url_pattern)));

  let card;
  if (f.phase === 'sent') {
    card = `<div class="thanks">${CHECK}<div><b>Thanks for the feedback!</b><p>It helps us improve tips for every teacher.</p></div></div>`;
  } else if (f.phase === 'skipped') {
    card = '<div class="thanks plain"><div><b>No problem.</b><p>Get back to your lesson. We&rsquo;ll be here next time.</p></div></div>';
  } else {
    const saving = f.phase === 'saving';
    const reasons = f.isHelpful === false
      ? `<div class="reasons"><small>What went wrong? (pick any)</small><div class="chips">${FEEDBACK_REASONS.map((r) =>
          `<button type="button" class="chip pick${f.reasons.includes(r) ? ' on' : ''}" data-action="reason" data-reason="${esc(r)}" aria-pressed="${f.reasons.includes(r)}">${esc(r)}</button>`).join('')}</div></div>`
      : '';
    card = `
      <h4>Was this helpful?</h4>
      <div class="thumbs">
        <button type="button" class="thumb up${f.isHelpful === true ? ' on' : ''}" data-action="thumb" data-value="up" aria-pressed="${f.isHelpful === true}">${THUMB}Yes</button>
        <button type="button" class="thumb down${f.isHelpful === false ? ' on' : ''}" data-action="thumb" data-value="down" aria-pressed="${f.isHelpful === false}">${THUMB}No</button>
      </div>
      ${reasons}
      <textarea id="fb-text" rows="3" maxlength="1000" placeholder="What would make this tip better? (optional)">${esc(f.text)}</textarea>
      ${f.error ? `<p class="form-error" role="alert">${esc(f.error)}</p>` : ''}
      <div class="fb-actions">
        <button type="button" id="fb-submit" class="btn primary sm" data-action="submit-feedback" ${saving || !canSubmitFeedback(f) ? 'disabled' : ''}>${saving ? 'Sending…' : 'Submit'}</button>
        <button type="button" class="skip" data-action="skip-feedback">Skip</button>
      </div>`;
  }

  return `
    <div class="g-head">
      <button type="button" class="back" data-action="back-to-tips">&larr; All ${short} tips</button>
      <h3>${esc(tip.title)}</h3>
      <div class="prog"><div class="prog-track"><i style="width:100%"></i></div><span>Complete</span></div>
    </div>
    <div class="win"><span class="win-ic">${CHECK}</span><h4>Nice work!</h4><p>You finished every step of &ldquo;${esc(tip.title)}&rdquo;.</p></div>
    <div class="fb">${card}</div>
    <button type="button" class="more" data-action="back-to-tips">Back to tips &rarr;</button>`;
}

// The database needs a thumbs choice or some text.
export function canSubmitFeedback(f) {
  return f.isHelpful !== null || f.reasons.length > 0 || f.text.trim() !== '';
}

// ---------- Common Teacher Resources (teacher-built sites: a blurb + a link, no walkthrough) ----------

function resourceCard(r) {
  const chips = (r.grades || []).map((g) => `<span class="rg">${esc(gradeLabel(g))}</span>`).join('');
  return `
    <div class="res-card">
      <div class="res-top"><b>${esc(r.name)}</b><span class="res-cat">${esc(r.category)}</span></div>
      <p class="res-blurb">${esc(r.blurb)}</p>
      <div class="res-foot">
        <span class="res-grades">${chips || '<span class="rg all">All grades</span>'}</span>
        <a class="res-open" data-res="${esc(r.name)}" href="${esc(r.url)}" target="_blank" rel="noopener">Open site ${EXTERNAL}</a>
      </div>
    </div>`;
}

// One-button toggle between "for my grade" and "all" (only shown when a grade is set).
function gradeToggle(grade, gradeOnly) {
  return `
    <div class="res-toggle" role="group" aria-label="Filter resources by grade">
      <button type="button" class="seg-toggle" data-action="toggle-resource-filter" aria-pressed="${gradeOnly}">
        <span class="seg-l${gradeOnly ? ' on' : ''}">For ${esc(gradeLabel(grade))}</span>
        <span class="seg-l${gradeOnly ? '' : ' on'}">All</span>
      </button>
    </div>`;
}

// Category chips (All + each distinct resource category).
function categoryChips(state) {
  const cats = [...new Set(RESOURCES.map((r) => r.category))];
  const chip = (id, label) => {
    const on = (state.resourceCategory || '') === id;
    return `<button type="button" class="chip cat${on ? ' on' : ''}" data-action="set-resource-category" data-cat="${esc(id)}" aria-pressed="${on}">${esc(label)}</button>`;
  };
  return `<div class="chips res-cats">${chip('', 'All')}${cats.map((c) => chip(c, c)).join('')}</div>`;
}

// "Suggest a resource" — its own small form (reuses state.request; routes to sendResourceRequest).
function resourceRequestBlock(state) {
  const r = state.request;
  if (r.sent) {
    return `<div class="thanks">${CHECK}<div><b>Thanks! We’ll take a look.</b><p>We check every suggestion when adding to this list.</p></div></div>`;
  }
  if (r.open) {
    return `
      <form id="resource-request-form" class="request">
        <label class="field"><span>Which site should we add?</span>
          <textarea id="request-text" rows="2" maxlength="400" placeholder="e.g. Seesaw — student portfolios">${esc(r.text)}</textarea>
        </label>
        ${r.error ? `<p class="form-error" role="alert">${esc(r.error)}</p>` : ''}
        <div class="row">
          <button type="button" class="btn ghost sm" data-action="close-request">Cancel</button>
          <button type="submit" class="btn primary sm grow" ${r.saving ? 'disabled' : ''}>${r.saving ? 'Sending…' : 'Send'}</button>
        </div>
      </form>`;
  }
  return `<button type="button" class="btn outline full" data-action="open-request">Suggest a resource</button>`;
}

export function resourcesView(state) {
  const grade = teacherGrade(state);
  const cat = state.resourceCategory || '';
  const pool = cat ? RESOURCES.filter((r) => r.category === cat) : RESOURCES;
  const gradeOnly = !!grade && state.resourceGradeOnly;
  const { recommended, other } = splitByGrade(pool, grade);

  let list;
  if (!pool.length) {
    list = `<p class="tiny-note">No resources in that category yet.</p>`;
  } else if (!grade) {
    list = `
      <p class="res-hint"><span class="gl">${CAP}</span><span>Set the grade you teach and these get sorted for your students. <button type="button" class="linkish" data-action="change-grade">Set grade</button></span></p>
      <div class="res-list">${pool.map(resourceCard).join('')}</div>`;
  } else if (gradeOnly) {
    const show = recommended.length ? recommended : pool;
    const hidden = other.length
      ? `<p class="res-more">${plural(other.length, 'other resource')} hidden · <button type="button" class="linkish" data-action="toggle-resource-filter">Show all</button></p>`
      : '';
    list = `${gradeToggle(grade, gradeOnly)}<div class="res-list">${show.map(resourceCard).join('')}</div>${hidden}`;
  } else {
    list = `
      ${gradeToggle(grade, gradeOnly)}
      ${recommended.length ? sectionHead(`Recommended for ${esc(gradeLabel(grade))}`) + `<div class="res-list">${recommended.map(resourceCard).join('')}</div>` : ''}
      ${other.length ? sectionHead('Other resources') + `<div class="res-list">${other.map(resourceCard).join('')}</div>` : ''}`;
  }

  return `
    <button type="button" class="back" data-action="close-resources">&larr; Back to tips</button>
    <div class="site-chip"><span class="fav">${BOOKS}</span>
      <div><b>Common Teacher Resources</b><small>Sites made for teachers — a quick overview, no walkthroughs</small></div>
    </div>
    ${categoryChips(state)}
    ${list}
    <div class="res-request">${resourceRequestBlock(state)}</div>`;
}
