import { STORAGE } from './protocol.js';
import { USAGE_KEY, addOpening, openingDetails } from './usage.js';
import { ENGAGEMENT_KEY, updateEngagement } from './engagement.js';

// One queue owns both counters. An opening is committed once with the same
// teacher and timestamp in KR 3 and KR 4, including when a message is retried.
export function createMetricsRecorder(storage, { now = () => new Date() } = {}) {
  let pending = Promise.resolve();
  return (event, documentId) => {
    if (typeof documentId !== 'string' || !documentId) return Promise.resolve({ ok: false, retryable: false, error: 'Missing panel document' });
    const receivedAt = now();
    const operation = pending.then(async () => {
      const saved = await storage.get([STORAGE.TEACHER, STORAGE.SETUP_DONE, USAGE_KEY, ENGAGEMENT_KEY]);
      const existing = Object.hasOwn(saved[ENGAGEMENT_KEY]?.sessions || {}, event.sessionId)
        ? saved[ENGAGEMENT_KEY].sessions[event.sessionId] : null;
      const userId = event.userId;
      if (userId == null || !['string', 'number'].includes(typeof userId) || !String(userId).trim()) {
        return { ok: false, retryable: false, error: 'Missing teacher' };
      }
      if (existing) {
        if (String(existing.userId) !== String(userId) || existing.documentId !== documentId) {
          return { ok: false, retryable: false, error: 'Session mismatch' };
        }
      } else if (event.kind !== 'open' || saved[STORAGE.SETUP_DONE] !== true ||
                 String(saved[STORAGE.TEACHER]?.userId) !== String(userId)) {
        return { ok: false, retryable: false, error: 'Unknown teacher or session' };
      }
      const at = event.at === undefined ? receivedAt : new Date(event.at);
      if (!Number.isFinite(at.getTime())) return { ok: false, retryable: false, error: 'Invalid timestamp' };
      let engagement;
      try { engagement = updateEngagement(saved[ENGAGEMENT_KEY], event, userId, at); }
      catch (error) { return { ok: false, retryable: false, error: error.message }; }
      const updates = { [ENGAGEMENT_KEY]: engagement };
      if (event.kind === 'open' && !existing) {
        engagement.sessions[event.sessionId].documentId = documentId;
        updates[USAGE_KEY] = addOpening(saved[USAGE_KEY], userId, openingDetails(at));
      }
      await storage.set(updates);
      return { ok: true };
    });
    pending = operation.catch(() => {});
    return operation;
  };
}
