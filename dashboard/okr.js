// Pure OKR math for the PrepTip metrics dashboard.
// No DOM, no network — just the numbers — so it can be unit-tested with `node --test`.
// The dashboard (dashboard.js) fetches the raw totals from Supabase and feeds them in here.

// A Key Result's status. 'insufficient' = not enough data to judge yet (below the response floor);
// 'on-track' = meeting the target; 'below' = short of it.
export function okrStatus(value, target, { enough = true } = {}) {
  if (!enough) return 'insufficient';
  return value >= target ? 'on-track' : 'below';
}

// OKR 1 (Objective A, KR1): "80% thumbs up on average, with a floor of 5–10 responses."
// ratings: { [tip_id]: { helpful, total } } — the shape getTipRatings()/rpc/tip_ratings returns,
// where `total` counts every 👍/👎 (is_helpful IS NOT NULL) and `helpful` counts only 👍.
// We sum across every tip to get one program-wide number. The floor guards against calling it
// "100%" off a single rating.
export function okr1FromRatings(ratings, { floor = 5, target = 0.8 } = {}) {
  let helpful = 0;
  let total = 0;
  for (const r of Object.values(ratings || {})) {
    helpful += Number(r?.helpful) || 0;
    total += Number(r?.total) || 0;
  }
  const enough = total >= floor;
  const pct = total > 0 ? helpful / total : null;
  return {
    helpful,
    total,
    pct, // 0..1, or null when there are no ratings yet
    target, // 0..1
    floor,
    enough,
    status: okrStatus(pct ?? 0, target, { enough }),
  };
}

// OKR 2 (Objective A, KR2): "the amount of tips that go through 100% of the steps."
// events: { opens, completions } from rpc/okr_tip_completions — opens = walkthroughs started
// (tip_open), completions = walkthroughs finished to the last step (tip_complete).
// The headline number is the raw completion COUNT; completion RATE (completions / opens) is the
// secondary signal. targetRate is the team's to set — it's surfaced, not invented, so it lives in
// config and defaults here only so the bar can render.
export function okr2FromEvents(events, { floor = 5, targetRate = 0.6 } = {}) {
  const opens = Number(events?.opens) || 0;
  const completions = Number(events?.completions) || 0;
  const enough = opens >= floor;
  const rate = opens > 0 ? completions / opens : null;
  return {
    opens,
    completions, // the KR headline: how many tips were completed end-to-end
    rate, // 0..1, or null before anyone starts a walkthrough
    targetRate,
    floor,
    enough,
    status: okrStatus(rate ?? 0, targetRate, { enough }),
  };
}

// Format a 0..1 fraction as a whole-percent string, or a dash when there's no value yet.
export function pctLabel(fraction) {
  if (fraction == null || Number.isNaN(fraction)) return '—';
  return `${Math.round(fraction * 100)}%`;
}

// --- OKR 3 / OKR 4 over time -----------------------------------------------------------------
// The weekly rows come from rpc/okr_app_usage_weekly and rpc/okr_tip_engagement_weekly (oldest
// first, empty weeks included). These turn them into what the chart draws. The newest week is
// still in progress, so it is flagged `partial` and never judged against the target on its own.

// OKR 3: average office days opened per teacher, per week. `value` is 0..ofDays.
export function kr3Weeks(rows, { targetDays = 3, ofDays = 5 } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  return list.map((r, i) => {
    const teachers = Number(r?.teachers) || 0;
    const value = teachers ? Math.min(ofDays, Math.max(0, Number(r?.avg_office_days) || 0)) : null;
    return {
      weekStart: String(r?.week_start ?? ''),
      value,
      teachers,
      qualifying: Number(r?.qualifying) || 0,
      hit: value != null && value >= targetDays,
      partial: i === list.length - 1,
    };
  });
}

// OKR 4: share of panel openings that led to a >10s tip view, per week. `value` is 0..1, or null
// for a week with no openings (an empty week is not "0%").
export function kr4Weeks(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list.map((r, i) => {
    const opens = Number(r?.opens) || 0;
    const engaged = Number(r?.engaged) || 0;
    return {
      weekStart: String(r?.week_start ?? ''),
      value: opens ? Math.min(1, engaged / opens) : null,
      opens,
      engaged,
      partial: i === list.length - 1,
    };
  });
}

// "1 teacher on 3 days, 2 on 1 day, 1 on weekends only": this week's spread for OKR 3.
export function daysSpread(rows) {
  const parts = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    const n = Number(r?.teachers) || 0;
    const d = Number(r?.office_days);
    if (!n || !Number.isInteger(d)) continue;
    const who = `${n} teacher${n === 1 ? '' : 's'}`;
    parts.push(d === 0 ? `${who} on weekends only` : `${who} on ${d} office day${d === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}
