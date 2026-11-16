// The metrics hub's brain: turns raw numbers (live from Supabase, or the labelled SAMPLE set) into exactly what
// the page draws. Pure functions, no DOM and no network, so it can be unit-tested.
//
// Rules the page follows:
//  * No minimum amounts of data. A small number is shown as it is, with its sample size beside it
//    ("1 rating"), never hidden behind a "not enough data" badge.
//  * The number is the chart: stat tiles for single values, ranked bars for lists, columns only for time.
//  * One accent (PrepTip orange) plus neutrals. Green/amber appear only as status.
import { OKR_CONFIG } from './config.js';

const n = (v) => Math.max(0, Number(v) || 0);
export const pct = (a, b) => (n(b) > 0 ? Math.round((100 * n(a)) / n(b)) : null);
export const plural = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

export function weekLabel(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function agoText(iso, now = Date.now()) {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (!Number.isFinite(mins)) return '';
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

// Weeks come oldest-first, with empty weeks included. Start the chart at the first week that has activity,
// but never show fewer than `min` weeks, so the shape stays readable.
export function trimWeeks(rows, key, min = 4) {
  const list = Array.isArray(rows) ? rows : [];
  const first = list.findIndex((r) => n(r?.[key]) > 0);
  if (first < 0) return list.slice(-min);
  return list.slice(Math.min(first, Math.max(0, list.length - min)));
}

// "On track" / "Below goal" / "No data yet": no floors, just value against goal.
export const statusFor = (value, goal) => (value == null ? 'none' : value >= goal ? 'on' : 'below');
export const STATUS_TEXT = { on: 'On track', below: 'Below goal', none: 'No data yet' };

// Change between the last two weeks that have data, e.g. +0.6 days.
export function deltaFor(values, fmt, unit = '') {
  const pts = values.filter((v) => v != null);
  if (pts.length < 2) return null;
  const d = pts[pts.length - 1] - pts[pts.length - 2];
  if (Math.abs(d) < 1e-9) return { text: 'no change vs last week', dir: 0 };
  return { text: `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}${unit} vs last week`, dir: d > 0 ? 1 : -1 };
}

// Sparkline geometry. Gaps (null) break the line instead of drawing a false zero.
export function sparkline(values, max, w = 120, h = 32, pad = 3) {
  const m = values.length; if (!m) return null;
  const x = (i) => pad + (m === 1 ? (w - 2 * pad) / 2 : (i * (w - 2 * pad)) / (m - 1));
  const y = (v) => h - pad - (Math.min(v, max) / max) * (h - 2 * pad);
  let d = '', pen = false, last = null;
  values.forEach((v, i) => {
    if (v == null) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `; pen = true; last = { x: x(i), y: y(v) };
  });
  return d ? { d: d.trim(), last, w, h } : null;
}

// A trend line needs at least 3 weeks with data; with fewer, the change text alone is more honest than a stub.
const thick = (vals) => vals.filter((v) => v != null).length >= 3;

// One dot per rating/walkthrough for small counts: honest at tiny n, and it makes "7 of 10" visible.
export function dotsFor(filled, total, cap = 60) {
  if (total < 1 || total > cap) return null;
  return Array.from({ length: total }, (_, i) => i < filled);
}

const rank = (rows, valueOf, textOf, subOf) => {
  const top = Math.max(1, ...rows.map(valueOf));
  return rows.map((r) => ({ label: r.label, sub: subOf(r), value: valueOf(r), valueText: textOf(r), width: Math.round((valueOf(r) / top) * 100) }));
};

// ------------------------------------------------------------------------------------------------------------
// raw -> everything the page draws
export function buildModel(raw, goals = OKR_CONFIG) {
  const g = { kr1: goals.kr1.target, kr2: goals.kr2.targetRate, kr3: goals.kr3.targetDays, ofDays: goals.kr3.ofDays, kr4: goals.kr4.targetRate };

  // KR1 thumbs-up rate
  const up = n(raw.ratings?.up), rated = n(raw.ratings?.total);
  const v1 = pct(up, rated);
  // KR2 walkthroughs finished
  const fin = n(raw.completions?.finished), started = n(raw.completions?.started);
  const v2 = pct(fin, started);
  // KR3 days opened: latest week that has teachers in it
  const uw = Array.isArray(raw.usageWeeks) ? raw.usageWeeks : [];
  const uwTrim = trimWeeks(uw, 'teachers');
  const cur3 = [...uw].reverse().find((r) => n(r.teachers) > 0) || null;
  const v3 = cur3 ? Math.round(Number(cur3.avg_office_days) * 10) / 10 : null;
  const days = uwTrim.map((r) => (n(r.teachers) > 0 ? Number(r.avg_office_days) : null));
  // KR4 opens that lead to a tip view
  const opens = n(raw.engagement?.opens), eng = n(raw.engagement?.engaged);
  const v4 = pct(Math.min(eng, opens), opens);
  const ew = Array.isArray(raw.engWeeks) ? raw.engWeeks : [];
  const ewTrim = trimWeeks(ew, 'opens');
  const rates = ewTrim.map((r) => (n(r.opens) > 0 ? Math.min(1, n(r.engaged) / n(r.opens)) : null));

  const tile = (t) => ({ status: statusFor(t.value, t.goal), statusText: STATUS_TEXT[statusFor(t.value, t.goal)], ...t });
  const tiles = {
    kr1: tile({ id: 'kr1', label: 'Thumbs-up rate', value: v1, valueText: v1 == null ? '—' : `${v1}%`, goal: g.kr1 * 100, goalText: `Goal ${Math.round(g.kr1 * 100)}%`,
      fill: v1 ?? 0, domain: 100, goalAt: g.kr1 * 100, sub: rated ? `${up} of ${plural(rated, 'rating')} ${rated === 1 ? 'was' : 'were'} thumbs-up` : 'Waiting for the first rating',
      dots: dotsFor(up, rated), dotsKey: ['Thumbs-up', 'Thumbs-down'], delta: null, spark: null }),
    kr2: tile({ id: 'kr2', label: 'Walkthroughs finished', value: v2, valueText: v2 == null ? '—' : `${v2}%`, goal: g.kr2 * 100, goalText: `Goal ${Math.round(g.kr2 * 100)}%`,
      fill: v2 ?? 0, domain: 100, goalAt: g.kr2 * 100, sub: started ? `${fin} of ${started} started walkthroughs were finished` : 'Waiting for the first walkthrough',
      dots: dotsFor(fin, started), dotsKey: ['Finished', 'Not finished'], delta: null, spark: null }),
    kr3: tile({ id: 'kr3', label: 'Days a teacher opens PrepTip', value: v3, valueText: v3 == null ? '—' : v3.toFixed(1), unit: `of ${g.ofDays} work days`, goal: g.kr3, goalText: `Goal ${g.kr3} days`,
      fill: v3 ?? 0, domain: g.ofDays, goalAt: g.kr3,
      sub: cur3 ? `${cur3.qualifying} of ${plural(n(cur3.teachers), 'teacher')} opened it on ${g.kr3}+ days · week of ${weekLabel(cur3.week_start)}` : 'Waiting for the first teacher',
      dots: null, delta: deltaFor(days, (x) => x.toFixed(1), ' days'), spark: thick(days) ? sparkline(days, g.ofDays) : null, sparkValues: days.map((v) => (v == null ? null : Math.round(v * 10) / 10)), sparkLabels: uwTrim.map((r) => weekLabel(r.week_start)) }),
    kr4: tile({ id: 'kr4', label: 'Opens that lead to a tip view', value: v4, valueText: v4 == null ? '—' : `${v4}%`, goal: g.kr4 * 100, goalText: `Goal ${Math.round(g.kr4 * 100)}%`,
      fill: v4 ?? 0, domain: 100, goalAt: g.kr4 * 100, sub: opens ? `${Math.min(eng, opens)} of ${plural(opens, 'open')} led to 10+ seconds on a tip` : 'Waiting for the first open',
      dots: null, delta: deltaFor(rates.map((r) => (r == null ? null : r * 100)), (x) => `${Math.round(x)}`, ' pts'), spark: thick(rates) ? sparkline(rates, 1) : null, sparkValues: rates.map((r) => (r == null ? null : Math.round(r * 100))), sparkLabels: ewTrim.map((r) => weekLabel(r.week_start)) }),
  };
  const groups = [
    { key: 'A', title: 'Tips are effective and helpful', tiles: [tiles.kr1, tiles.kr2] },
    { key: 'B', title: 'Teachers use PrepTip consistently', tiles: [tiles.kr3, tiles.kr4] },
  ];

  // weekly charts
  const trends = {
    opens: ewTrim.map((r) => ({ week: weekLabel(r.week_start), opens: n(r.opens), views: Math.min(n(r.engaged), n(r.opens)) })),
    teachers: uwTrim.map((r) => ({ week: weekLabel(r.week_start), teachers: n(r.teachers) })),
  };

  // what teachers tell us
  const reqs = (raw.requests || []).filter((r) => r.kind !== 'resource');
  const requests = rank(reqs.map((r) => ({ label: r.wording, site: r.site, requests: n(r.requests), teachers: n(r.teachers), last: r.last_requested })),
    (r) => r.requests, (r) => String(r.requests), (r) => [r.site || 'No site named', plural(r.teachers, 'teacher')].join(' · ')).slice(0, 6);
  const tipPerf = rank([...(raw.tipPerf || [])].sort((a, b) => (n(b.up) / Math.max(1, n(b.total))) - (n(a.up) / Math.max(1, n(a.total))) || n(b.total) - n(a.total))
    .map((t) => ({ label: t.title, up: n(t.up), total: n(t.total) })).slice(0, 6),
    (r) => (r.total ? r.up / r.total : 0) * 100, (r) => `${r.up} of ${r.total}`, () => '');
  tipPerf.forEach((r, i) => { r.width = Math.max(4, Math.round(r.value)); });

  // usage
  const resources = rank((raw.resources || []).map((r) => ({ label: r.label, opens: n(r.opens) })), (r) => r.opens, (r) => String(r.opens), () => '').slice(0, 5);
  const resourceTotal = (raw.resources || []).reduce((s, r) => s + n(r.opens), 0);
  const usage = { aiBuilt: n(raw.ai?.gemini), aiTeachers: n(raw.ai?.teachers), resourceTotal, resources, requestTotal: reqs.reduce((s, r) => s + n(r.requests), 0) };

  // product health (collapsed on the page)
  const es = raw.errors?.summary || {};
  const per100 = n(es.opens) > 0 ? Math.round((n(es.auto) / n(es.opens)) * 1000) / 10 : null;
  const health = { total: n(es.total), auto: n(es.auto), reported: n(es.reported), teachers: n(es.teachers), opens: n(es.opens), per100,
    trend: (raw.errors?.trend || []).map((d) => ({ day: d.day, n: n(d.n) })), groups: (raw.errors?.groups || []).slice(0, 5) };

  return { mode: raw.mode, asof: raw.asof, catalog: raw.catalog || {}, groups, tiles, trends, requests, tipPerf, usage, health, hasAnyData: [v1, v2, v3, v4].some((v) => v != null) };
}

// ------------------------------------------------------------------------------------------------------------
// SAMPLE data: invented, deterministic, and always shown under a "Sample data" banner. It exists so the layout can
// be seen fully populated. It is never written to the database and never mixed with live numbers.
export function mondays(count = 8, now = new Date()) {
  const d = new Date(now); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: count }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() - 7 * (count - 1 - i)); return x.toISOString().slice(0, 10); });
}

export function sampleRaw(now = new Date()) {
  const ws = mondays(8, now);
  const teachers = [0, 2, 4, 6, 8, 11, 14, 18], avg = [0, 0.5, 1.1, 1.6, 2.2, 2.6, 2.9, 3.2], qual = [0, 0, 1, 1, 3, 5, 8, 11];
  const opens = [0, 8, 14, 23, 31, 40, 52, 64], views = [0, 2, 5, 10, 15, 21, 29, 38];
  const ago = (h) => new Date(now.getTime() - h * 3600000).toISOString();
  return {
    mode: 'sample', asof: now, catalog: { tips: 109, sites: 14 },
    ratings: { up: 47, total: 52 }, completions: { started: 54, finished: 39 },
    usageWeeks: ws.map((w, i) => ({ week_start: w, teachers: teachers[i], qualifying: qual[i], avg_office_days: avg[i] })),
    engagement: { opens: opens.reduce((a, b) => a + b, 0), engaged: views.reduce((a, b) => a + b, 0) },
    engWeeks: ws.map((w, i) => ({ week_start: w, opens: opens[i], engaged: views[i] })),
    requests: [
      { kind: 'tip', site: 'Google Sheets', wording: 'Hide student names when sharing grades with parents', requests: 6, teachers: 5, last_requested: ago(5) },
      { kind: 'tip', site: 'Canva', wording: 'Make a printable seating chart', requests: 5, teachers: 4, last_requested: ago(20) },
      { kind: 'tip', site: 'Google Classroom', wording: 'Schedule an assignment to post next Monday', requests: 4, teachers: 4, last_requested: ago(31) },
      { kind: 'tip', site: 'YouTube', wording: 'Add captions to my own video', requests: 3, teachers: 3, last_requested: ago(52) },
      { kind: 'tip', site: 'Google Docs', wording: 'Make a rubric table students can fill in', requests: 3, teachers: 2, last_requested: ago(70) },
      { kind: 'tip', site: 'Kahoot!', wording: 'Reuse last year’s quiz with new questions', requests: 2, teachers: 2, last_requested: ago(96) },
    ],
    tipPerf: [
      { title: 'Color-code grades automatically', up: 19, total: 21 }, { title: 'Keep the header row visible', up: 14, total: 16 },
      { title: 'Turn on captions', up: 9, total: 11 }, { title: 'Average a row of scores', up: 11, total: 14 },
      { title: 'Share view-only with co-teachers', up: 6, total: 13 }, { title: 'Sort students A–Z safely', up: 5, total: 12 },
    ],
    resources: [{ label: 'Kahoot!', opens: 34 }, { label: 'Teachers Pay Teachers', opens: 21 }, { label: 'Edpuzzle', opens: 14 }, { label: 'Nearpod', opens: 9 }, { label: 'PhET Simulations', opens: 5 }],
    ai: { gemini: 23, teachers: 11 },
    errors: {
      summary: { total: 7, auto: 5, reported: 2, teachers: 4, opens: 232 },
      trend: Array.from({ length: 14 }, (_, i) => ({ day: new Date(now.getTime() - (13 - i) * 86400000).toISOString().slice(0, 10), n: [0, 1, 0, 0, 2, 0, 1, 0, 0, 1, 0, 2, 0, 0][i] })),
      groups: [
        { source: 'auto', detail: 'Couldn’t find “Conditional formatting” on the page', site_name: 'Google Sheets', n: 3, teachers: 3, last_seen: ago(8) },
        { source: 'reported', detail: 'The steps didn’t match my screen', site_name: 'Google Slides', n: 2, teachers: 2, last_seen: ago(30) },
        { source: 'auto', detail: 'Failed to fetch', site_name: null, n: 2, teachers: 2, last_seen: ago(70) },
      ],
    },
  };
}
