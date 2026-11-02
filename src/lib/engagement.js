import { openingDetails } from './usage.js';
export const ENGAGEMENT_KEY = 'pt.engagement.v1';

export function updateEngagement(data, event, userId, now = new Date()) {
  const next = structuredClone(data || { version: 1, sessions: {} });
  const { sessionId, kind, visitId, tipId } = event;
  if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9][\w-]{0,99}$/.test(sessionId) || ['constructor', 'prototype'].includes(sessionId)) throw Error('Invalid session');
  if (kind === 'open') {
    if (Object.hasOwn(next.sessions, sessionId) && String(next.sessions[sessionId].userId) !== String(userId)) throw Error('Session belongs to another teacher');
    next.sessions[sessionId] ||= { userId, ...openingDetails(now), visits: {} };
  } else {
    const session = Object.hasOwn(next.sessions, sessionId) ? next.sessions[sessionId] : null;
    if (!session || String(session.userId) !== String(userId)) throw Error('Unknown session');
    if (typeof visitId !== 'string' || !/^[a-zA-Z0-9][\w-]{0,99}$/.test(visitId) || ['constructor', 'prototype'].includes(visitId)) throw Error('Invalid visit');
    if (kind === 'click') {
      if (!['string', 'number'].includes(typeof tipId) || !String(tipId).trim() || (typeof tipId === 'number' && !Number.isFinite(tipId))) throw Error('Invalid tip');
      session.visits[visitId] ||= { tipId, clickedAt: now.toISOString(), successful: false };
    } else if (kind === 'success') {
      const visit = session.visits[visitId];
      if (!visit || !(event.visibleMs > 10000) || !Number.isFinite(event.visibleMs)) throw Error('Invalid duration');
      if (!visit.successful) Object.assign(visit, { successful: true, visibleMs: event.visibleMs, successfulAt: now.toISOString() });
    } else throw Error('Invalid event');
  }
  return next;
}

export function engagementReport(data, { week, userId } = {}) {
  const sessions = Object.values(data?.sessions || {}).filter((s) =>
    (!week || s.week === week) && (userId == null || String(s.userId) === String(userId)));
  const openings = sessions.length;
  const openingsWithTipClick = sessions.filter((s) => Object.keys(s.visits).length > 0).length;
  const successfulOpenings = sessions.filter((s) => Object.values(s.visits).some((v) => v.successful)).length;
  return { openings, openingsWithTipClick, successfulOpenings,
    tipClicks: sessions.reduce((sum, s) => sum + Object.keys(s.visits).length, 0),
    clickRate: openings ? openingsWithTipClick / openings : null,
    successfulUseRate: openings ? successfulOpenings / openings : null };
}

// Check elapsed time before cancellation as well as in the timer callback.
export function createDwellTracker({ now, schedule, cancel, success }) {
  let active = null;
  let timer;
  function clear() { if (timer != null) cancel(timer); timer = null; }
  function check() {
    if (!active || active.hidden || active.done) return;
    const visibleMs = now() - active.started;
    if (visibleMs > 10000) {
      active.done = true;
      success(active.visitId, visibleMs);
    }
  }
  function arm() {
    clear();
    if (!active || active.hidden || active.done) return;
    const visit = active;
    timer = schedule(() => {
      if (active !== visit) return;
      check();
      arm();
    }, Math.max(1, 10001 - (now() - active.started)));
  }
  return {
    start(visitId, hidden = false) {
      check(); clear();
      active = { visitId, hidden, started: now(), done: false };
      arm();
    },
    visibility(hidden) {
      if (!active || active.hidden === hidden) return;
      check();
      active.hidden = hidden;
      active.started = now();
      arm();
    },
    stop() { check(); clear(); active = null; }
  };
}
