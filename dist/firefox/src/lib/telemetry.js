import { getExtensionApi } from './browser.js';

const INTERACTION_DATA = 'technicalAndInteraction';

// Firefox can grant or revoke optional data collection independently of normal
// extension permissions. Check the current grant for each remote event.
export async function canSendTelemetry(api = getExtensionApi()) {
  if (!api?.runtime?.id || typeof api.runtime.getManifest !== 'function') return false;
  try {
    const manifest = api.runtime.getManifest();
    if (!manifest || typeof manifest !== 'object') return false;
    const optional = manifest.browser_specific_settings?.gecko?.data_collection_permissions?.optional;
    if (!Array.isArray(optional) || !optional.includes(INTERACTION_DATA)) return true;
    if (typeof api.permissions?.getAll !== 'function') return false;
    const granted = await api.permissions.getAll();
    return Array.isArray(granted?.data_collection) && granted.data_collection.includes(INTERACTION_DATA);
  } catch {
    // Never send optional data when its permission cannot be determined.
    return false;
  }
}
