import { createMetricsRecorder } from '../../src/lib/metrics.js';
import { createPanelEngagement } from '../../src/sidepanel/engagement-tracking.js';
import { STORAGE } from '../../src/lib/protocol.js';

export function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) { const list = listeners.get(type) || []; list.push(fn); listeners.set(type, list); },
    emit(type, ...args) { for (const fn of listeners.get(type) || []) fn(...args); }
  };
}
export function chromeEvent() {
  const listeners = [];
  return { addListener(fn) { listeners.push(fn); }, emit(...args) { for (const fn of listeners) fn(...args); } };
}
export function metricsHarness({ modern = true, preview = false, hidden = false } = {}) {
  let clock = 0;
  let nextId = 0;
  let failWrites = 0;
  let loseAcknowledgements = 0;
  let recorder;
  const sent = [];
  const timers = new Map();
  const wall = new Date('2026-11-02T09:00:00');
  const saved = { [STORAGE.TEACHER]: { userId: 1, username: 'teacher1' }, [STORAGE.SETUP_DONE]: true };
  const storage = {
    async get(keys) { keys = typeof keys === 'string' ? [keys] : keys; return Object.fromEntries(keys.filter((k) => k in saved).map((k) => [k, structuredClone(saved[k])])); },
    async set(value) {
      if (failWrites > 0) { failWrites--; throw Error('storage unavailable'); }
      Object.assign(saved, structuredClone(value));
    },
    async remove(keys) {
      keys = typeof keys === 'string' ? [keys] : keys;
      for (const k of keys) delete saved[k];
    }
  };
  const now = () => clock;
  const date = () => new Date(wall.getTime() + clock);
  const resetWorker = () => { recorder = createMetricsRecorder(storage, { now: date }); };
  resetWorker();
  const url = 'chrome-extension://test/src/sidepanel/sidepanel.html';
  const document = { ...eventTarget(), hidden, location: { href: preview ? 'http://localhost/dev.html' : url } };
  const window = eventTarget();
  const chrome = {
    runtime: {
      id: 'test', getURL: (path) => `chrome-extension://test/${path}`,
      async sendMessage(event) {
        sent.push(structuredClone(event));
        const result = await recorder(event, 'panel-document');
        if (loseAcknowledgements > 0) { loseAcknowledgements--; throw Error('Response port closed'); }
        return result;
      }
    },
    storage: { local: storage },
    windows: { async getCurrent() { return { id: 10 }; } },
    sidePanel: modern ? { onOpened: chromeEvent(), onClosed: chromeEvent() } : {}
  };
  const schedule = (fn, ms) => { const id = ++nextId; timers.set(id, { fn, time: clock + ms }); return id; };
  const cancel = (id) => timers.delete(id);
  const env = { document, window, chrome, now, date, schedule, cancel, uuid: () => `id-${++nextId}` };
  const tracker = createPanelEngagement(env);
  return { saved, sent, env, tracker, storage, resetWorker,
    fail(count = 1) { failWrites = count; }, loseAck(count = 1) { loseAcknowledgements = count; },
    advance(ms) { clock += ms; },
    async tick(ms) {
      const end = clock + ms;
      while (true) {
        const due = [...timers].filter(([, t]) => t.time <= end).sort((a, b) => a[1].time - b[1].time)[0];
        if (!due) break;
        clock = due[1].time; timers.delete(due[0]); due[1].fn();
        await tracker.flush();
      }
      clock = end;
      await tracker.flush();
    },
    hidden(value) { document.hidden = value; document.emit('visibilitychange'); },
    lifecycle(isOpen, windowId = 10, path = '/src/sidepanel/sidepanel.html') {
      chrome.sidePanel[isOpen ? 'onOpened' : 'onClosed'].emit({ windowId, path });
    }
  };
}
