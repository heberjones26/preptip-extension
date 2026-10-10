/*
 * PrepTip on-page guide (content script).
 *
 * What it does on the teacher's page:
 *   - Draws an orange pulsing ring, a guide cursor and a dark "coach" tooltip on the
 *     element the current tip step points at (Screens 3, 4, 4A, 5).
 *   - Watches the teacher's clicks: reports when they click the right thing
 *     (PT_GUIDE_STEP_DONE) or open the wrong top-level menu (PT_GUIDE_OFFTRACK).
 *   - Shows the small "N teacher tips are ready" nudge card the first time a teacher
 *     visits a supported site (Screen 1).
 *
 * This is a CLASSIC script (content scripts can't use `import`), so the message
 * strings below are copied from src/lib/protocol.js and parseTarget() is copied from
 * src/lib/sites.js. See docs/ARCHITECTURE.md for the full contract.
 *
 * Everything we draw lives inside ONE <preptip-root> element with a shadow root,
 * so the page's CSS can't break our overlay and our CSS can't leak into the page.
 * The overlay never blocks clicks (pointer-events: none), except the nudge card.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 0. Run once per page (the side panel may inject this file again)
  // ---------------------------------------------------------------------------

  if (window.top !== window) return; // top frame only

  const previous = window.__preptipGuide;
  if (previous && previous.isAlive()) return; // already running and healthy
  if (previous) previous.destroy();           // a leftover copy from a reloaded extension

  // ---------------------------------------------------------------------------
  // 1. Constants (copied from src/lib/protocol.js)
  // ---------------------------------------------------------------------------

  const MSG = {
    PING: 'PT_PING',
    GUIDE_SHOW: 'PT_GUIDE_SHOW',
    GUIDE_CLEAR: 'PT_GUIDE_CLEAR',
    GUIDE_STATUS: 'PT_GUIDE_STATUS',
    GUIDE_STEP_DONE: 'PT_GUIDE_STEP_DONE',
    GUIDE_OFFTRACK: 'PT_GUIDE_OFFTRACK',
    GUIDE_BACK_ON_TRACK: 'PT_GUIDE_BACK_ON_TRACK',
    GET_SITE_INFO: 'PT_GET_SITE_INFO',
    NUDGE_DISMISSED: 'PT_NUDGE_DISMISSED',
    OPEN_PANEL: 'PT_OPEN_PANEL'
  };

  const POLL_MS = 300;              // re-find the target this often (menus open dynamically)
  const MUTATION_THROTTLE_MS = 120; // at most one re-find per this many ms after DOM changes
  const NUDGE_AUTO_HIDE_MS = 20000; // nudge disappears on its own (not recorded as dismissed)
  const NUDGE_FALLBACK_MS = 6000;   // how long "Click the PrepTip icon..." stays up
  const RING_PAD = 3;               // px of space between the target and the ring

  // CSS selectors for each kind of thing a step can point at.
  const SEL = {
    menubarItem: '[role="menubar"] [role="menuitem"]',
    menuItem: '[role="menu"] [role="menuitem"], [role="menu"] [role="menuitemcheckbox"], ' +
              '[role="menu"] [role="menuitemradio"], .goog-menuitem',
    button: 'button, [role="button"], a, input[type="button"], input[type="submit"]',
    link: 'a, [role="link"]',
    // "Anything you can click": used for the 2nd+ segment of button/link paths.
    clickable: 'button, [role="button"], a, [role="link"], [role="menuitem"], [role="menuitemcheckbox"], ' +
               '[role="menuitemradio"], [role="checkbox"], [role="switch"], [role="tab"], [role="option"], ' +
               'label, input[type="checkbox"], input[type="radio"], .goog-menuitem',
    search: 'input[type="search"], input[role="combobox"], [role="searchbox"], [role="search"] input, ' +
            'input[type="text"], input:not([type])',
    container: '[role="dialog"], [role="alertdialog"], [role="complementary"], [role="region"], dialog[open]',
    heading: 'h1, h2, h3, h4, h5, h6, [role="heading"], [class*="title"]'
  };

  // ---------------------------------------------------------------------------
  // 2. Small helpers
  // ---------------------------------------------------------------------------

  // "menu:Format > Conditional formatting" -> { kind: 'menu', path: ['Format', 'Conditional formatting'] }
  // (copied from parseTarget in src/lib/sites.js)
  function parseTarget(target) {
    if (!target) return { kind: null, path: [] };
    const i = target.indexOf(':');
    if (i === -1) return { kind: target.trim(), path: [] };
    return {
      kind: target.slice(0, i).trim(),
      path: target.slice(i + 1).split('>').map((s) => s.trim()).filter(Boolean)
    };
  }

  const collapse = (s) => (s || '').replace(/\s+/g, ' ').trim();

  // How well does `text` match the path segment? 2 = exact, 1 = starts with it, 0 = no.
  // "Share. Private to only me." starts with "Share" (OK), but "Shared drives" does not
  // (the next letter is lowercase). Case-insensitive.
  function compareText(text, segment) {
    const t = collapse(text);
    const s = collapse(segment);
    if (!t || !s) return 0;
    const tl = t.toLowerCase();
    const sl = s.toLowerCase();
    if (tl === sl) return 2;
    if (tl.startsWith(sl) && !/[a-z0-9]/.test(t.charAt(s.length))) return 1;
    return 0;
  }

  // All the names an element might go by: Google menu label, aria-label, tooltip, text...
  function namesOf(el) {
    const names = [];
    const googLabel = el.querySelector && el.querySelector('.goog-menuitem-label');
    if (googLabel) names.push(googLabel.textContent);
    for (const attr of ['aria-label', 'data-tooltip', 'title']) {
      const v = el.getAttribute(attr);
      if (v) names.push(v);
    }
    if (el.tagName === 'INPUT' && el.value) names.push(el.value);
    if (el.labels) for (const l of el.labels) names.push(l.textContent);
    names.push(el.textContent);
    return names;
  }

  function textScore(el, segment) {
    let best = 0;
    for (const name of namesOf(el)) {
      best = Math.max(best, compareText(name, segment));
      if (best === 2) break;
    }
    return best;
  }

  // Short readable label for an element (used for the "clicked" field of OFFTRACK).
  function displayName(el) {
    const googLabel = el.querySelector && el.querySelector('.goog-menuitem-label');
    const text = collapse(googLabel ? googLabel.textContent : el.textContent) ||
                 collapse(el.getAttribute('aria-label'));
    return text.length > 40 ? text.slice(0, 39) + '…' : text;
  }

  // Visible = attached, has a size, at least partly inside the viewport, not visibility:hidden.
  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    if (r.bottom <= 0 || r.right <= 0 || r.top >= window.innerHeight || r.left >= window.innerWidth) return false;
    return getComputedStyle(el).visibility !== 'hidden';
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function firstSentence(text, maxLen) {
    const t = collapse(text);
    const sentence = (t.match(/^.*?[.!?](?=\s|$)/) || [t])[0];
    return sentence.length > maxLen ? sentence.slice(0, maxLen - 1).trimEnd() + '…' : sentence;
  }

  // ---------------------------------------------------------------------------
  // 3. Talking to the extension (side panel / background)
  // ---------------------------------------------------------------------------

  // After the extension is reloaded, this old copy of the script is "orphaned":
  // chrome.runtime.id disappears and every call throws "Extension context invalidated".
  function contextAlive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  // Send a message and resolve with the response, or null if nobody answered
  // (panel closed, background not loaded...). Never throws.
  function send(message) {
    return new Promise((resolve) => {
      if (!contextAlive()) {
        destroy();
        resolve(null);
        return;
      }
      try {
        chrome.runtime.sendMessage(message, (response) => {
          // Reading lastError tells Chrome we handled "Receiving end does not exist".
          const err = chrome.runtime.lastError;
          resolve(err || response === undefined ? null : response);
        });
      } catch (e) {
        if (/context invalidated/i.test(String(e && e.message))) destroy();
        resolve(null);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 4. Finding the target element on the page
  // ---------------------------------------------------------------------------

  // Best visible element among `selector` whose name matches `segment` (exact beats prefix).
  function findByText(selector, segment, filter) {
    let best = null;
    let bestScore = 0;
    for (const el of document.querySelectorAll(selector)) {
      if (filter && !filter(el)) continue;
      const score = textScore(el, segment); // cheap check first...
      if (score <= bestScore) continue;
      if (!isVisible(el)) continue;         // ...then the layout check
      best = el;
      bestScore = score;
      if (score === 2) break;
    }
    return best;
  }

  const notInMenubar = (el) => !el.closest('[role="menubar"]');
  const pageHasMenubar = () => !!document.querySelector('[role="menubar"]');

  // Which elements count as segment `index` of a path of this kind?
  // Returns { selector, filter } or null when the kind isn't supported.
  function segmentSpec(kind, index) {
    switch (kind) {
      case 'menu':
        // Google Workspace menus: top level lives in the menubar, the rest in open [role=menu] lists.
        // Other sites without a menubar: fall back to "anything clickable".
        if (!pageHasMenubar()) return { selector: SEL.clickable };
        return index === 0
          ? { selector: SEL.menubarItem }
          : { selector: SEL.menuItem, filter: notInMenubar };
      case 'button':
        return { selector: index === 0 ? SEL.button : SEL.clickable };
      case 'link':
        return { selector: index === 0 ? SEL.link : SEL.clickable };
      case 'panel':
      case 'dialog':
        return index === 0 ? null : { selector: SEL.clickable }; // index 0 = the container itself
      default:
        return null;
    }
  }

  // A dialog / sidebar whose aria-label or heading contains the hint
  // (e.g. "Conditional format rules").
  function findContainer(hint) {
    const want = collapse(hint).toLowerCase();
    if (!want) return null;
    const has = (text) => collapse(text).toLowerCase().includes(want);

    let best = null;
    let bestArea = Infinity;
    for (const el of document.querySelectorAll(SEL.container)) {
      if (!isVisible(el)) continue;
      let name = el.getAttribute('aria-label') || '';
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        for (const id of labelledBy.split(/\s+/)) {
          const ref = document.getElementById(id);
          if (ref) name += ' ' + ref.textContent;
        }
      }
      const heading = el.querySelector(SEL.heading);
      if (heading) name += ' ' + heading.textContent;
      if (!has(name)) continue;
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      if (area < bestArea) { best = el; bestArea = area; } // innermost match wins
    }
    if (best) return best;

    // Fallback: a visible heading/title with that text; highlight its panel-ish ancestor.
    for (const h of document.querySelectorAll(SEL.heading)) {
      const text = collapse(h.textContent);
      if (!has(text) || text.length > want.length + 40 || !isVisible(h)) continue;
      const panel = h.closest(SEL.container + ', aside, dialog, [class*="sidebar"], [class*="dialog"], [class*="panel"]');
      return panel && isVisible(panel) ? panel : h;
    }
    return null;
  }

  // A visible search box. `hint` is the path text, e.g. "Search for templates".
  function findSearch(hint) {
    const want = collapse(hint).toLowerCase();
    let best = null;
    let bestScore = 0;
    for (const el of document.querySelectorAll(SEL.search)) {
      if (el.disabled) continue;
      const meta = [el.getAttribute('placeholder'), el.getAttribute('aria-label'), el.getAttribute('title'),
                    el.getAttribute('name'), el.id].join(' ').toLowerCase();
      let score = 0;
      if (want && meta.includes(want)) score += 3;
      if (meta.includes('search')) score += 2;
      if (el.type === 'search' || el.getAttribute('role') === 'searchbox' || el.closest('[role="search"]')) score += 2;
      if (score < 2 || score <= bestScore || !isVisible(el)) continue;
      best = el;
      bestScore = score;
    }
    return best;
  }

  function findSegment(kind, index, segment) {
    if ((kind === 'panel' || kind === 'dialog') && index === 0) return findContainer(segment);
    const spec = segmentSpec(kind, index);
    return spec ? findByText(spec.selector, segment, spec.filter) : null;
  }

  // For path [A, B, C]: highlight the DEEPEST segment that is visible right now.
  // Menu closed -> A (the menubar item). Menu open -> B. Submenu open -> C.
  // Returns { el, index } or null. Kinds we don't support (grid, cell, editor...) -> null.
  function findTarget(kind, path) {
    if (kind === 'search') {
      const el = findSearch(path.join(' '));
      return el ? { el, index: 0 } : null;
    }
    if (!['menu', 'button', 'link', 'panel', 'dialog'].includes(kind) || !path.length) return null;
    for (let i = path.length - 1; i >= 0; i--) {
      const el = findSegment(kind, i, path[i]);
      if (el) return { el, index: i };
    }
    return null;
  }

  // Did this click land on (or inside) path segment `index`? `eventPath` comes from composedPath().
  function clickHitsSegment(eventPath, index) {
    const { kind, path } = guide;
    if (kind === 'search' || ((kind === 'panel' || kind === 'dialog') && index === 0)) {
      const el = kind === 'search' ? findSearch(path.join(' ')) : findContainer(path[0]);
      return !!el && eventPath.includes(el);
    }
    const spec = segmentSpec(kind, index);
    if (!spec) return false;
    return eventPath.some((node) =>
      node.nodeType === 1 &&
      node.matches(spec.selector) &&
      (!spec.filter || spec.filter(node)) &&
      textScore(node, path[index]) > 0
    );
  }

  // ---------------------------------------------------------------------------
  // 5. The overlay (ring, cursor, coach tooltip, nudge) inside a shadow root
  // ---------------------------------------------------------------------------

  // Icons are built with createElementNS instead of innerHTML, because some pages
  // (Google Docs/Sheets) enforce Trusted Types, which forbids assigning HTML strings.
  const CURSOR_ICON = ['0 0 28 28', [
    ['path', { d: 'M5 3l17 10.2-7.6 1.6 4.6 8.4-3.3 1.8-4.6-8.4L5 22z', fill: '#E8590C', stroke: '#fff',
               'stroke-width': '1.8', 'stroke-linejoin': 'round' }]
  ]];

  const LOGO_ICON = ['0 0 24 24', [
    ['rect', { width: '24', height: '24', rx: '6', fill: '#E8590C' }],
    ['path', { d: 'M12 4.6a5.4 5.4 0 0 0-3.2 9.75c.5.37.8.93.8 1.55v.6h4.8v-.6c0-.62.3-1.18.8-1.55A5.4 5.4 0 0 0 12 4.6Z', fill: '#fff' }],
    ['rect', { x: '9.6', y: '17.4', width: '4.8', height: '1.6', rx: '.8', fill: '#fff' }],
    ['path', { d: 'M12 8.2v3.4M10.6 10.4h2.8', stroke: '#E8590C', 'stroke-width': '1.3', 'stroke-linecap': 'round' }]
  ]];

  function svgIcon([viewBox, shapes]) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('aria-hidden', 'true');
    for (const [tag, attrs] of shapes) {
      const shape = document.createElementNS(NS, tag);
      for (const name in attrs) shape.setAttribute(name, attrs[name]);
      svg.appendChild(shape);
    }
    return svg;
  }

  // Colors and shapes copied from docs/mockup/preptip-mockup.html.
  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .layer {
      --brand: #E8590C; --brand-dk: #C2410C; --brand-soft: #FFF1E7; --brand-ring: rgba(232, 89, 12, .38);
      --ink: #1E2433; --ink-2: #4A5468; --ink-3: #7A8396;
      position: fixed; top: 0; left: 0; width: 0; height: 0;
      font-family: "Nunito", "Segoe UI", system-ui, sans-serif;
      pointer-events: none;
    }
    [hidden] { display: none !important; }

    /* Orange pulsing ring around the target */
    .ring {
      position: fixed; border-radius: 6px; pointer-events: none;
      box-shadow: 0 0 0 2px var(--brand);
      animation: ring 1.8s ease-out infinite;
    }
    .ring.fill { background: rgba(232, 89, 12, .10); }
    .ring.recover { box-shadow: 0 0 0 3px var(--brand); animation-duration: 1.1s; }
    @keyframes ring {
      0% { box-shadow: 0 0 0 2px var(--brand), 0 0 0 2px var(--brand-ring); }
      80%, 100% { box-shadow: 0 0 0 2px var(--brand), 0 0 0 12px rgba(232, 89, 12, 0); }
    }

    /* Guide cursor with a tap ripple */
    .cursor {
      position: fixed; width: 28px; height: 28px; pointer-events: none;
      filter: drop-shadow(0 2px 3px rgba(0, 0, 0, .25));
    }
    .cursor svg { display: block; width: 28px; height: 28px; }
    .cursor::before {
      content: ""; position: absolute; left: -9px; top: -9px; width: 22px; height: 22px; border-radius: 50%;
      border: 2px solid var(--brand); animation: tap 1.8s ease-out infinite;
    }
    @keyframes tap { 0% { transform: scale(.4); opacity: 1; } 100% { transform: scale(1.6); opacity: 0; } }

    /* Dark coach tooltip */
    .coach {
      position: fixed; width: max-content; max-width: 240px; pointer-events: none;
      background: var(--ink); color: #fff; font: 600 13px/1.35 "Nunito", "Segoe UI", system-ui, sans-serif;
      padding: 8px 12px; border-radius: 10px; box-shadow: 0 8px 20px rgba(0, 0, 0, .2);
    }
    .coach small {
      display: block; color: #FDBA74; font-size: 11px; font-weight: 800;
      text-transform: uppercase; letter-spacing: .04em;
    }
    .coach b { font-weight: 800; }
    .coach::before {
      content: ""; position: absolute; width: 10px; height: 10px; background: var(--ink); transform: rotate(45deg);
    }
    .coach.below::before { top: -5px; left: var(--arrow, 18px); }
    .coach.above::before { bottom: -5px; left: var(--arrow, 18px); }
    .coach.right::before { left: -5px; top: var(--arrow, 12px); }
    .coach.left::before  { right: -5px; top: var(--arrow, 12px); }

    /* Screen 1 nudge card (top-right, pointing up at the toolbar) */
    .nudge {
      position: fixed; top: 10px; right: 16px; width: 270px; pointer-events: auto;
      background: #fff; border-radius: 14px; padding: 14px; color: var(--ink);
      font: 14px/1.4 "Nunito", "Segoe UI", system-ui, sans-serif;
      box-shadow: 0 10px 30px rgba(30, 36, 51, .22), 0 0 0 1px rgba(30, 36, 51, .06);
      animation: pop .2s ease-out;
    }
    .nudge::before {
      content: ""; position: absolute; top: -7px; right: 24px; width: 14px; height: 14px;
      background: #fff; transform: rotate(45deg); box-shadow: -1px -1px 0 rgba(30, 36, 51, .06);
    }
    @keyframes pop { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
    .nudge-top { display: flex; align-items: center; gap: 8px; font-size: 14px; }
    .nudge-top svg { display: block; width: 20px; height: 20px; }
    .nudge-x {
      margin-left: auto; border: 0; background: none; cursor: pointer; padding: 0 2px;
      color: var(--ink-3); font-family: inherit; font-size: 18px; line-height: 1;
    }
    .nudge-x:hover { color: var(--ink); }
    .nudge p { margin: 8px 0 12px; font-size: 14px; line-height: 1.4; color: var(--ink-2); }
    .nudge p b { color: var(--ink); }
    .nudge-row { display: flex; gap: 8px; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
      font: 700 13px/1.2 "Nunito", "Segoe UI", system-ui, sans-serif;
      border-radius: 10px; padding: 7px 13px; border: 1.5px solid transparent;
    }
    .btn.primary { background: var(--brand); color: #fff; }
    .btn.primary:hover { background: var(--brand-dk); }
    .btn.ghost { color: var(--ink-2); background: #F1F3F6; }
    .btn.ghost:hover { background: #E4E7EC; }
    .btn:focus-visible, .nudge-x:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }

    @media (prefers-reduced-motion: reduce) {
      .ring, .ring.recover { animation: none; box-shadow: 0 0 0 3px var(--brand), 0 0 0 7px var(--brand-ring); }
      .cursor::before { animation: none; opacity: .6; }
      .nudge { animation: none; }
    }
  `;

  // All our DOM, created lazily.
  const ui = { host: null, layer: null, ring: null, cursor: null, coach: null, nudge: null };

  function ensureHost() {
    if (ui.host) {
      if (!ui.host.isConnected) document.documentElement.appendChild(ui.host); // page removed it
      return;
    }
    // Remove a stray host left behind by an older copy of this script.
    document.querySelectorAll('preptip-root').forEach((el) => el.remove());

    const host = document.createElement('preptip-root');
    // Inline !important beats any page rule, so the page can't hide or move us.
    host.setAttribute('style', [
      'all: initial !important', 'display: block !important', 'position: fixed !important',
      'top: 0 !important', 'left: 0 !important', 'width: 0 !important', 'height: 0 !important',
      'z-index: 2147483647 !important', 'pointer-events: none !important'
    ].join(';'));
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    const layer = document.createElement('div');
    layer.className = 'layer';
    root.append(style, layer);

    ui.ring = el('div', 'ring');
    ui.cursor = el('div', 'cursor');
    ui.cursor.appendChild(svgIcon(CURSOR_ICON));
    ui.coach = el('div', 'coach');
    ui.coach.setAttribute('role', 'status');
    for (const part of [ui.ring, ui.cursor, ui.coach]) {
      part.hidden = true;
      layer.appendChild(part);
    }
    ui.host = host;
    ui.layer = layer;
    document.documentElement.appendChild(host);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function removeHostIfEmpty() {
    if (ui.host && !guide && !ui.nudge) {
      ui.host.remove();
      Object.keys(ui).forEach((k) => { ui[k] = null; });
    }
  }

  function hideOverlay() {
    if (!ui.ring) return;
    ui.ring.hidden = ui.cursor.hidden = ui.coach.hidden = true;
  }

  // ---------------------------------------------------------------------------
  // 6. Guide state and lifecycle
  // ---------------------------------------------------------------------------

  // The step being guided right now, or null.
  let guide = null;
  let pollTimer = 0;
  let mutationTimer = 0;
  let observer = null;
  let rafId = 0;
  let lastLayoutKey = '';

  function startGuide(message) {
    stopGuide();
    const step = message.step || {};
    const { kind, path } = parseTarget(step.target_element);
    guide = {
      tipId: message.tipId,
      stepIndex: message.stepIndex,
      totalSteps: message.totalSteps,
      stepType: step.step_type === 'your_turn' ? 'your_turn' : 'guided',
      description: step.step_description || '',
      kind: (kind || '').toLowerCase(),
      path,
      target: null,      // element highlighted now
      targetIndex: -1,   // which path segment it is
      done: false,       // STEP_DONE already sent
      offTrack: false,
      offTrackClicked: null,
      lastStatusKey: null
    };

    pollTimer = setInterval(resolveNow, POLL_MS);
    observer = new MutationObserver(onMutation);
    observer.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'open', 'aria-hidden', 'aria-expanded']
    });
    for (const type of ['pointerdown', 'mousedown', 'click']) document.addEventListener(type, onPointer, true);
    window.addEventListener('scroll', onScrollOrResize, { capture: true, passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });

    resolveNow(); // sends the first PT_GUIDE_STATUS right away
  }

  function stopGuide() {
    guide = null;
    clearInterval(pollTimer);
    clearTimeout(mutationTimer);
    pollTimer = mutationTimer = 0;
    if (observer) observer.disconnect();
    observer = null;
    for (const type of ['pointerdown', 'mousedown', 'click']) document.removeEventListener(type, onPointer, true);
    window.removeEventListener('scroll', onScrollOrResize, { capture: true });
    window.removeEventListener('resize', onScrollOrResize);
    cancelAnimationFrame(rafId);
    rafId = 0;
    lastLayoutKey = '';
    hideOverlay();
    removeHostIfEmpty();
  }

  function onMutation() {
    if (mutationTimer) return; // throttle: Google Sheets changes the DOM constantly
    mutationTimer = setTimeout(() => { mutationTimer = 0; resolveNow(); }, MUTATION_THROTTLE_MS);
  }

  function onScrollOrResize() {
    onMutation(); // something may have scrolled into or out of view
  }

  // Find the target again, update status, redraw.
  function resolveNow() {
    if (!guide || guide.done) return;
    if (!contextAlive()) { destroy(); return; }

    const hit = findTarget(guide.kind, guide.path);
    guide.target = hit ? hit.el : null;
    guide.targetIndex = hit ? hit.index : -1;

    // Off-track recovery: the right menu is open again (we can see segment B or deeper).
    if (guide.offTrack && hit && hit.index >= 1) backOnTrack();

    reportStatus();
    render();
  }

  function currentLabel() {
    if (!guide.target) return null;
    if (guide.kind === 'search') return guide.path.join(' ') || 'Search';
    return guide.path[guide.targetIndex] || null;
  }

  // PT_GUIDE_STATUS only when "found" or the label changes.
  function reportStatus() {
    const found = !!guide.target;
    const label = currentLabel();
    const key = found + '|' + label;
    if (key === guide.lastStatusKey) return;
    guide.lastStatusKey = key;
    send({ type: MSG.GUIDE_STATUS, tipId: guide.tipId, stepIndex: guide.stepIndex, found, label });
  }

  // ---------------------------------------------------------------------------
  // 7. Click tracking (guided steps only)
  // ---------------------------------------------------------------------------

  // One click fires pointerdown + mousedown + click. The state flags (done, offTrack)
  // make sure each message is sent only once, so we can listen to all three.
  function onPointer(event) {
    if (!guide || guide.done || guide.stepType !== 'guided' || !guide.path.length) return;
    const eventPath = event.composedPath ? event.composedPath() : [];
    if (ui.host && eventPath.includes(ui.host)) return; // a click on our own nudge

    // Clicked the LAST segment -> step done.
    if (clickHitsSegment(eventPath, guide.path.length - 1)) {
      stepDone();
      return;
    }

    // Clicked a top-level menu: the right one (back on track) or a different one (off track).
    if (guide.kind === 'menu') checkMenubarClick(eventPath);

    // Intermediate segments (e.g. the Format menubar item) need nothing: the menu that
    // opens is picked up by the next re-find. Re-find soon so the ring moves quickly.
    onMutation();
  }

  function checkMenubarClick(eventPath) {
    const item = eventPath.find((n) => n.nodeType === 1 && n.matches(SEL.menubarItem));
    if (!item) return;

    if (textScore(item, guide.path[0]) > 0) {
      if (guide.offTrack) backOnTrack();
      return;
    }
    const clicked = displayName(item);
    if (guide.offTrack && guide.offTrackClicked === clicked) return; // same mistake, already reported
    guide.offTrack = true;
    guide.offTrackClicked = clicked;
    send({ type: MSG.GUIDE_OFFTRACK, tipId: guide.tipId, stepIndex: guide.stepIndex, clicked, expected: guide.path[0] });
    lastLayoutKey = '';
    render();
  }

  function backOnTrack() {
    if (!guide.offTrack) return;
    guide.offTrack = false;
    guide.offTrackClicked = null;
    send({ type: MSG.GUIDE_BACK_ON_TRACK, tipId: guide.tipId, stepIndex: guide.stepIndex });
    lastLayoutKey = '';
  }

  function stepDone() {
    if (guide.done) return;
    if (guide.offTrack) backOnTrack();
    guide.done = true;
    send({ type: MSG.GUIDE_STEP_DONE, tipId: guide.tipId, stepIndex: guide.stepIndex });
    // Hide until the panel sends the next step (otherwise the ring would jump back to "Format"
    // as soon as the menu closes).
    hideOverlay();
  }

  // ---------------------------------------------------------------------------
  // 8. Drawing the ring, cursor and coach
  // ---------------------------------------------------------------------------

  function coachContent() {
    const stepLabel = guide.totalSteps
      ? `Step ${Number(guide.stepIndex) + 1} of ${guide.totalSteps}`
      : `Step ${Number(guide.stepIndex) + 1}`;

    if (guide.stepType === 'your_turn') {
      return { small: stepLabel, before: firstSentence(guide.description, 90) || 'Your turn', bold: '', after: '' };
    }
    const label = guide.kind === 'search' ? 'search box' : currentLabel();
    if (guide.kind === 'search') return { small: stepLabel, before: 'Click the ', bold: label, after: '' };
    if (guide.offTrack) return { small: 'Back on track', before: 'Click ', bold: label, after: ' instead' };
    const isFirstOfMany = guide.targetIndex === 0 && guide.path.length > 1;
    return {
      small: stepLabel,
      before: guide.targetIndex > 0 ? 'Now click ' : 'Click ',
      bold: label,
      after: isFirstOfMany ? ' to start' : ''
    };
  }

  function render() {
    if (!guide || guide.done || !guide.target) {
      hideOverlay();
      return;
    }
    ensureHost();

    const content = coachContent();
    const key = [content.small, content.before, content.bold, content.after].join('|');
    if (ui.coach.dataset.key !== key) {
      ui.coach.dataset.key = key;
      ui.coach.replaceChildren(el('small', '', content.small), content.before);
      if (content.bold) ui.coach.append(el('b', '', content.bold));
      if (content.after) ui.coach.append(content.after);
      lastLayoutKey = ''; // size changed, re-place it
    }

    const isContainer = guide.kind === 'panel' || guide.kind === 'dialog';
    ui.ring.classList.toggle('fill', !isContainer);
    ui.ring.classList.toggle('recover', guide.offTrack);
    ui.ring.hidden = false;
    ui.cursor.hidden = isContainer;
    ui.coach.hidden = false;

    position(guide.target.getBoundingClientRect()); // place it now...
    if (!rafId) rafId = requestAnimationFrame(frame); // ...and keep it glued while things move
  }

  // Keep everything glued to the target while it moves (scrolling, animations).
  function frame() {
    rafId = 0;
    if (!guide || guide.done || !guide.target) return;
    if (!guide.target.isConnected) { hideOverlay(); onMutation(); return; }
    position(guide.target.getBoundingClientRect());
    rafId = requestAnimationFrame(frame);
  }

  function position(r) {
    const key = [r.left, r.top, r.width, r.height, window.innerWidth, window.innerHeight].join(',');
    if (key === lastLayoutKey) return; // nothing moved
    lastLayoutKey = key;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Ring (kept inside the viewport so a full-height sidebar still shows all four edges).
    const left = clamp(r.left - RING_PAD, 2, vw - 2);
    const top = clamp(r.top - RING_PAD, 2, vh - 2);
    const right = clamp(r.right + RING_PAD, 2, vw - 2);
    const bottom = clamp(r.bottom + RING_PAD, 2, vh - 2);
    Object.assign(ui.ring.style, {
      left: left + 'px', top: top + 'px', width: (right - left) + 'px', height: (bottom - top) + 'px'
    });

    // Cursor tip sits a bit right of center (like the mockup). The SVG's tip is at (5, 3).
    const tipX = r.left + Math.min(r.width * 0.62, r.width - 6);
    const tipY = r.top + r.height * 0.55;
    ui.cursor.style.left = (tipX - 5) + 'px';
    ui.cursor.style.top = (tipY - 3) + 'px';
    const cursorBottom = ui.cursor.hidden ? r.bottom : Math.max(r.bottom, tipY + 24);

    placeCoach(r, cursorBottom, vw, vh);
  }

  // Below the target by default; above, left or right if it doesn't fit.
  // Items inside an open dropdown prefer the right side so the coach doesn't cover the menu.
  function placeCoach(r, cursorBottom, vw, vh) {
    const cw = ui.coach.offsetWidth;
    const ch = ui.coach.offsetHeight;
    const m = 8;    // margin from the viewport edge
    const gap = 12; // space between target and coach
    const anchorX = r.left + Math.min(24, r.width / 2);
    const anchorY = r.top + Math.min(r.height / 2, 40);

    const sides = {
      below: () => {
        const x = clamp(r.left - 4, m, vw - cw - m);
        const y = cursorBottom + gap;
        return { x, y, fits: y + ch <= vh - m, arrow: clamp(anchorX - x - 5, 10, cw - 20) };
      },
      above: () => {
        const x = clamp(r.left - 4, m, vw - cw - m);
        const y = r.top - gap - ch;
        return { x, y, fits: y >= m, arrow: clamp(anchorX - x - 5, 10, cw - 20) };
      },
      right: () => {
        const x = r.right + gap + 6;
        const y = clamp(anchorY - ch / 2, m, vh - ch - m);
        return { x, y, fits: x + cw <= vw - m, arrow: clamp(anchorY - y - 5, 8, ch - 18) };
      },
      left: () => {
        const x = r.left - gap - cw;
        const y = clamp(anchorY - ch / 2, m, vh - ch - m);
        return { x, y, fits: x >= m, arrow: clamp(anchorY - y - 5, 8, ch - 18) };
      }
    };

    const inDropdown = guide.kind === 'menu' && guide.targetIndex > 0;
    const order = inDropdown ? ['right', 'left', 'below', 'above'] : ['below', 'above', 'left', 'right'];
    let side = order[0];
    let spot = sides[side]();
    for (const name of order) {
      const candidate = sides[name]();
      if (candidate.fits) { side = name; spot = candidate; break; }
    }
    if (!spot.fits) { // nothing fits: keep it on screen, overlapping if needed
      spot.x = clamp(spot.x, m, vw - cw - m);
      spot.y = clamp(spot.y, m, vh - ch - m);
    }

    ui.coach.className = 'coach ' + side;
    ui.coach.style.left = spot.x + 'px';
    ui.coach.style.top = spot.y + 'px';
    ui.coach.style.setProperty('--arrow', spot.arrow + 'px');
  }

  // ---------------------------------------------------------------------------
  // 9. Screen 1 nudge: "N teacher tips for Google Sheets are ready"
  // ---------------------------------------------------------------------------

  let nudgeTimer = 0;

  async function maybeShowNudge() {
    const info = await send({ type: MSG.GET_SITE_INFO });
    if (!info || !info.showNudge || !info.site || !(info.tipCount > 0)) return;
    showNudge(info.site, info.tipCount);
  }

  function showNudge(site, tipCount) {
    removeNudge(); // (before ensureHost: removeNudge drops an empty host)
    ensureHost();

    const card = el('div', 'nudge');
    card.setAttribute('role', 'status');

    const top = el('div', 'nudge-top');
    const logo = svgIcon(LOGO_ICON);
    const close = el('button', 'nudge-x', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close');
    top.append(logo, el('b', '', 'PrepTip'), close);

    const text = el('p');
    text.append(el('b', '', `${tipCount} teacher ${tipCount === 1 ? 'tip' : 'tips'}`),
      ` for ${site.name || 'this site'} are ready if you get stuck.`);

    const row = el('div', 'nudge-row');
    const show = el('button', 'btn primary', 'Show tips');
    const later = el('button', 'btn ghost', 'Not now');
    show.type = later.type = 'button';
    row.append(show, later);

    card.append(top, text, row);
    ui.layer.appendChild(card);
    ui.nudge = card;

    const dismiss = () => {
      send({ type: MSG.NUDGE_DISMISSED, urlPattern: site.url_pattern });
      removeNudge();
    };
    close.addEventListener('click', dismiss);
    later.addEventListener('click', dismiss);

    show.addEventListener('click', async () => {
      show.disabled = true;
      // Showing tips counts as "seen" too, so the nudge doesn't come back next visit.
      send({ type: MSG.NUDGE_DISMISSED, urlPattern: site.url_pattern });
      const response = await send({ type: MSG.OPEN_PANEL });
      if (response && response.ok) {
        removeNudge();
        return;
      }
      // Chrome may refuse to open the panel from here; tell the teacher where to click.
      text.textContent = 'Click the PrepTip icon in your toolbar to open tips.';
      row.hidden = true;
      startNudgeTimer(NUDGE_FALLBACK_MS);
    });

    // Auto-hide after a while (not recorded as dismissed), paused while the mouse is on it.
    card.addEventListener('mouseenter', () => clearTimeout(nudgeTimer));
    card.addEventListener('mouseleave', () => startNudgeTimer(row.hidden ? NUDGE_FALLBACK_MS : NUDGE_AUTO_HIDE_MS));
    startNudgeTimer(NUDGE_AUTO_HIDE_MS);
  }

  function startNudgeTimer(ms) {
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(removeNudge, ms);
  }

  function removeNudge() {
    clearTimeout(nudgeTimer);
    nudgeTimer = 0;
    if (ui.nudge) ui.nudge.remove();
    ui.nudge = null;
    removeHostIfEmpty();
  }

  // ---------------------------------------------------------------------------
  // 10. Messages from the side panel
  // ---------------------------------------------------------------------------

  function onMessage(message, sender, sendResponse) {
    if (!message || typeof message.type !== 'string') return;
    switch (message.type) {
      case MSG.PING:
        sendResponse({ ok: true });
        break;
      case MSG.GUIDE_SHOW:
        startGuide(message);
        sendResponse({ ok: true });
        break;
      case MSG.GUIDE_CLEAR:
        stopGuide();
        removeNudge();
        sendResponse({ ok: true });
        break;
      default:
        // Not for us; let other listeners answer.
    }
  }

  // Remove every trace of this script (CLEAR-all, or the extension was reloaded).
  function destroy() {
    stopGuide();
    removeNudge();
    if (ui.host) ui.host.remove();
    Object.keys(ui).forEach((k) => { ui[k] = null; });
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch (e) { /* context gone */ }
    if (window.__preptipGuide === api) window.__preptipGuide = null;
  }

  const api = { isAlive: contextAlive, destroy };
  window.__preptipGuide = api;

  try {
    chrome.runtime.onMessage.addListener(onMessage);
  } catch (e) {
    destroy();
    return;
  }

  maybeShowNudge();
})();
