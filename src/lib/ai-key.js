// Where the teacher's own Gemini key lives. It stays in this browser and is only ever sent to Google.
// By default it goes in chrome.storage.session, which Chrome clears when the browser closes, so a
// shared school computer doesn't keep it; chrome.storage.local is used only when the teacher ticks
// "remember". Signing out removes it from both.
import { STORAGE } from './protocol.js';

const KEY = STORAGE.GEMINI_KEY;

export function createKeyStore({ local, session }) {
  return {
    // -> { key: string, remembered: boolean }  (key is '' when none is saved)
    async get() {
      try {
        const s = (await session.get(KEY))[KEY];
        if (typeof s === 'string' && s) return { key: s, remembered: false };
        const l = (await local.get(KEY))[KEY];
        if (typeof l === 'string' && l) return { key: l, remembered: true };
      } catch { /* storage unavailable: behave as if there is no key */ }
      return { key: '', remembered: false };
    },
    async set(key, remember) {
      const value = String(key).trim();
      if (remember) {
        await local.set({ [KEY]: value });
        await session.remove(KEY);
      } else {
        await session.set({ [KEY]: value });
        await local.remove(KEY);
      }
    },
    async clear() {
      try { await session.remove(KEY); } catch { /* ignore */ }
      try { await local.remove(KEY); } catch { /* ignore */ }
    }
  };
}
