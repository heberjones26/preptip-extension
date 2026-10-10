// Message types and storage keys shared by every part of the extension.
// Content scripts can't import ES modules, so src/content/*.js repeat the strings they use.
// If you rename anything here, search the repo for the old string. See docs/ARCHITECTURE.md.

export const MSG = {
  // side panel -> content script (chrome.tabs.sendMessage)
  PING: 'PT_PING',
  GUIDE_SHOW: 'PT_GUIDE_SHOW',
  GUIDE_CLEAR: 'PT_GUIDE_CLEAR',

  // content script -> side panel (chrome.runtime.sendMessage)
  GUIDE_STATUS: 'PT_GUIDE_STATUS',
  GUIDE_STEP_DONE: 'PT_GUIDE_STEP_DONE',
  GUIDE_OFFTRACK: 'PT_GUIDE_OFFTRACK',
  GUIDE_BACK_ON_TRACK: 'PT_GUIDE_BACK_ON_TRACK',

  // content script -> background
  GET_SITE_INFO: 'PT_GET_SITE_INFO',
  NUDGE_DISMISSED: 'PT_NUDGE_DISMISSED',
  OPEN_PANEL: 'PT_OPEN_PANEL',

  // blocked page -> background
  PROCEED_ANYWAY: 'PT_PROCEED_ANYWAY',

  // background -> side panel (broadcast via chrome.runtime.sendMessage)
  TAB_CONTEXT_CHANGED: 'PT_TAB_CONTEXT_CHANGED'
};

export const STORAGE = {
  // chrome.storage.local
  TEACHER: 'pt.teacher',            // { userId, firstName, lastName, email }
  SETUP_DONE: 'pt.setupDone',       // true once first-run setup is finished
  CATALOG: 'pt.catalog',            // { fetchedAt, websites, tips }
  NUDGES_SEEN: 'pt.nudgesSeen',     // { [url_pattern]: true }

  // chrome.storage.session (cleared when the browser closes)
  redirectKey: (tabId) => `pt.redirect.${tabId}`, // { from, to, at, kind: 'server'|'client' }
  guideKey: (tabId) => `pt.guide.${tabId}`,       // { tipId, stepIndex } owned by the side panel
  ALLOWED_DOMAINS: 'pt.allowedDomains'            // [domain] the teacher chose to proceed to
};
