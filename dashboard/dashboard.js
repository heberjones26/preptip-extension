// PrepTip metrics hub: fetch the live totals from Supabase (or build the labelled SAMPLE set), turn them into a view model
// (hub-model.js, pure and tested), and draw it. Live and sample share one render path, so the sample view is a true
// preview of the real page. Read-only: the publishable key can only call the whitelisted aggregate functions.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
import { buildModel, sampleRaw, plural, agoText } from './hub-model.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const params = new URLSearchParams(location.search);
let mode = params.get('data') === 'sample' || params.get('demo') === '1' ? 'sample' : 'live';
let model = null;

// ---- data ------------------------------------------------------------------------------------------------
async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
const rpc = (name, q = '') => rest(`rpc/${name}${q}`);
let failures = 0;
const safe = (p, fallback) => p.catch((err) => { failures += 1; console.info('hub: could not load', err.message); return fallback; });
const first = (rows) => (Array.isArray(rows) ? rows[0] : rows) || {};

async function fetchLive() {
  failures = 0;
  const [tips, sites, ratings, comp, usageWeeks, engagement, engWeeks, requests, resources, ai, eSum, eTrend, eGroups] = await Promise.all([
    safe(rest('tips?select=tip_id,title'), null), safe(rest('websites?select=url_pattern'), null),
    safe(rpc('tip_ratings'), []), safe(rpc('okr_tip_completions'), []),
    safe(rpc('okr_app_usage_weekly', '?p_weeks=8'), []), safe(rpc('okr_tip_engagement'), []), safe(rpc('okr_tip_engagement_weekly', '?p_weeks=8'), []),
    safe(rpc('requested_tips', '?p_days=90'), []), safe(rpc('resource_opens'), []), safe(rpc('ai_tip_summary', '?p_days=30'), []),
    safe(rpc('error_summary', '?p_days=30'), []), safe(rpc('error_trend', '?p_days=14'), []), safe(rpc('error_groups', '?p_days=30'), []),
  ]);
  const titles = Object.fromEntries((tips || []).map((t) => [t.tip_id, t.title]));
  const rt = ratings || [];
  const c = first(comp), e = first(engagement), a = first(ai);
  return {
    mode: 'live', asof: new Date(), loadFailed: failures,
    catalog: { tips: tips ? tips.length : null, sites: sites ? sites.length : null },
    ratings: { up: rt.reduce((s, r) => s + (Number(r.helpful_count) || 0), 0), total: rt.reduce((s, r) => s + (Number(r.rating_count) || 0), 0) },
    tipPerf: rt.map((r) => ({ title: titles[r.tip_id] || `Tip ${r.tip_id}`, up: r.helpful_count, total: r.rating_count })),
    completions: { started: c.opens, finished: c.completions },
    usageWeeks: usageWeeks || [], engagement: { opens: e.opens, engaged: e.engaged }, engWeeks: engWeeks || [],
    requests: requests || [], resources: resources || [], ai: { gemini: a.built_with_gemini, teachers: a.teachers },
    errors: { summary: first(eSum), trend: eTrend || [], groups: eGroups || [] },
  };
}

// ---- small pieces ------------------------------------------------------------------------------------------
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

function tileHtml(t) {
  const fillW = clamp((t.fill / t.domain) * 100), goalLeft = clamp((t.goalAt / t.domain) * 100);
  const foot = t.dots
    ? `<span class="dots${t.dots.length > 24 ? ' dense' : ''}" role="img" aria-label="${esc(t.sub)}">${t.dots.map((on) => `<i class="${on ? '' : 'off'}"></i>`).join('')}</span>
       <span class="key"><i></i>${esc(t.dotsKey[0])}<i class="off"></i>${esc(t.dotsKey[1])}</span>`
    : t.spark
      ? `<svg class="spark" width="${t.spark.w}" height="${t.spark.h}" viewBox="0 0 ${t.spark.w} ${t.spark.h}" role="img" aria-label="${esc(`${t.label}, by week: ${(t.sparkValues || []).map((v, i) => `${t.sparkLabels[i]} ${v == null ? 'none' : v}`).join(', ')}`)}"><path d="${t.spark.d}"></path><circle cx="${t.spark.last.x.toFixed(1)}" cy="${t.spark.last.y.toFixed(1)}" r="3.5"></circle></svg>
         ${t.delta ? `<span class="delta ${t.delta.dir > 0 ? 'up' : ''}">${esc(t.delta.text)}</span>` : ''}`
      : '';
  return `<article class="tile" aria-labelledby="t-${t.id}">
    <div class="tile-top"><h3 class="tile-label" id="t-${t.id}">${esc(t.label)}</h3><span class="chip chip-${t.status}"><i></i>${esc(t.statusText)}</span></div>
    <p class="tile-val"><span><span class="val">${esc(t.valueText)}</span>${t.unit ? `<span class="unit">${esc(t.unit)}</span>` : ''}</span><span class="goal">${esc(t.goalText)}</span></p>
    <div class="meter" role="img" aria-label="${esc(`${t.label}: ${t.valueText}. ${t.goalText}.`)}"><i style="width:${fillW}%"></i><b style="left:${goalLeft}%"></b></div>
    <p class="tile-sub">${esc(t.sub)}</p>
    ${foot ? `<div class="tile-foot">${foot}</div>` : ''}
  </article>`;
}

function rankHtml(rows, empty) {
  if (!rows.length) return `<p class="empty">${esc(empty)}</p>`;
  return `<ul class="rank">${rows.map((r) => `<li>
    <div class="rank-top"><span class="rank-label">${esc(r.label)}</span><span class="rank-val">${esc(r.valueText)}</span></div>
    <div class="rank-bar" aria-hidden="true"><i style="width:${clamp(r.width)}%"></i></div>
    ${r.sub ? `<div class="rank-sub">${esc(r.sub)}</div>` : ''}</li>`).join('')}</ul>`;
}

// ---- charts: thin columns, one accent plus gray, hairline grid, tooltip per column ------------------------------------
// axis top: always even, so the middle tick is a whole number
const niceMax = (v) => { if (v <= 4) return 4; if (v <= 6) return 6; if (v <= 8) return 8; if (v <= 10) return 10; const p = 10 ** Math.floor(Math.log10(v)); const f = v / p; return (f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
function barPath(x, y, w, h, r = 3) {
  if (h <= 0) return '';
  const k = Math.min(r, h, w / 2);
  return `M${x} ${y + h}V${y + k}Q${x} ${y} ${x + k} ${y}H${x + w - k}Q${x + w} ${y} ${x + w} ${y + k}V${y + h}Z`;
}
function columns({ rows, series, width, label }) {
  const H = 180, L = 30, R = 6, T = 8, B = 26, W = Math.max(260, width);
  const pw = W - L - R, ph = H - T - B, max = niceMax(Math.max(0, ...rows.flatMap((r) => series.map((s) => r[s.key]))));
  const y = (v) => T + ph - (v / max) * ph;
  const gw = pw / rows.length, bw = Math.min(22, (gw * 0.64 - (series.length - 1) * 3) / series.length);
  const step = gw < 44 ? 2 : 1;
  const ticks = [0, max / 2, max];
  const grid = ticks.map((t) => `<line class="${t === 0 ? 'axis' : 'grid'}" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"></line><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${Math.round(t)}</text>`).join('');
  const cols = rows.map((r, i) => {
    const x0 = L + i * gw, total = series.length * bw + (series.length - 1) * 3, bx = x0 + (gw - total) / 2;
    const bars = series.map((s, k) => `<path class="bar-${s.tone}" d="${barPath(+(bx + k * (bw + 3)).toFixed(1), +y(r[s.key]).toFixed(1), +bw.toFixed(1), +(ph - (y(r[s.key]) - T)).toFixed(1))}"></path>`).join('');
    const tip = `Week of ${r.week}: ${series.map((s) => `${r[s.key]} ${s.label.toLowerCase()}`).join(' · ')}`;
    return `<g class="col" data-tip="${esc(tip)}"><rect class="hit" x="${x0}" y="${T}" width="${gw}" height="${ph}"></rect>${bars}${i % step === 0 ? `<text x="${x0 + gw / 2}" y="${H - 8}" text-anchor="middle">${esc(r.week)}</text>` : ''}</g>`;
  }).join('');
  const table = `<table class="sr-only"><caption>${esc(label)}</caption><thead><tr><th>Week of</th>${series.map((s) => `<th>${esc(s.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.week)}</td>${series.map((s) => `<td>${r[s.key]}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${grid}${cols}</svg>${table}`;
}
function chartCard({ title, sub, rows, series, width, label }) {
  const any = rows.some((r) => series.some((s) => r[s.key] > 0));
  const legend = series.length > 1 ? `<ul class="legend">${series.map((s) => `<li><i class="sw ${s.tone === 'muted' ? 'muted' : ''}"></i>${esc(s.label)}</li>`).join('')}</ul>` : '';
  return `<div class="card"><h3 class="card-h">${esc(title)}</h3><p class="card-sub">${esc(sub)}</p>${legend}
    ${any ? `<div class="chart">${columns({ rows, series, width, label })}</div>` : `<p class="empty">No activity yet.</p>`}</div>`;
}

// ---- sections -------------------------------------------------------------------------------------------------
function render(m) {
  const sample = m.mode === 'sample';
  $('banner').hidden = !sample;
  for (const b of document.querySelectorAll('#mode [data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === m.mode));
  $('updated').textContent = sample ? 'Sample data' : `Updated ${m.asof.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  const cat = m.catalog.sites && m.catalog.tips ? ` ${m.catalog.sites} tools · ${m.catalog.tips} tips.` : '';
  $('lede').textContent = `How teachers use PrepTip, and what they tell us.${cat}`;

  // Key Results
  $('krs').innerHTML = m.loadFailed >= 6
    ? `<p class="empty">We couldn’t reach the data service. Check your connection and press Refresh.</p>`
    : m.groups.map((g) => `<div class="kr-group"><div class="kr-group-h"><span class="overline">Objective ${g.key}</span><h3>${esc(g.title)}</h3></div><div class="kr-tiles">${g.tiles.map(tileHtml).join('')}</div></div>`).join('');
  $('krs').setAttribute('aria-busy', 'false');

  // trends
  const wide = Math.floor((($('trends').clientWidth || 1100) - (matchMedia('(max-width: 760px)').matches ? 0 : 16)) / (matchMedia('(max-width: 760px)').matches ? 1 : 2)) - 42;
  $('trends').innerHTML =
    chartCard({ title: 'Panel opens and tip views', sub: 'Each week, how often teachers opened PrepTip and how many opens led to 10+ seconds on a tip.', rows: m.trends.opens,
      series: [{ key: 'opens', label: 'Panel opens', tone: 'muted' }, { key: 'views', label: 'Opens with a tip view', tone: 'accent' }], width: wide, label: 'Panel opens and tip views per week' }) +
    chartCard({ title: 'Active teachers', sub: 'Teachers who opened PrepTip at least once that week.', rows: m.trends.teachers,
      series: [{ key: 'teachers', label: 'Active teachers', tone: 'accent' }], width: wide, label: 'Active teachers per week' });
  $('trends').setAttribute('aria-busy', 'false');

  // what teachers tell us
  $('voice').innerHTML =
    `<div class="card"><h3 class="card-h">Requested tips</h3><p class="card-sub">Most-asked first. Links and personal details are removed; no names are shown.</p>${rankHtml(m.requests, 'No requests yet. Teachers can suggest a tip from the panel.')}</div>
     <div class="card"><h3 class="card-h">Tip feedback</h3><p class="card-sub">Share of each tip’s ratings that were thumbs-up, best first.</p>${rankHtml(m.tipPerf, 'No ratings yet. Teachers rate a tip when they finish it.')}</div>`;
  $('voice').setAttribute('aria-busy', 'false');

  // usage
  const u = m.usage;
  $('usage').innerHTML = `<div class="usage"><div>
      <h3 class="card-h">Features in use</h3><p class="card-sub">AI tips in the last 30 days; requests in the last 90.</p>
      <div class="stats" style="margin-top:14px">
        <div class="stat"><span class="overline">AI tips</span><p class="stat-v">${u.aiBuilt}</p><p class="stat-s">built by ${plural(u.aiTeachers, 'teacher')}</p></div>
        <div class="stat"><span class="overline">Resources</span><p class="stat-v">${u.resourceTotal}</p><p class="stat-s">links opened</p></div>
        <div class="stat"><span class="overline">Requests</span><p class="stat-v">${u.requestTotal}</p><p class="stat-s">tips asked for</p></div>
      </div></div>
      <div><h3 class="card-h">Most-opened resources</h3><p class="card-sub">Teacher-built sites teachers click through to.</p>${rankHtml(u.resources, 'No resource opens yet.')}</div></div>`;
  $('usage').setAttribute('aria-busy', 'false');

  // product health (collapsed)
  const h = m.health;
  $('health-sum').textContent = h.total ? `${plural(h.total, 'error')} in 30 days${h.per100 != null ? ` · ${h.per100} per 100 opens` : ''}` : 'No errors in 30 days';
  const issues = h.groups.length
    ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Issue</th><th>Where</th><th class="num">Times</th><th class="num">Teachers</th><th class="num">Last seen</th></tr></thead><tbody>${h.groups.map((g) => `<tr>
        <td>${esc(String(g.detail || '').slice(0, 120))}${g.source === 'reported' ? ' <span class="chip">Reported</span>' : ''}</td>
        <td>${esc([g.tip_title, g.site_name].filter(Boolean).join(' · ') || g.context || '—')}</td>
        <td class="num">${Number(g.n)}</td><td class="num">${Number(g.teachers)}</td><td class="num">${esc(agoText(g.last_seen))}</td></tr>`).join('')}</tbody></table></div>`
    : `<p class="empty">No errors recorded in the last 30 days.</p>`;
  $('health-body').innerHTML = `<div class="mini-row">
      <div class="stat"><span class="overline">Errors</span><p class="stat-v">${h.total}</p><p class="stat-s">${h.auto} automatic</p></div>
      <div class="stat"><span class="overline">Per 100 opens</span><p class="stat-v">${h.per100 == null ? '—' : h.per100}</p><p class="stat-s">${h.opens} opens</p></div>
      <div class="stat"><span class="overline">Teachers affected</span><p class="stat-v">${h.teachers}</p><p class="stat-s">at least one error</p></div>
      <div class="stat"><span class="overline">Reported by teachers</span><p class="stat-v">${h.reported}</p><p class="stat-s">via Report a problem</p></div></div>${issues}`;
}

async function load() {
  $('refresh').disabled = true;
  const raw = mode === 'sample' ? sampleRaw() : await fetchLive();
  raw.loadFailed = raw.loadFailed || 0;
  model = buildModel(raw);
  model.loadFailed = raw.loadFailed;
  render(model);
  $('refresh').disabled = false;
}

// ---- events ---------------------------------------------------------------------------------------------------
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b || b.dataset.mode === mode) return;
  mode = b.dataset.mode;
  const u = new URL(location.href); u.searchParams.delete('demo');
  mode === 'sample' ? u.searchParams.set('data', 'sample') : u.searchParams.delete('data');
  history.replaceState(null, '', u);
  load();
});
$('refresh').addEventListener('click', load);
let resizeTimer;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => model && render(model), 150); });

const tip = $('tip');
function showTip(e) {
  const el = e.target.closest?.('[data-tip]');
  if (!el) { tip.hidden = true; return; }
  tip.textContent = el.dataset.tip; tip.hidden = false;
  const r = tip.getBoundingClientRect();
  tip.style.left = `${Math.min(innerWidth - r.width - 8, Math.max(8, e.clientX + 12))}px`;
  tip.style.top = `${Math.max(8, e.clientY - r.height - 12)}px`;
}
document.addEventListener('pointermove', showTip);
document.addEventListener('pointerleave', () => { tip.hidden = true; });

load();
