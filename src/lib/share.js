// Public installation link, independent of the teacher's active tab or account.
export const PREPTIP_URL = 'https://chromewebstore.google.com/detail/preptip/aningbmgfcfgpjodmgonhmlkncicjdlf';
export const SHARE_TEXT = 'Try PrepTip for teacher-friendly tips and guided walkthroughs in the tools you already use.';
export const SHARE_MESSAGE = `${SHARE_TEXT}\n${PREPTIP_URL}`;

export async function sharePrepTip(browser = navigator) {
  if (typeof browser.share === 'function') {
    try {
      await browser.share({ title: 'PrepTip', text: SHARE_TEXT, url: PREPTIP_URL });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'idle'; // Closing the share sheet is intentional.
    }
  }
  try {
    await browser.clipboard.writeText(SHARE_MESSAGE);
    return 'copied';
  } catch {
    return 'manual';
  }
}
