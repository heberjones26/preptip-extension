// The checked-in manifest remains directly loadable in Chromium browsers.
// Other browsers receive their own manifest when packaging the same sources.
export const BROWSER_TARGETS = Object.freeze(['chromium', 'firefox', 'safari']);

export function browserManifest(source, browser = 'chromium') {
  if (!BROWSER_TARGETS.includes(browser)) throw new Error(`Unknown browser target: ${browser}`);
  const manifest = structuredClone(source);
  if (browser === 'chromium') return manifest;

  delete manifest.minimum_chrome_version;
  delete manifest.side_panel;
  manifest.permissions = (manifest.permissions || []).filter((permission) => permission !== 'sidePanel');

  if (browser === 'firefox') {
    // Account/session metrics use shared extension storage; no private session
    // isolation is implemented, so private windows must stay outside this build.
    manifest.incognito = 'not_allowed';
    // Firefox uses an event page; unlike Chromium, it has no extension service workers.
    manifest.background = { scripts: [source.background.service_worker], type: 'module' };
    manifest.sidebar_action = {
      default_title: source.action?.default_title || source.name,
      default_icon: structuredClone(source.action?.default_icon || source.icons),
      default_panel: source.side_panel.default_path,
      open_at_install: false
    };
    manifest.browser_specific_settings = {
      // Omit gecko_android: PrepTip needs a desktop sidebar and does not target Android.
      gecko: {
        id: 'preptip@heberjones26.github.io',
        // Covers MAIN-world content scripts, ES modules, session storage and
        // Firefox's built-in data collection consent for new AMO submissions.
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: ['personallyIdentifyingInfo', 'authenticationInfo'],
          optional: ['technicalAndInteraction']
        }
      }
    };
  } else {
    // Safari requires WithHostAccess for redirect rules, including the warning page.
    manifest.permissions = manifest.permissions.map((permission) => permission === 'declarativeNetRequest'
      ? 'declarativeNetRequestWithHostAccess' : permission);
  }
  // Safari supports module service workers. Its toolbar opens the shared panel
  // in a separate window, so there is no Chrome side_panel or Firefox sidebar key.
  return manifest;
}

export function manifestReferences(manifest) {
  const icons = (value) => typeof value === 'string' ? [value] : Object.values(value || {});
  return new Set([
    ...icons(manifest.icons),
    ...icons(manifest.action?.default_icon),
    ...icons(manifest.sidebar_action?.default_icon),
    manifest.action?.default_popup,
    manifest.side_panel?.default_path,
    manifest.sidebar_action?.default_panel,
    manifest.background?.service_worker,
    manifest.background?.page,
    ...(manifest.background?.scripts || []),
    manifest.options_ui?.page,
    manifest.options_page,
    ...(manifest.content_scripts || []).flatMap((script) => [...(script.js || []), ...(script.css || [])]),
    ...(manifest.web_accessible_resources || []).flatMap((entry) => typeof entry === 'string' ? [entry] : entry.resources || []),
    ...(manifest.declarative_net_request?.rule_resources || []).map((entry) => entry.path)
  ].filter(Boolean));
}
