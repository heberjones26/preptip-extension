// PrepTip metrics dashboard — configuration.
// Same Supabase project and *publishable* key the extension ships (src/config.js): it's a public key,
// limited by RLS to reading the catalog and calling the whitelisted OKR functions. It cannot read raw
// feedback, users or events — only the aggregate totals the functions return.
export const SUPABASE_URL = 'https://eithnvohtxqzbqejxsor.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_sDe6DDTaHck8BsraqOPTTA_h3pkUZ2z';

// The team's OKR targets, in one place so they're easy to tune after Sprint 1.
// Objective A (tips are effective and helpful): KR1 thumbs-up %, KR2 completions.
// Objective B (teachers use the app consistently): KR3 days-open, KR4 tip-engagement. (Carlos owns B's data.)
export const OKR_CONFIG = {
  kr1: { floor: 5, target: 0.8 }, //   ≥80% 👍, needs ≥5 ratings to count
  kr2: { floor: 5, targetRate: 0.6 }, // of started walkthroughs, ≥60% finished (team to confirm)
  kr3: { targetDays: 3, ofDays: 5 }, //  opens the app ~3 of 5 office days (Carlos)
  kr4: { targetRate: 0.5 }, //           of opens, ≥50% lead to a ≥10s tip view (Carlos)
};
