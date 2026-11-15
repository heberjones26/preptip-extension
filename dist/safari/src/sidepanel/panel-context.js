// A detached guide follows the browser window that opened it, rather than its own tab.
export function sourceWindowId(href) {
  try {
    const value = new URL(href).searchParams.get('windowId');
    if (!value || !/^\d+$/.test(value)) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) ? id : null;
  } catch { return null; }
}

export function activeTabQuery(href) {
  const id = sourceWindowId(href);
  return id == null ? { active: true, currentWindow: true } : { active: true, windowId: id };
}
