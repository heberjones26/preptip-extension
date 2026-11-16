// PrepTip metrics dashboard — configuration.
// Same Supabase project and *publishable* key the extension ships (src/config.js): it's a public key,
// limited by RLS to reading the catalog and calling the whitelisted OKR functions. It cannot read raw
// feedback, users or events — only the aggregate totals the functions return.
export const SUPABASE_URL = 'https://eithnvohtxqzbqejxsor.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_sDe6DDTaHck8BsraqOPTTA_h3pkUZ2z';

// The team's OKR targets, in one place so they're easy to tune.
// Objective A (tips are effective and helpful): KR1 thumbs-up %, KR2 walkthroughs finished.
// Objective B (teachers use the app consistently): KR3 days opened, KR4 opens that lead to a tip view.
// There are no minimum amounts of data: a number is shown as it is, with its sample size beside it.
// (`floor` is kept only because okr.js still supports it; the hub does not use it.)
export const OKR_CONFIG = {
  kr1: { floor: 1, target: 0.8 }, //   >=80% thumbs-up
  kr2: { floor: 1, targetRate: 0.6 }, // >=60% of started walkthroughs finished (team to confirm)
  kr3: { targetDays: 3, ofDays: 5 }, //  opens the app ~3 of 5 work days
  kr4: { targetRate: 0.5 }, //           >=50% of opens lead to a 10s+ tip view
};
