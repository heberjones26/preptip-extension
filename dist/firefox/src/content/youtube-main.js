// PrepTip: runs in YouTube's MAIN world (classic script, no chrome.* APIs here).
// Reads the player response to learn whether the current video is private, age-restricted or
// otherwise unplayable, and posts that to src/content/youtube.js (isolated world) via postMessage.
(() => {
  'use strict';
  if (window.__preptipYtMain) return;
  window.__preptipYtMain = true;

  const AGE_STATUSES = ['LOGIN_REQUIRED', 'AGE_CHECK_REQUIRED', 'AGE_VERIFICATION_REQUIRED'];

  function urlVideoId() {
    if (location.pathname !== '/watch') return null;
    return new URLSearchParams(location.search).get('v');
  }

  function playerResponse() {
    let r = null;
    try {
      const player = document.getElementById('movie_player');
      if (player && typeof player.getPlayerResponse === 'function') r = player.getPlayerResponse();
    } catch { /* player not ready */ }
    if (!r || !r.playabilityStatus) r = window.ytInitialPlayerResponse || r;
    return r || null;
  }

  function reasonText(ps) {
    if (!ps) return '';
    if (typeof ps.reason === 'string') return ps.reason;
    const runs = ps.errorScreen?.playerErrorMessageRenderer?.reason?.runs;
    if (Array.isArray(runs)) return runs.map((x) => x.text || '').join('');
    return ps.errorScreen?.playerErrorMessageRenderer?.reason?.simpleText || '';
  }

  function buildInfo() {
    const wanted = urlVideoId();
    const r = playerResponse();
    const ps = r?.playabilityStatus || null;
    const vd = r?.videoDetails || null;
    const respId = vd?.videoId || null;

    // After a SPA navigation the player can briefly still hold the previous video.
    // Ignore a response that clearly belongs to another video.
    const fresh = Boolean(r && ps && (!respId || !wanted || respId === wanted));
    const status = fresh ? (ps.status || 'UNKNOWN') : 'UNKNOWN';
    const reason = fresh ? reasonText(ps) : '';
    const familySafe = fresh ? r?.microformat?.playerMicroformatRenderer?.isFamilySafe : undefined;

    // LOGIN_REQUIRED also covers private videos; either way the result for R10 is the same error.
    const ageRestricted = fresh && (
      AGE_STATUSES.includes(status) ||
      familySafe === false ||
      /\bage\b|age-restricted|age restricted|inappropriate for some users/i.test(reason)
    );

    return {
      source: 'preptip-yt',
      videoId: wanted || respId,
      title: fresh ? (vd?.title || document.title.replace(/ - YouTube$/, '')) : document.title.replace(/ - YouTube$/, ''),
      playability: status,
      reason,
      isPrivate: fresh ? Boolean(vd?.isPrivate) || /\bprivate\b/i.test(reason) : false,
      ageRestricted: Boolean(ageRestricted),
      isLive: fresh ? Boolean(vd?.isLiveContent) : false,
      known: fresh
    };
  }

  function post() {
    if (!urlVideoId()) return null;
    const info = buildInfo();
    window.postMessage(info, location.origin);
    return info;
  }

  // Post now, and keep retrying for a few seconds until the player has the right video.
  let pollTimer = null;
  function postUntilFresh() {
    clearInterval(pollTimer);
    let tries = 0;
    const first = post();
    if (!first || first.known) return;
    pollTimer = setInterval(() => {
      const info = post();
      if (!info || info.known || ++tries >= 20) clearInterval(pollTimer);
    }, 500);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    if (event.data && event.data.source === 'preptip-yt-request') postUntilFresh();
  });

  document.addEventListener('yt-navigate-finish', postUntilFresh);
  window.addEventListener('yt-navigate-finish', postUntilFresh);

  if (document.readyState === 'complete') postUntilFresh();
  else window.addEventListener('load', postUntilFresh, { once: true });
  postUntilFresh();
})();
