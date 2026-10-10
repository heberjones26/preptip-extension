// PrepTip "Download for Slides" button on YouTube watch pages (R8-R10). Classic content script,
// isolated world. Restriction status comes from src/content/youtube-main.js (MAIN world) via
// window.postMessage.
//
// Product decision: PrepTip does NOT download YouTube video files (that breaks YouTube's Terms of
// Service and gets extensions pulled from the Chrome Web Store). For playable videos the button
// shows how to put the video into Google Slides by URL instead. For restricted videos it shows the
// exact R10 error.
//
// DOM is built with createElement only: YouTube enforces Trusted Types, so no innerHTML.
(() => {
  'use strict';
  if (window.__preptipYt) return;
  window.__preptipYt = true;

  const ROOT_ID = 'preptip-yt-root';
  const RESTRICTED_TEXT = 'Video cannot be downloaded due to restrictions.';
  const VIDEO_ID_RE = /^[A-Za-z0-9_-]{6,20}$/;

  /** Latest restriction info from the MAIN world, keyed by videoId. */
  const infoById = new Map();
  const waiters = new Set();

  // ---------------------------------------------------------------------------------------------
  // Messages from youtube-main.js
  // ---------------------------------------------------------------------------------------------
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const d = event.data;
    if (!d || typeof d !== 'object' || d.source !== 'preptip-yt') return;
    if (typeof d.videoId !== 'string' || !VIDEO_ID_RE.test(d.videoId)) return;

    const info = {
      videoId: d.videoId,
      title: typeof d.title === 'string' ? d.title : '',
      playability: typeof d.playability === 'string' ? d.playability : 'UNKNOWN',
      reason: typeof d.reason === 'string' ? d.reason : '',
      isPrivate: d.isPrivate === true,
      ageRestricted: d.ageRestricted === true,
      isLive: d.isLive === true,
      known: d.known !== false && d.playability !== 'UNKNOWN'
    };
    const prev = infoById.get(info.videoId);
    if (!prev || info.known || !prev.known) infoById.set(info.videoId, info);
    for (const w of [...waiters]) w(info);
  });

  function requestInfo() {
    window.postMessage({ source: 'preptip-yt-request' }, location.origin);
  }

  function waitForInfo(videoId, ms) {
    const have = infoById.get(videoId);
    if (have && have.known) return Promise.resolve(have);
    return new Promise((resolve) => {
      const done = (val) => { waiters.delete(onInfo); clearTimeout(t); resolve(val); };
      const onInfo = (info) => { if (info.videoId === videoId && info.known) done(info); };
      const t = setTimeout(() => done(infoById.get(videoId) || null), ms);
      waiters.add(onInfo);
      requestInfo();
    });
  }

  function isRestricted(info) {
    if (!info || !info.known) return false; // unknown: don't claim a restriction we can't see
    if (info.isPrivate || info.ageRestricted) return true;
    return info.playability !== 'OK' && !info.isLive;
  }

  // ---------------------------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------------------------
  function currentVideoId() {
    if (location.pathname !== '/watch') return null;
    const v = new URLSearchParams(location.search).get('v');
    return v && VIDEO_ID_RE.test(v) ? v : null;
  }

  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of children.flat()) if (c != null) el.append(c);
    return el;
  }

  function svg(viewBox, parts, cls) {
    const NS = 'http://www.w3.org/2000/svg';
    const root = document.createElementNS(NS, 'svg');
    root.setAttribute('viewBox', viewBox);
    root.setAttribute('aria-hidden', 'true');
    if (cls) root.setAttribute('class', cls);
    for (const [tag, attrs] of parts) {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      root.append(el);
    }
    return root;
  }

  // The PrepTip lightbulb mark (same as the side panel rail logo), inverted for the orange button.
  function logo() {
    return svg('0 0 24 24', [
      ['rect', { width: '24', height: '24', rx: '6', fill: '#fff' }],
      ['path', { d: 'M12 4.6a5.4 5.4 0 0 0-3.2 9.75c.5.37.8.93.8 1.55v.6h4.8v-.6c0-.62.3-1.18.8-1.55A5.4 5.4 0 0 0 12 4.6Z', fill: '#E8590C' }],
      ['rect', { x: '9.6', y: '17.4', width: '4.8', height: '1.6', rx: '.8', fill: '#E8590C' }],
      ['path', { d: 'M12 8.2v3.4M10.6 10.4h2.8', stroke: '#fff', 'stroke-width': '1.3', 'stroke-linecap': 'round' }]
    ], 'preptip-yt-logo');
  }

  function currentSeconds() {
    const v = document.querySelector('#movie_player video') || document.querySelector('video');
    const t = v && Number.isFinite(v.currentTime) ? Math.floor(v.currentTime) : 0;
    return t;
  }

  function formatTime(s) {
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
  }

  function shareLink(videoId, withTime) {
    let url = `https://youtu.be/${videoId}`;
    if (withTime) {
      const t = currentSeconds();
      if (t > 5) url += `?t=${t}`;
    }
    return url;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for pages/browsers where the async clipboard is blocked.
      const ta = h('textarea', { class: 'preptip-yt-offscreen', readonly: true });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------------------------
  function closeButton(onClose) {
    return h('button', { type: 'button', class: 'preptip-yt-close', 'aria-label': 'Close', title: 'Close', onclick: onClose }, '×');
  }

  function clearPanel(root) {
    root.querySelector('.preptip-yt-panel')?.remove();
    root.querySelector('.preptip-yt-btn')?.setAttribute('aria-expanded', 'false');
  }

  function showError(root) {
    clearPanel(root);
    const card = h('div', { class: 'preptip-yt-panel preptip-yt-error', role: 'alert' },
      svg('0 0 24 24', [
        ['path', { d: 'M10.3 3.9 1.9 18.1A2 2 0 0 0 3.6 21h16.8a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z', fill: 'currentColor' }],
        ['path', { d: 'M12 9v4.6', stroke: '#fff', 'stroke-width': '2.2', 'stroke-linecap': 'round' }],
        ['circle', { cx: '12', cy: '17.2', r: '1.3', fill: '#fff' }]
      ], 'preptip-yt-error-icon'),
      h('p', { class: 'preptip-yt-error-text', text: RESTRICTED_TEXT }),
      closeButton(() => clearPanel(root))
    );
    root.append(card);
    root.querySelector('.preptip-yt-btn')?.setAttribute('aria-expanded', 'true');
  }

  function showSlidesCard(root, videoId) {
    clearPanel(root);
    const t = currentSeconds();
    const hasTime = t > 5;

    const status = h('span', { class: 'preptip-yt-copied', role: 'status', 'aria-live': 'polite' });
    let statusTimer = null;
    const flash = (msg, ok) => {
      status.textContent = msg;
      status.classList.toggle('preptip-yt-fail', !ok);
      status.classList.add('preptip-yt-show');
      clearTimeout(statusTimer);
      statusTimer = setTimeout(() => status.classList.remove('preptip-yt-show'), 1800);
    };
    const copy = (withTime) => async () => {
      const ok = await copyText(shareLink(videoId, withTime));
      flash(ok ? 'Copied!' : 'Copy failed. Copy the link from the address bar instead.', ok);
    };

    const card = h('div', { class: 'preptip-yt-panel preptip-yt-card', role: 'dialog', 'aria-label': 'Use this video in Google Slides' },
      h('div', { class: 'preptip-yt-card-head' },
        h('h3', { class: 'preptip-yt-card-title', text: 'Use this video in Google Slides' }),
        closeButton(() => clearPanel(root))
      ),
      h('p', { class: 'preptip-yt-card-body', text: "PrepTip can't save YouTube files (YouTube doesn't allow it), but Slides can play this video right in your presentation, with no download needed." }),
      h('ol', { class: 'preptip-yt-steps' },
        h('li', null, h('span', null, h('b', { text: 'Copy link' }), hasTime ? ` (starts at ${formatTime(t)})` : '')),
        h('li', null, h('span', null, 'In Slides: ', h('b', { text: 'Insert → Video → By URL' }))),
        h('li', null, h('span', null, 'Paste and click ', h('b', { text: 'Select' })))
      ),
      h('div', { class: 'preptip-yt-actions' },
        h('button', { type: 'button', class: 'preptip-yt-copy', onclick: copy(true) }, 'Copy link'),
        hasTime ? h('button', { type: 'button', class: 'preptip-yt-copy-plain', onclick: copy(false) }, 'Copy link without timestamp') : null,
        status
      )
    );
    root.append(card);
    root.querySelector('.preptip-yt-btn')?.setAttribute('aria-expanded', 'true');
  }

  async function onButtonClick(event) {
    const root = event.currentTarget.closest(`#${ROOT_ID}`);
    const videoId = currentVideoId();
    if (!root || !videoId) return;

    // Second click closes whatever is open.
    if (root.querySelector('.preptip-yt-panel')) { clearPanel(root); return; }

    const info = await waitForInfo(videoId, 1500);
    if (currentVideoId() !== videoId || !root.isConnected) return;
    if (isRestricted(info)) showError(root);
    else showSlidesCard(root, videoId);
  }

  function buildRoot(videoId) {
    return h('div', { id: ROOT_ID, class: 'preptip-yt-root', 'data-video-id': videoId },
      h('button', {
        type: 'button',
        class: 'preptip-yt-btn',
        'aria-expanded': 'false',
        title: 'PrepTip: use this video in Google Slides',
        onclick: onButtonClick
      }, logo(), h('span', { text: 'Download for Slides' }))
    );
  }

  // Where the button goes: first child of #below (directly under the player), or before #title
  // inside ytd-watch-metadata. YouTube reuses ids, so prefer the one that is actually rendered.
  function findAnchor() {
    const visible = (el) => el && el.isConnected && el.getClientRects().length > 0;
    const belows = [...document.querySelectorAll('ytd-watch-flexy #below, ytd-watch-grid #below, #below')];
    const below = belows.find(visible);
    if (below) return { parent: below, before: below.firstChild };
    const titles = [...document.querySelectorAll('ytd-watch-metadata #title')];
    const title = titles.find(visible) || titles[0];
    if (title && title.parentNode) return { parent: title.parentNode, before: title };
    return null;
  }

  function removeUi() {
    document.getElementById(ROOT_ID)?.remove();
  }

  function ensureButton() {
    const videoId = currentVideoId();
    if (!videoId) { removeUi(); return; }

    let root = document.getElementById(ROOT_ID);
    if (root && root.dataset.videoId !== videoId) {
      // New video in the same page (SPA): reset the card, keep the button.
      clearPanel(root);
      root.dataset.videoId = videoId;
    }
    const anchor = findAnchor();
    if (!anchor) return; // not rendered yet; the observer will call us again

    // Already in the right place?
    if (root && root.parentNode === anchor.parent) return;
    if (!root) root = buildRoot(videoId);
    anchor.parent.insertBefore(root, anchor.before === root ? root.nextSibling : anchor.before);
  }

  // ---------------------------------------------------------------------------------------------
  // SPA wiring
  // ---------------------------------------------------------------------------------------------
  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    // setTimeout, not requestAnimationFrame: rAF is paused in background tabs.
    setTimeout(() => { scheduled = false; ensureButton(); }, 60);
  }

  let lastHref = location.href;
  function onNavigate() {
    if (location.href !== lastHref) lastHref = location.href;
    schedule();
    if (currentVideoId()) requestInfo();
  }

  new MutationObserver(() => {
    if (location.href !== lastHref) { onNavigate(); return; }
    // Cheap check: only do work when the button is missing on a watch page.
    if (currentVideoId() && !document.getElementById(ROOT_ID)?.isConnected) schedule();
    else if (!currentVideoId() && document.getElementById(ROOT_ID)) schedule();
  }).observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('yt-navigate-finish', onNavigate);
  window.addEventListener('popstate', onNavigate);

  onNavigate();
})();
