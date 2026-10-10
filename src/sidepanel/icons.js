// Inline SVG icons (no remote assets: MV3 pages can't load them anyway).

// The PrepTip lightbulb logo, copied from docs/mockup/preptip-mockup.html.
export const LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#E8590C"/><path d="M12 4.6a5.4 5.4 0 0 0-3.2 9.75c.5.37.8.93.8 1.55v.6h4.8v-.6c0-.62.3-1.18.8-1.55A5.4 5.4 0 0 0 12 4.6Z" fill="#fff"/><rect x="9.6" y="17.4" width="4.8" height="1.6" rx=".8" fill="#fff"/><path d="M12 8.2v3.4M10.6 10.4h2.8" stroke="#E8590C" stroke-width="1.3" stroke-linecap="round"/></svg>';

export const SEARCH = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15.5 15.5 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

export const GLOBE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';

export const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export const THUMB = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>';

export const PUZZLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4c-1.1 0-2 .9-2 2v3.8h1.5a2.7 2.7 0 0 1 0 5.4H2V20c0 1.1.9 2 2 2h3.8v-1.5a2.7 2.7 0 0 1 5.4 0V22H17c1.1 0 2-.9 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z"/></svg>';

export const PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 9V4h1a1 1 0 0 0 0-2H7a1 1 0 0 0 0 2h1v5a3 3 0 0 1-3 3v2h6v7l1 1 1-1v-7h6v-2a3 3 0 0 1-3-3z"/></svg>';

export const INFO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v5M12 7.6v.2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

export const OFFLINE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M3 3l18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/></svg>';

export const WAND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20 15 9M14 4v3M19 9h-3M17.5 5.5l-2 2M9 4.5V6M4.5 9H6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

export const STEPS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="4.5" cy="6" r="1.6" fill="currentColor"/><circle cx="4.5" cy="12" r="1.6" fill="currentColor"/><circle cx="4.5" cy="18" r="1.6" fill="currentColor"/></svg>';

// A little Google-style document, recolored per product.
function googleDoc(fill, fold, lines) {
  return `<svg viewBox="0 0 16 20" aria-hidden="true"><path d="M0 2a2 2 0 0 1 2-2h8l6 6v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2z" fill="${fill}"/><path d="M10 0l6 6h-4a2 2 0 0 1-2-2z" fill="${fold}"/>${lines}</svg>`;
}

function letterTile(letter, bg) {
  return `<svg viewBox="0 0 20 20" aria-hidden="true"><rect width="20" height="20" rx="10" fill="${bg}"/><text x="10" y="14.2" text-anchor="middle" font-size="11.5" font-weight="800" font-family="Segoe UI, sans-serif" fill="#fff">${letter}</text></svg>`;
}

const SITE_ICONS = {
  'docs.google.com/spreadsheets': googleDoc('#0F9D58', '#87CEAC', '<path d="M3.5 9h9v7h-9zM3.5 11.3h9M3.5 13.6h9M7 9v7" fill="none" stroke="#fff" stroke-width="1.1"/>'),
  'docs.google.com/document': googleDoc('#4285F4', '#A1C2FA', '<path d="M4 10h8M4 12.5h8M4 15h5" stroke="#fff" stroke-width="1.2"/>'),
  'docs.google.com/presentation': googleDoc('#F4B400', '#FADA80', '<rect x="3.5" y="9.5" width="9" height="6" rx=".8" fill="none" stroke="#fff" stroke-width="1.2"/>'),
  'canva.com': letterTile('C', '#00A3B4'),
  'instructure.com': letterTile('C', '#E13F2B'),
  'youtube.com': '<svg viewBox="0 0 20 20" aria-hidden="true"><rect y="3" width="20" height="14" rx="4" fill="#FF0000"/><path d="M8 7v6l5-3z" fill="#fff"/></svg>'
};

export function siteIcon(site) {
  return (site && SITE_ICONS[site.url_pattern]) || GLOBE;
}
