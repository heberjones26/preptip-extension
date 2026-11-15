// Firefox and Safari expose Promise-based APIs through browser; Chromium uses chrome.
// Resolve lazily so previews and test harnesses may install their API after importing us.
export const getExtensionApi = () => globalThis.browser || globalThis.chrome;

export const extensionApi = new Proxy({}, {
  get(_target, property) { return getExtensionApi()?.[property]; }
});

export const PANEL_PATH = 'src/sidepanel/sidepanel.html';
const panelWindowKey = (windowId) => `pt.panelWindow.${windowId}`;

// Keep the guide open while the teacher clicks the website. An action popup closes
// on those clicks, so browsers without a sidebar get a separate, reusable window.
export function createPanelController(api = extensionApi) {
  const pendingWindows = new Map();

  async function openWindow(tab) {
    if (!api.windows?.create) throw new Error('This browser cannot open a PrepTip guide window');
    let sourceId = tab?.windowId;
    if (!Number.isInteger(sourceId)) {
      sourceId = (await api.windows.getLastFocused({ windowTypes: ['normal'] }))?.id;
    }
    if (!Number.isInteger(sourceId) || sourceId < 0) throw new Error('No website window is available');
    if (pendingWindows.has(sourceId)) return pendingWindows.get(sourceId);
    const operation = (async () => {
      const key = panelWindowKey(sourceId);
      const url = `${api.runtime.getURL(PANEL_PATH)}?windowId=${sourceId}`;
      const saved = await api.storage.session.get(key);
      const previousId = saved[key];
      if (Number.isInteger(previousId) && api.windows.get && api.windows.update) {
        try {
          const previous = await api.windows.get(previousId, { populate: true });
          if (previous.tabs?.some((item) => item.url === url)) {
            await api.windows.update(previousId, { focused: true });
            return;
          }
        } catch { /* The teacher closed the previous guide window. */ }
      }
      const created = await api.windows.create({ url, type: 'popup', width: 420, height: 760 });
      if (Number.isInteger(created?.id)) await api.storage.session.set({ [key]: created.id });
    })();
    pendingWindows.set(sourceId, operation);
    try { return await operation; }
    finally { pendingWindows.delete(sourceId); }
  }

  // Native sidebar APIs must be called before any await to retain user activation.
  function open(tab) {
    try {
      if (typeof api.sidePanel?.open === 'function') {
        const target = Number.isInteger(tab?.id) ? { tabId: tab.id } : { windowId: tab?.windowId };
        return Promise.resolve(api.sidePanel.open(target)).catch(() => openWindow(tab));
      }
      if (typeof api.sidebarAction?.open === 'function') {
        return Promise.resolve(api.sidebarAction.open()).catch(() => openWindow(tab));
      }
    } catch { /* Fall back when the browser rejects an unavailable sidebar API. */ }
    return openWindow(tab);
  }

  function configure() {
    api.action?.onClicked?.addListener((tab) => {
      open(tab).catch((error) => console.warn('[PrepTip] open guide:', error?.message || error));
    });
    if (typeof api.sidePanel?.setPanelBehavior === 'function') {
      try {
        Promise.resolve(api.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }))
          .catch((error) => console.warn('[PrepTip] panel behavior:', error?.message || error));
      } catch (error) { console.warn('[PrepTip] panel behavior:', error?.message || error); }
    }
  }

  return { open, configure };
}
