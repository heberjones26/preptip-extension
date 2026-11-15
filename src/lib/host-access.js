import { getExtensionApi } from './browser.js';

// Call directly from a button/form handler, before any await: Safari requires a
// user gesture to grant access to the tip service or the teacher's AI provider.
export function requestHostAccess(url, label, api = getExtensionApi()) {
  if (!api?.runtime?.id || typeof api.permissions?.request !== 'function') return Promise.resolve();
  const denied = () => {
    const error = new Error(`Allow PrepTip to connect to ${label}, then try again.`);
    error.name = 'HostAccessError';
    error.friendly = error.message;
    return error;
  };
  try {
    const origin = new URL(url).origin;
    return Promise.resolve(api.permissions.request({ origins: [`${origin}/*`] }))
      .then((granted) => { if (!granted) throw denied(); }, () => { throw denied(); });
  } catch { return Promise.reject(denied()); }
}
