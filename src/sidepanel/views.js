// Every screen of the side panel, as HTML strings.
// Rule: any text from the database or the teacher goes through esc() (or emphasize(), which escapes first).
// Buttons carry data-action="..." and sidepanel.js handles the clicks in one place.
import { searchTips } from '../lib/sites.js';
import {
  esc, plural, shortSiteName, hostOf, isWebUrl, wherePath, firstSentence,
  emphasize, splitActions, offtrackCopy, targetPath, targetKind
} from './text.js';
import {
  LOGO, SEARCH, GLOBE, CHECK, THUMB, PUZZLE, PIN, INFO, OFFLINE, WAND, STEPS, siteIcon
} from './icons.js';

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

// ---------- header, notice, footer ----------

export function header(state) {
  const first = state.teacher?.firstName;
  const who = first
    ? `<span class="who" title="${esc(state.teacher.email || '')}"><span class="avatar">${esc(first[0].toUpperCase())}</span>${esc(first)}</span>`
    : '';
  return `<span class="brand">${LOGO}<b>PrepTip</b></span>${who}`;
}

export function redirectNotice(redirect) {
  if (!redirect) return '';
  return `
    <div class="redirect" role="status">
      ${INFO}<span>You were redirected here from <b>${esc(hostOf(redirect.from))}</b></span>
      <button type="button" class="x" data-action="dismiss-redirect" aria-label="Dismiss">&times;</button>
    </div>`;
}

export function footer(state) {
  if (state.view === 'setup' || !state.setupDone) return '';
  const t = state.teacher;
  const name = t ? [t.firstName, t.lastName].filter(Boolean).join(' ') : '';
  return `${name ? `<span>Signed in as ${esc(name)}</span><span aria-hidden="true">&middot;</span>` : ''}
    <button type="button" class="linkish" data-action="change-teacher">Change teacher</button>`;
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

function setupForm(state) {
  const s = state.setup;
  const dis = s.saving ? 'disabled' : '';
  return `
    <h2>Tell us who you are</h2>
    <p class="lede">We use this to keep your feedback and tip requests together. No password needed.</p>
    <form id="setup-form" class="form" novalidate>
      <div class="two">
        <label class="field"><span>First name</span><input name="first" autocomplete="given-name" maxlength="60" value="${esc(s.first)}" ${dis}></label>
        <label class="field"><span>Last name</span><input name="last" autocomplete="family-name" maxlength="60" value="${esc(s.last)}" ${dis}></label>
      </div>
      <label class="field"><span>School email</span><input name="email" type="email" autocomplete="email" maxlength="120" placeholder="you@school.edu" value="${esc(s.email)}" ${dis}></label>
      ${s.error ? `<p class="form-error" role="alert">${esc(s.error)}</p>` : ''}
      <div class="row">
        <button type="button" class="btn ghost" data-action="setup-back" ${dis}>Back</button>
        <button type="submit" class="btn primary grow" ${dis}>${s.saving ? 'Saving…' : 'Save and continue'}</button>
      </div>
    </form>`;
}

function setupDone(state) {
  const sites = state.catalog?.websites || [];
  return `
    <div class="win"><span class="win-ic">${CHECK}</span>
      <h4>You&rsquo;re set, ${esc(state.teacher?.firstName || 'teacher')}!</h4>
      <p>Open any of these sites and PrepTip will have tips ready.</p>
    </div>
    ${sites.length ? `<div class="chips center">${sites.map((w) => `<span class="chip">${esc(w.name)}</span>`).join('')}</div>` : ''}
    <button type="button" class="btn primary full" data-action="setup-finish">Show me tips</button>`;
}

export function setupView(state) {
  const step = state.setup.step;
  const screens = [setupWelcome, setupPin, setupForm, setupDone];
  const dots = screens.map((_, i) => `<i class="${i === step ? 'on' : i < step ? 'done' : ''}"></i>`).join('');
  const cancel = state.setupDone && step < 3
    ? '<button type="button" class="linkish" data-action="cancel-setup">Cancel</button>' : '';
  return `
    <div class="setup">
      <div class="dots" role="img" aria-label="Step ${step + 1} of ${screens.length}">${dots}${cancel}</div>
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
  return `
    ${browsing ? '<button type="button" class="back" data-action="end-browse">&larr; Back</button>' : ''}
    <div class="site-chip"><span class="fav">${siteIcon(site)}</span>
      <div><b>${esc(site.name)}</b><small>${plural(tips.length, 'tip')} for this site</small></div>
    </div>
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
    return sectionHead(`Top tips for ${esc(ctx.site.name)}`, 'What teachers get stuck on most') +
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
    html += `<p class="tiny-note">No ${short} tips for &ldquo;${esc(q)}&rdquo; yet, but other sites have some.</p>`;
  }
  if (elsewhere.length) {
    html += sectionHead('On other sites');
    html += `<div class="cards">${elsewhere.map((t) => tipCard(state, t, { site: siteName(state, t.url_pattern) })).join('')}</div>`;
  }
  html += `<div class="next"><div class="next-row"><b>Not quite it?</b>${requestBlock(state, 'Request a tip')}</div></div>`;
  return html;
}

// Mockup 2A: nothing matched anywhere.
function noResults(state, ctx, q) {
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  const popular = ctx.tips.slice(0, 3);
  return `
    <div class="empty">
      <div class="empty-ic">${SEARCH}</div>
      <h4>No ${esc(shortSiteName(ctx.site.name))} tips for &ldquo;${esc(q)}&rdquo; yet</h4>
      <p>Here are a few ways to keep going:</p>
    </div>
    <div class="next">
      ${words.length > 1 ? `<div class="next-row"><b>Try fewer words</b><div class="chips">${words.map((w) => `<button type="button" class="chip" data-action="set-query" data-q="${esc(w)}">${esc(w)}</button>`).join('')}</div></div>` : ''}
      ${popular.length ? `<div class="next-row"><b>Popular on ${esc(ctx.site.name)}</b><div class="chips">${popular.map((t) => `<button type="button" class="chip link" data-action="open-tip" data-tip-id="${esc(t.tip_id)}">${esc(t.title)}</button>`).join('')}</div></div>` : ''}
      <div class="next-row"><b>Still stuck?</b>${requestBlock(state, 'Request this tip', 'We read every request when choosing new tips.')}</div>
    </div>`;
}

// Search from the unsupported-site view: every site, each card labeled.
function anywhereResults(state, q) {
  const all = searchTips(state.catalog.tips, q);
  if (!all.length) return `<p class="tiny-note">No tips match &ldquo;${esc(q)}&rdquo;. Try fewer words, or request a tip below.</p>`;
  return `<div class="cards">${all.map((t) => tipCard(state, t, { site: siteName(state, t.url_pattern) })).join('')}</div>`;
}

// ---------- unsupported site (R5, mockup 2B) ----------

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
    <div class="next">
      <div class="next-row"><b>Looking for help with another tool?</b>${searchBox(state.query)}<div id="results" class="stack results-inline">${resultsHtml(state, ctx)}</div></div>
      <div class="next-row"><b>Sites with tips</b><div class="chips">${sites.map((w) => `<button type="button" class="chip link" data-action="browse-site" data-pattern="${esc(w.url_pattern)}">${esc(w.name)}</button>`).join('')}</div></div>
      <div class="next-row"><b>Use this site a lot?</b>${requestBlock(state, isWebUrl(url) ? 'Suggest tips for this site' : 'Request a tip')}</div>
    </div>`;
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
    const { lead } = splitActions(step.step_description);
    return `<li class="now"><span class="sm">${n}</span><div>Your turn: ${esc(lead || stepText(step))}</div></li>`;
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
    <details class="intro" ${g.stepIndex === 0 ? 'open' : ''}>
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
  return `
    <div class="yt">
      <div class="arrived">${CHECK}<div><b>${esc(lead || 'Your turn')}</b><p>${items.length
        ? 'This part is up to you. Follow these in order:'
        : 'This part is up to you. Here’s what to do:'}</p></div></div>
      ${body}
    </div>`;
}

export function guideView(state) {
  const g = state.guide;
  const tip = g.tip;
  const steps = tip.tip_steps;
  const step = steps[g.stepIndex];
  const total = steps.length;
  const pct = Math.round(((g.stepIndex + 1) / total) * 100);
  const yourTurn = step.step_type === 'your_turn';

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
      <div class="prog"><div class="bar"><i style="width:${pct}%"></i></div><span>Step ${g.stepIndex + 1} of ${total}${yourTurn ? ' &middot; Your turn' : ''}</span></div>
    </div>
    ${offtrackBanner(g, step)}
    ${introCard(g)}
    ${liveLine(state, g, step)}
    <ol class="steps">${steps.map((s, i) => stepItem(g, s, i)).join('')}</ol>
    ${yourTurn ? yourTurnCard(step) : ''}
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
      <div class="prog"><div class="bar"><i style="width:100%"></i></div><span>Complete</span></div>
    </div>
    <div class="win"><span class="win-ic">${CHECK}</span><h4>Nice work!</h4><p>You finished every step of &ldquo;${esc(tip.title)}&rdquo;.</p></div>
    <div class="fb">${card}</div>
    <button type="button" class="more" data-action="back-to-tips">Back to tips &rarr;</button>`;
}

// The database needs a thumbs choice or some text.
export function canSubmitFeedback(f) {
  return f.isHelpful !== null || f.reasons.length > 0 || f.text.trim() !== '';
}
