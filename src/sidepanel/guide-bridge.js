// Talks to the on-page guide (src/content/guide.js) in a tab.
// Every function swallows errors: if a page can't be scripted (chrome:// pages, the Web Store),
// the panel still works as a plain step list.
import { MSG } from '../lib/protocol.js';

async function ping(tabId) {
  const res = await chrome.tabs.sendMessage(tabId, { type: MSG.PING });
  return !!res?.ok;
}

// Makes sure guide.js is running in the tab. Injects it if the ping fails
// (for example, the tab was open before the extension was installed or reloaded).
export async function ensureGuideScript(tabId) {
  try {
    if (await ping(tabId)) return true;
  } catch { /* not injected yet */ }

  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['src/content/guide.css'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['src/content/guide.js'] });
    return await ping(tabId);
  } catch {
    return false; // this page can't be scripted
  }
}

// Highlight one step on the page. Resolves true if the page accepted it.
export async function showStep(tabId, tip, stepIndex) {
  if (tabId == null) return false;
  if (!(await ensureGuideScript(tabId))) return false;

  const step = tip.tip_steps[stepIndex];
  try {
    const res = await chrome.tabs.sendMessage(tabId, {
      type: MSG.GUIDE_SHOW,
      tipId: tip.tip_id,
      stepIndex,
      totalSteps: tip.tip_steps.length,
      step: {
        step_type: step.step_type,
        target_element: step.target_element,
        step_description: step.step_description
      }
    });
    return res?.ok !== false;
  } catch {
    return false;
  }
}

// Remove every overlay from the page. Safe to call on tabs that never had a guide.
export async function clearGuide(tabId) {
  if (tabId == null) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: MSG.GUIDE_CLEAR });
  } catch { /* tab closed or never injected: nothing to clear */ }
}
