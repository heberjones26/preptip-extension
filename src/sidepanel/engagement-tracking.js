import { MSG } from '../lib/protocol.js';
import { createDwellTracker } from '../lib/engagement.js';

export function createPanelEngagement({
  document = globalThis.document, window = globalThis.window, chrome = globalThis.chrome,
  now = () => performance.now(), date = () => new Date(), uuid = () => crypto.randomUUID(),
  schedule = (fn, ms) => setTimeout(fn, ms), cancel = (id) => clearTimeout(id)
} = {}) {
  const noop = { open() {}, click() {}, stop() {}, flush: async () => {} };
  if (!chrome?.runtime?.id || document?.location?.href !== chrome.runtime.getURL('src/sidepanel/sidepanel.html')) return noop;

  let teacherId = null;
  let session = null;
  let panelOpen = true;
  let pending = null;
  let retryTimer;
  let retryCount = 0;
  const queue = [];
  const guard = (fn) => (...args) => { try { return fn(...args); } catch { /* analytics must not block the UI */ } };

  function flush() {
    if (pending) return pending;
    if (retryTimer != null) cancel(retryTimer);
    retryTimer = null;
    pending = (async () => {
      while (queue.length) {
        try {
          const result = await chrome.runtime.sendMessage(queue[0]);
          if (!result?.ok && result?.retryable !== false) throw Error('Usage storage unavailable');
          queue.shift();
          retryCount = 0;
        } catch {
          // Keep event order and identifiers across retries. A lost acknowledgement
          // cannot create a second opening or a second successful visit.
          if (retryCount < 3) {
            const delay = [250, 1000, 3000][retryCount++];
            retryTimer = schedule(() => { retryTimer = null; void flush(); }, delay);
          }
          break;
        }
      }
    })().finally(() => {
      pending = null;
      if (queue.length && retryTimer == null && retryCount === 0) void flush();
    });
    return pending;
  }
  function send(event) {
    if (!session) return;
    queue.push({ type: MSG.ENGAGEMENT, ...session, ...event, at: date().toISOString() });
    retryCount = 0;
    void flush();
  }
  const dwell = createDwellTracker({ now, schedule, cancel,
    success: (visitId, visibleMs) => send({ kind: 'success', visitId, visibleMs }) });

  function beginOpening() {
    if (!panelOpen || document.hidden || teacherId == null || session) return;
    session = { sessionId: uuid(), userId: teacherId };
    send({ kind: 'open' });
  }
  document.addEventListener('visibilitychange', guard(() => {
    beginOpening();
    dwell.visibility(document.hidden);
    void flush();
  }));
  window.addEventListener('pagehide', guard(() => {
    dwell.stop();
    panelOpen = false;
    session = null;
    void flush();
  }));

  // Chrome 142+ can reuse the document when switching between side panels.
  // These events distinguish a real reopening from minimizing/restoring a window.
  if (chrome.sidePanel?.onOpened && chrome.sidePanel?.onClosed && chrome.windows?.getCurrent) {
    try {
      let windowId = null;
      const waiting = [];
      const onLifecycle = guard((isOpen, info) => {
        if (windowId == null) { waiting.push([isOpen, info]); return; }
        if (info.windowId !== windowId || info.path?.replace(/^\//, '') !== 'src/sidepanel/sidepanel.html') return;
        if (!isOpen) {
          dwell.stop();
          session = null;
        }
        panelOpen = isOpen;
        if (isOpen) beginOpening();
      });
      chrome.sidePanel.onOpened.addListener((info) => onLifecycle(true, info));
      chrome.sidePanel.onClosed.addListener((info) => onLifecycle(false, info));
      Promise.resolve(chrome.windows.getCurrent()).then((current) => {
        windowId = current.id;
        for (const args of waiting) onLifecycle(...args);
        waiting.length = 0;
      }).catch(() => {});
    } catch { /* optional browser lifecycle APIs unavailable */ }
  }
  return {
    open: guard((userId) => {
      if (teacherId != null && String(teacherId) === String(userId)) { beginOpening(); return; }
      dwell.stop();
      session = null;
      teacherId = userId;
      beginOpening();
    }),
    click: guard((tipId) => {
      if (!session || document.hidden || !panelOpen) return;
      dwell.stop();
      const visitId = uuid();
      send({ kind: 'click', visitId, tipId });
      dwell.start(visitId);
    }),
    stop: guard(() => dwell.stop()),
    flush
  };
}
