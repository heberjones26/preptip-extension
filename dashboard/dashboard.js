// PrepTip metrics dashboard — fetch the live OKR totals from Supabase and render the dashboard.
// Layout: a hero figure + KPI stat-tile strip (at-a-glance), then the Objective detail cards.
// The math lives in okr.js (pure, tested); this file only does I/O and DOM.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, OKR_CONFIG } from './config.js';
import { okr1FromRatings, okr2FromEvents, pctLabel } from './okr.js';

// ?demo=1 feeds representative numbers through the SAME render path (no network, no DB writes), so we
// can see the on-track / below states and screenshot the design before teachers have generated data.
const DEMO = new URLSearchParams(location.search).get('demo') === '1';

// Carries each KR's computed result so the hero + KPI strip can summarise after the cards render.
const summary = { okr1: null, okr2: null };

// --- Supabase REST (read-only; same publishable key the extension uses) ---------------------
async function rest(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
const rpc = (name) => rest(`rpc/${name}`);

// --- Small HTML helpers ----------------------------------------------------------------------
const BADGE = {
  'on-track': { cls: 'ok', label: 'On track', tone: 'ok' },
  below: { cls: 'low', label: 'Below target', tone: 'low' },
  insufficient: { cls: 'wait', label: 'Not enough data', tone: 'wait' },
  awaiting: { cls: 'wait', label: 'Awaiting data', tone: 'wait' },
  error: { cls: 'low', label: "Couldn't load", tone: 'low' },
};
const toneOf = (status) => (BADGE[status] || BADGE.awaiting).tone;

function badge(status) {
  const b = BADGE[status] || BADGE.awaiting;
  return `<span class="badge ${b.cls}">${b.label}</span>`;
}

// A value + a labelled meter + a caption. `pct` 0..1 fills the bar; `target` 0..1 draws a tick.
// The fill colour follows status (green / red / neutral) — the Domo-style status meter.
function meter({ value, unit = '', status, pct, target, caption, barLabel }) {
  const fill = pct == null ? 0 : Math.max(0, Math.min(100, Math.round(pct * 100)));
  const tick = target == null ? '' : `<span class="tick" style="left:${Math.round(target * 100)}%" aria-hidden="true"></span>`;
  const bar =
    pct == null
      ? ''
      : `<div class="bar" data-tone="${toneOf(status)}" role="progressbar" aria-label="${barLabel}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${fill}">
           <i style="width:${fill}%"></i>${tick}
         </div>`;
  return `
    <div class="kr-top">
      <span class="kr-val">${value}<small>${unit}</small></span>
      ${badge(status)}
    </div>
    ${bar}
    <p class="kr-cap">${caption}</p>`;
}

function setCard(id, html, status) {
  const el = document.getElementById(id);
  if (!el) return;
  el.querySelector('.kr-body').innerHTML = html;
  el.setAttribute('aria-busy', 'false');
  if (status) el.dataset.status = status; // drives the left-accent border + the on-track tally
}

function awaiting(id, caption) {
  setCard(id, meter({ value: '—', status: 'awaiting', pct: null, caption }), 'awaiting');
}

// --- OKR 1: thumbs-up rate (live now, from rpc/tip_ratings) ----------------------------------
async function renderKr1() {
  try {
    let ratings;
    if (DEMO) {
      ratings = { 1: { helpful: 25, total: 30 }, 2: { helpful: 9, total: 11 } }; // ~83%
    } else {
      const rows = await rpc('tip_ratings'); // [{ tip_id, helpful_count, rating_count }]
      ratings = Object.fromEntries(
        (rows || []).map((r) => [r.tip_id, { helpful: r.helpful_count, total: r.rating_count }]),
      );
    }
    const m = okr1FromRatings(ratings, OKR_CONFIG.kr1);
    summary.okr1 = m;
    const caption = m.enough
      ? `${m.helpful} of ${m.total} ratings were 👍 · target ${pctLabel(m.target)}`
      : `${m.total} of ${m.floor} ratings needed before this counts`;
    setCard('kr1', meter({
      value: pctLabel(m.pct), status: m.status, pct: m.pct, target: m.target,
      caption, barLabel: 'Thumbs-up rate toward 80% target',
    }), m.status);
  } catch (err) {
    console.warn('kr1 failed', err);
    setCard('kr1', meter({ value: '—', status: 'error', pct: null, caption: 'Could not reach the ratings data.' }), 'error');
  }
}

// --- OKR 2: tips completed end-to-end (needs rpc/okr_tip_completions + the events table) ------
async function renderKr2() {
  try {
    let totals;
    if (DEMO) {
      totals = { opens: 40, completions: 26 }; // 65%
    } else {
      const rows = await rpc('okr_tip_completions'); // [{ opens, completions }]
      totals = Array.isArray(rows) ? rows[0] : rows;
    }
    const m = okr2FromEvents(totals || {}, OKR_CONFIG.kr2);
    summary.okr2 = m;
    const caption = m.enough
      ? `${m.completions} finished of ${m.opens} started · ${pctLabel(m.rate)} completion · target ${pctLabel(m.targetRate)}`
      : `${m.opens} of ${m.floor} started walkthroughs needed before this counts`;
    setCard('kr2', meter({
      value: String(m.completions), unit: ' done', status: m.status, pct: m.rate, target: m.targetRate,
      caption, barLabel: 'Walkthrough completion rate',
    }), m.status);
  } catch (err) {
    console.warn('kr2 not available yet', err);
    awaiting('kr2', 'Live once the events table + okr_tip_completions() are applied.');
  }
}

// --- Objective B (Carlos's tracking): attempt, otherwise show "awaiting" ----------------------
// OKR 3: avg office days (Mon–Fri) the app is opened per teacher this week (from rpc/okr_app_usage).
async function renderKr3() {
  const { targetDays, ofDays } = OKR_CONFIG.kr3;
  try {
    let row;
    if (DEMO) row = { teachers: 5, qualifying: 3, avg_office_days: 3.4 };
    else { const rows = await rpc('okr_app_usage'); row = Array.isArray(rows) ? rows[0] : rows; }
    const teachers = Number(row?.teachers) || 0;
    const avg = Number(row?.avg_office_days) || 0;
    const qualifying = Number(row?.qualifying) || 0;
    if (!teachers) return awaiting('kr3', 'No app opens tracked this week yet.');
    const status = avg >= targetDays ? 'on-track' : 'below';
    setCard('kr3', meter({
      value: avg.toFixed(1), unit: ` / ${ofDays} days`, status, pct: avg / ofDays, target: targetDays / ofDays,
      caption: `${qualifying} of ${teachers} teachers opened on ≥${targetDays} office days this week`,
      barLabel: 'Average office days opened this week',
    }), status);
  } catch (err) {
    console.warn('kr3 not available yet', err);
    awaiting('kr3', 'Lives once the events migration + okr_app_usage() are applied.');
  }
}

// OKR 4: of app opens, the share that lead to a ≥10s tip view (from rpc/okr_tip_engagement).
async function renderKr4() {
  const { targetRate } = OKR_CONFIG.kr4;
  try {
    let row;
    if (DEMO) row = { opens: 50, engaged: 22 };
    else { const rows = await rpc('okr_tip_engagement'); row = Array.isArray(rows) ? rows[0] : rows; }
    const opens = Number(row?.opens) || 0;
    const engaged = Number(row?.engaged) || 0;
    if (!opens) return awaiting('kr4', 'No app opens tracked yet.');
    const rate = engaged / opens;
    const status = rate >= targetRate ? 'on-track' : 'below';
    setCard('kr4', meter({
      value: pctLabel(rate), status, pct: rate, target: targetRate,
      caption: `${engaged} of ${opens} opens led to a ≥10s tip view · target ${pctLabel(targetRate)}`,
      barLabel: 'Tip-engagement rate',
    }), status);
  } catch (err) {
    console.warn('kr4 not available yet', err);
    awaiting('kr4', 'Lives once the events migration + okr_tip_engagement() are applied.');
  }
}

// --- Catalog counts for the KPI strip (anon key can read websites + tips) --------------------
async function fetchCounts() {
  if (DEMO) return { tips: 60, sites: 7 };
  try {
    const [tips, sites] = await Promise.all([rest('tips?select=tip_id'), rest('websites?select=url_pattern')]);
    return { tips: tips?.length ?? null, sites: sites?.length ?? null };
  } catch {
    return { tips: null, sites: null };
  }
}

// --- Hero + KPI strip (summarise after the detail cards have rendered) -----------------------
const statusOf = (id) => document.getElementById(id)?.dataset.status || 'awaiting';
const num = (v) => (v == null ? '—' : String(v));

function renderHero() {
  const m = summary.okr1;
  const el = document.getElementById('hero');
  if (!el) return;
  const status = m ? m.status : 'error';
  const value = m ? pctLabel(m.pct) : '—';
  const note = !m
    ? 'Could not reach the ratings data.'
    : m.enough
      ? `${m.helpful} of ${m.total} tip ratings were a thumbs-up.`
      : `No ratings yet — ${m.total} of ${m.floor} needed before this is meaningful.`;
  const pct = m?.pct ?? null;
  const fill = pct == null ? 0 : Math.max(0, Math.min(100, Math.round(pct * 100)));
  el.innerHTML = `
    <p class="hero-over">Sprint 1 · flagship result</p>
    <div class="hero-row">
      <span class="hero-val">${value}</span>
      ${badge(status)}
    </div>
    <p class="hero-label">of tips are rated helpful <span class="muted">· target 80%</span></p>
    <div class="bar lg" data-tone="${toneOf(status)}" role="progressbar" aria-label="Thumbs-up rate toward 80% target" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${fill}">
      <i style="width:${fill}%"></i><span class="tick" style="left:80%" aria-hidden="true"></span>
    </div>
    <p class="hero-note">${note}</p>`;
  el.setAttribute('aria-busy', 'false');
}

function kpiTile({ label, value, sub, tone = '' }) {
  return `
    <div class="kpi${tone ? ` t-${tone}` : ''}">
      <p class="kpi-label">${label}</p>
      <p class="kpi-val">${value}</p>
      <p class="kpi-sub">${sub}</p>
    </div>`;
}

function renderKpis(counts) {
  const el = document.getElementById('kpis');
  if (!el) return;
  const statuses = ['kr1', 'kr2', 'kr3', 'kr4'].map(statusOf);
  const onTrack = statuses.filter((s) => s === 'on-track').length;
  const completions = summary.okr2 ? summary.okr2.completions : null;
  el.innerHTML = [
    kpiTile({ label: 'Key Results on track', value: `${onTrack}<small>/4</small>`, sub: 'across both objectives',
      tone: onTrack >= 3 ? 'ok' : onTrack === 0 ? 'wait' : 'low' }),
    kpiTile({ label: 'Tips completed', value: num(completions), sub: 'walkthroughs finished 100%' }),
    kpiTile({ label: 'Tips available', value: num(counts.tips), sub: 'in the live catalog' }),
    kpiTile({ label: 'Sites supported', value: num(counts.sites), sub: 'with guided tips' }),
  ].join('');
  el.setAttribute('aria-busy', 'false');
}

function setObjSub(id, ids) {
  const el = document.getElementById(id);
  if (!el) return;
  const on = ids.filter((k) => statusOf(k) === 'on-track').length;
  el.textContent = `${on} of ${ids.length} on track`;
}

// --- Insight panels ---------------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function setPanel(id, html) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = html;
  el.setAttribute('aria-busy', 'false');
}

// Which tips are landing: most/least helpful by thumbs-up rate (min 3 ratings).
function paintTipPerf(perf) {
  const rated = perf.filter((p) => p.total >= 3).map((p) => ({ ...p, rate: p.helpful / p.total }));
  if (!rated.length) {
    return setPanel('tipperf', `<p class="muted-note">No tips have 3+ ratings yet — this fills in as teachers rate tips.</p>`);
  }
  const sorted = [...rated].sort((a, b) => b.rate - a.rate);
  const row = (p, tone) => `<li><span class="perf-name">${esc(p.title)}</span><span class="perf-val t-${tone}">${Math.round(p.rate * 100)}%</span><span class="perf-n">${p.total} ratings</span></li>`;
  const top = sorted.slice(0, 3);
  const bottom = sorted.length > 3 ? sorted.slice(-3).reverse() : [];
  setPanel('tipperf', `
    <div class="perf-cols">
      <div><h3 class="perf-h">Most helpful</h3><ul class="perf-list">${top.map((p) => row(p, 'ok')).join('')}</ul></div>
      ${bottom.length ? `<div><h3 class="perf-h">Needs attention</h3><ul class="perf-list">${bottom.map((p) => row(p, 'low')).join('')}</ul></div>` : ''}
    </div>`);
}

async function renderTipPerf() {
  try {
    if (DEMO) {
      return paintTipPerf([
        { title: 'Color-code grades automatically', helpful: 19, total: 21 },
        { title: 'Keep the header row visible', helpful: 14, total: 16 },
        { title: 'Average a row of scores', helpful: 11, total: 14 },
        { title: 'Share view-only with co-teachers', helpful: 6, total: 13 },
        { title: 'Sort students A–Z safely', helpful: 4, total: 12 },
      ]);
    }
    const [rows, titles] = await Promise.all([rpc('tip_ratings'), rest('tips?select=tip_id,title')]);
    const titleById = Object.fromEntries((titles || []).map((t) => [t.tip_id, t.title]));
    paintTipPerf((rows || []).map((r) => ({ title: titleById[r.tip_id] || `Tip ${r.tip_id}`, helpful: r.helpful_count, total: r.rating_count })));
  } catch (err) {
    console.warn('tip perf failed', err);
    setPanel('tipperf', `<p class="muted-note">Couldn't load tip ratings right now.</p>`);
  }
}

// Most-opened resources (from rpc/resource_opens; needs the events migration applied).
async function renderResourcePopularity() {
  try {
    let rows;
    if (DEMO) {
      rows = [{ label: 'Kahoot!', opens: 34 }, { label: 'Teachers Pay Teachers', opens: 21 }, { label: 'Edpuzzle', opens: 14 }, { label: 'Nearpod', opens: 9 }, { label: 'PhET Interactive Simulations', opens: 5 }];
    } else {
      rows = await rpc('resource_opens');
    }
    if (!rows || !rows.length) {
      return setPanel('respop', `<p class="muted-note">No resource opens tracked yet.${DEMO ? '' : ' Lives once the events migration is applied and teachers open resources.'}</p>`);
    }
    const max = Math.max(...rows.map((r) => r.opens));
    setPanel('respop', `<ul class="pop-list">${rows.slice(0, 6).map((r) => `
      <li><span class="pop-name">${esc(r.label)}</span>
      <span class="pop-bar" aria-hidden="true"><i style="width:${Math.round((r.opens / max) * 100)}%"></i></span>
      <span class="pop-n">${r.opens}</span></li>`).join('')}</ul>`);
  } catch (err) {
    console.warn('resource popularity not available yet', err);
    setPanel('respop', `<p class="muted-note">Lives once the events migration is applied.</p>`);
  }
}

// --- Error log (rpc/error_summary, error_trend, error_groups; needs the error_log migration) ----
let errDays = 7;

const ERR_CATEGORY = {
  load: 'Tips wouldn’t load',
  network: 'Saves that failed',
  guide: 'Guided steps',
  ui: 'Panel crashes',
  account: 'Sign-in',
  other: 'Other',
};

// "2h ago", "3d ago" — enough to see whether an issue is still happening.
function ago(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (!Number.isFinite(mins)) return '—';
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 60 * 48) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

// Deterministic demo numbers so ?demo=1 always looks the same.
function demoErrorData(days) {
  const trend = Array.from({ length: days }, (_, i) => {
    const day = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
    return { day, n: [1, 0, 3, 4, 2, 6, 7, 2, 0, 5][i % 10] };
  });
  const h = (n) => new Date(Date.now() - n * 3600000).toISOString();
  return {
    summary: { total: days === 7 ? 23 : 71, auto: days === 7 ? 17 : 52, reported: days === 7 ? 6 : 19, teachers: days === 7 ? 9 : 18, opens: days === 7 ? 212 : 640 },
    trend,
    groups: [
      { source: 'auto', category: 'guide', context: 'target-not-found step 2', detail: 'Couldn’t find “Format > Conditional formatting” (menu) on the page', tip_title: 'Color-code grades automatically', site_name: 'Google Sheets', n: 8, teachers: 5, last_seen: h(2) },
      { source: 'auto', category: 'load', context: 'catalog', detail: 'Failed to fetch', tip_title: null, site_name: null, n: 5, teachers: 3, last_seen: h(20) },
      { source: 'reported', category: 'guide', context: 'teacher-report', detail: 'The steps didn’t match my screen', tip_title: 'Average a row of scores', site_name: 'Google Sheets', n: 4, teachers: 4, last_seen: h(7) },
      { source: 'auto', category: 'network', context: 'feedback', detail: 'Supabase POST feedback failed (503)', tip_title: 'Keep the header row visible', site_name: 'Google Sheets', n: 2, teachers: 2, last_seen: h(51) },
      { source: 'reported', category: 'guide', context: 'teacher-report', detail: 'The highlight was in the wrong place', tip_title: 'Share view-only with co-teachers', site_name: 'Google Sheets', n: 2, teachers: 2, last_seen: h(30) },
      { source: 'auto', category: 'ui', context: 'script-error', detail: 'Cannot read properties of undefined', tip_title: null, site_name: null, n: 1, teachers: 1, last_seen: h(90) },
    ],
  };
}

function trendChart(trend) {
  const counts = trend.map((d) => Number(d.n) || 0);
  const max = Math.max(1, ...counts);
  const fmt = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const cols = trend.map((d, i) => `
    <span class="tcol" title="${esc(fmt(d.day))}: ${counts[i]} error${counts[i] === 1 ? '' : 's'}">
      <i class="${counts[i] ? '' : 'zero'}" style="height:${counts[i] ? Math.max(6, Math.round((counts[i] / max) * 100)) : 3}%"></i>
    </span>`).join('');
  const label = `Errors per day, ${trend.length} days: ${counts.join(', ')}`;
  return `
    <div class="trend" role="img" aria-label="${esc(label)}" style="grid-template-columns:repeat(${trend.length}, 1fr)">${cols}</div>
    <div class="trend-axis" aria-hidden="true"><span>${esc(fmt(trend[0].day))}</span><span>peak ${max}/day</span><span>${esc(fmt(trend[trend.length - 1].day))}</span></div>`;
}

function categoryBars(groups) {
  const totals = {};
  for (const g of groups) totals[g.category] = (totals[g.category] || 0) + Number(g.n);
  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return '';
  const max = rows[0][1];
  return `<ul class="pop-list">${rows.map(([cat, n]) => `
    <li><span class="pop-name">${esc(ERR_CATEGORY[cat] || cat)}</span>
    <span class="pop-bar" aria-hidden="true"><i style="width:${Math.round((n / max) * 100)}%"></i></span>
    <span class="pop-n">${n}</span></li>`).join('')}</ul>`;
}

function issuesTable(groups, days) {
  const rows = groups.slice(0, 10).map((g) => {
    const where = [g.tip_title, g.site_name].filter(Boolean).join(' · ') || (g.context || '—');
    const text = String(g.detail || '').slice(0, 140);
    return `
      <tr>
        <td><span class="badge ${g.source === 'reported' ? 'rep' : 'wait'}">${g.source === 'reported' ? 'Reported' : 'Auto'}</span>
            <span class="issue-text">${esc(text)}</span>
            <span class="issue-cat">${esc(ERR_CATEGORY[g.category] || g.category)}${g.context && g.context !== 'teacher-report' ? ` · ${esc(g.context)}` : ''}</span></td>
        <td>${esc(where)}</td>
        <td class="num">${Number(g.n)}</td>
        <td class="num">${Number(g.teachers)}</td>
        <td class="nowrap">${esc(ago(g.last_seen))}</td>
      </tr>`;
  }).join('');
  return `
    <div class="table-wrap" tabindex="0" role="region" aria-label="Most frequent problems (scrolls sideways on small screens)">
      <table class="err-table">
        <caption class="sr-only">Most frequent problems in the last ${days} days</caption>
        <thead><tr><th scope="col">Issue</th><th scope="col">Where</th><th scope="col" class="num">Times</th><th scope="col" class="num">Teachers</th><th scope="col">Last seen</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="muted-note small">What teachers typed in their reports isn’t shown here; it’s in the Supabase <code>error_log</code> table.</p>`;
}

function paintErrorLog(summary, trend, groups, days) {
  const total = Number(summary?.total) || 0;
  const auto = Number(summary?.auto) || 0;
  const opens = Number(summary?.opens) || 0;
  const per100 = opens > 0 ? (auto / opens) * 100 : null;
  const tiles = [
    { label: 'Errors', value: total, sub: `${auto} automatic` },
    { label: 'Per 100 app opens', value: per100 == null ? '—' : per100.toFixed(1), sub: per100 == null ? 'no opens tracked yet' : `${opens} opens` },
    { label: 'Teachers affected', value: Number(summary?.teachers) || 0, sub: 'with at least one error' },
    { label: 'Reported by teachers', value: Number(summary?.reported) || 0, sub: 'via “Report a problem”' },
  ].map((t) => `
    <div class="mini"><p class="kpi-label">${esc(t.label)}</p><p class="mini-val">${esc(String(t.value))}</p><p class="kpi-sub">${esc(t.sub)}</p></div>`).join('');

  if (!total) {
    return setPanel('errlog', `<div class="mini-row">${tiles}</div><p class="muted-note">No errors recorded in the last ${days} days.</p>`);
  }
  setPanel('errlog', `
    <div class="mini-row">${tiles}</div>
    <div class="err-cols">
      <div><h3 class="perf-h">Errors per day</h3>${trend.length ? trendChart(trend) : ''}</div>
      <div><h3 class="perf-h">What kind</h3>${categoryBars(groups)}</div>
    </div>
    <h3 class="perf-h issues-h">Most frequent issues</h3>
    ${issuesTable(groups, days)}`);
}

async function renderErrorLog() {
  const days = errDays;
  try {
    let summary, trend, groups;
    if (DEMO) {
      ({ summary, trend, groups } = demoErrorData(days));
    } else {
      const [s, t, g] = await Promise.all([
        rpc(`error_summary?p_days=${days}`), rpc(`error_trend?p_days=${days}`), rpc(`error_groups?p_days=${days}`),
      ]);
      summary = Array.isArray(s) ? s[0] : s;
      trend = t || [];
      groups = g || [];
    }
    if (days !== errDays) return; // the window changed while this was loading
    paintErrorLog(summary, trend, groups, days);
  } catch (err) {
    console.warn('error log not available yet', err);
    setPanel('errlog', `<p class="muted-note">Lives once the error_log migration is applied.</p>`);
  }
}

document.getElementById('errlog-days')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-days]');
  if (!btn) return;
  errDays = Number(btn.dataset.days);
  for (const b of document.querySelectorAll('#errlog-days [data-days]')) {
    const on = b === btn;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
  renderErrorLog();
});

// --- AI tip builder usage (rpc/ai_tip_summary; needs the ai_tip_events migration) --------------
async function renderAiBuilder() {
  try {
    let row;
    if (DEMO) row = { prompts_copied: 41, built_from_paste: 27, built_with_gemini: 9, teachers: 14 };
    else { const rows = await rpc('ai_tip_summary?p_days=30'); row = Array.isArray(rows) ? rows[0] : rows; }
    const n = (v) => Number(v) || 0;
    const tiles = [
      { label: 'Prompts copied', value: n(row?.prompts_copied), sub: 'to ChatGPT, Claude or Gemini' },
      { label: 'Tips from pasted answers', value: n(row?.built_from_paste), sub: 'copy and paste path' },
      { label: 'Tips from Gemini', value: n(row?.built_with_gemini), sub: 'with the teacher’s own key' },
      { label: 'Teachers using it', value: n(row?.teachers), sub: 'at least once' },
    ].map((t) => `
      <div class="mini"><p class="kpi-label">${esc(t.label)}</p><p class="mini-val">${t.value}</p><p class="kpi-sub">${esc(t.sub)}</p></div>`).join('');
    const none = !n(row?.prompts_copied) && !n(row?.built_from_paste) && !n(row?.built_with_gemini);
    setPanel('aibuilder', `<div class="mini-row">${tiles}</div>${none ? '<p class="muted-note">No AI tips built yet.</p>' : ''}`);
  } catch (err) {
    console.warn('ai builder stats not available yet', err);
    setPanel('aibuilder', `<p class="muted-note">Lives once the ai_tip_events migration is applied.</p>`);
  }
}

// --- Orchestration ---------------------------------------------------------------------------
async function load() {
  const updated = document.getElementById('updated');
  if (updated) updated.textContent = '';
  const [counts] = await Promise.all([
    fetchCounts(),
    Promise.allSettled([renderKr1(), renderKr2(), renderKr3(), renderKr4(), renderTipPerf(), renderResourcePopularity(), renderErrorLog(), renderAiBuilder()]),
  ]);
  renderHero();
  renderKpis(counts);
  setObjSub('obj-a-sub', ['kr1', 'kr2']);
  setObjSub('obj-b-sub', ['kr3', 'kr4']);
  if (updated) {
    if (DEMO) {
      updated.textContent = 'Demo data — not live';
      updated.classList.add('demo');
    } else {
      const now = new Date();
      updated.textContent = `Updated ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }
  }
}

document.getElementById('refresh')?.addEventListener('click', load);
load();
