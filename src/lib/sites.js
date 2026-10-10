// Matching the active tab's URL to a supported website, and searching tips.

// url_pattern is "host" or "host/path-prefix", e.g. "docs.google.com/spreadsheets" or "instructure.com".
// Subdomains count ("byu.instructure.com" matches "instructure.com"). The longest matching pattern wins.
export function matchSite(url, websites) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(parsed.protocol)) return null;

  const host = parsed.hostname.replace(/^www\./, '');
  const path = parsed.pathname;
  let best = null;

  for (const site of websites) {
    const [pHost, ...rest] = site.url_pattern.replace(/^www\./, '').split('/');
    const pPath = rest.length ? '/' + rest.join('/') : '';
    const hostOk = host === pHost || host.endsWith('.' + pHost);
    const pathOk = !pPath || path === pPath || path.startsWith(pPath + '/') || path.startsWith(pPath + '?');
    if (hostOk && pathOk && (!best || site.url_pattern.length > best.url_pattern.length)) best = site;
  }
  return best;
}

export function tipsForSite(catalog, site) {
  if (!site) return [];
  return catalog.tips.filter((t) => t.url_pattern === site.url_pattern);
}

const STOP_WORDS = new Set(['how', 'to', 'a', 'an', 'the', 'i', 'do', 'my', 'in', 'on', 'of', 'for', 'and', 'can', 'is', 'make', 'get', 'with']);

// Simple keyword scoring over title, feature, keywords and summary. Returns tips sorted best-first.
export function searchTips(tips, query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/[^a-z0-9]+/).filter((w) => w && !STOP_WORDS.has(w));
  const terms = words.length ? words : [q];

  return tips
    .map((tip) => {
      const title = (tip.title || '').toLowerCase();
      const feature = (tip.feature_name || '').toLowerCase();
      const keywords = (tip.keywords || '').toLowerCase();
      const body = `${tip.summary || ''} ${tip.description || ''}`.toLowerCase();
      let score = keywords.includes(q) || title.includes(q) ? 6 : 0;
      for (const w of terms) {
        if (title.includes(w)) score += 3;
        if (feature.includes(w)) score += 2;
        if (keywords.includes(w)) score += 2;
        if (body.includes(w)) score += 1;
      }
      return { tip, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.tip);
}

// "menu:Format > Conditional formatting" -> { kind: 'menu', path: ['Format', 'Conditional formatting'] }
export function parseTarget(target) {
  if (!target) return { kind: null, path: [] };
  const i = target.indexOf(':');
  if (i === -1) return { kind: target.trim(), path: [] };
  return {
    kind: target.slice(0, i).trim(),
    path: target.slice(i + 1).split('>').map((s) => s.trim()).filter(Boolean)
  };
}
