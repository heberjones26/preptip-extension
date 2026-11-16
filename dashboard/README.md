# PrepTip OKR Dashboard

A small static page the team uses to watch our Sprint OKRs. It reads **aggregate** numbers from the
same Supabase project the extension uses (via the public publishable key) and shows each Key Result
against its target. No build step, no framework — plain HTML/CSS/JS, same as the extension.

It lives outside the extension on purpose: a dashboard needs to be responsive and live on the web,
which a fixed-width Chrome side panel can't be.

## What it shows

One page, four sections. Live and sample data go through the same code, so the sample view is a true preview.

| Section | What it answers | Source |
|---|---|---|
| **Key Results** (4 stat tiles, grouped by Objective) | Value, goal, status and the sample size behind each number. Thumbs-up rate and walkthroughs finished show one dot per rating/walkthrough; days opened and tip views add a weekly sparkline once there are 3 weeks of data | `rpc/tip_ratings`, `okr_tip_completions`, `okr_app_usage_weekly`, `okr_tip_engagement`, `okr_tip_engagement_weekly` |
| **Activity by week** | Panel opens vs opens that led to a tip view, and active teachers, per week | `okr_tip_engagement_weekly`, `okr_app_usage_weekly` |
| **What teachers tell us** | Requested tips (scrubbed wording, most-asked first) and tip feedback (share thumbs-up per tip) | `rpc/requested_tips`, `tip_ratings` |
| **How teachers use PrepTip** | AI tips built, resource opens, requests, most-opened resources | `rpc/ai_tip_summary`, `resource_opens`, `requested_tips` |
| *Product health* (collapsed) | Errors, errors per 100 opens, teachers affected, top issues | `rpc/error_summary`, `error_groups` |
| *How each number is measured* (collapsed) | Plain-language definitions | static |

**No minimum amounts of data.** A small number is shown as it is, with its sample size beside it ("1 rating",
"7 of 10 started"), instead of hiding it behind a "not enough data" state. Status is only value against goal:
*On track*, *Below goal*, or *No data yet* when there is nothing to measure.

**Live vs Sample.** The header switch (or `?data=sample`, also `?demo=1`) shows **invented** numbers under a visible
"Sample data" banner so the layout can be seen fully populated. Sample numbers are generated in the browser
(`hub-model.js` `sampleRaw`), never written to the database and never mixed with live numbers.

A panel whose database function isn't live yet simply shows empty (the other panels keep working).

## Files

`index.html` (structure) · `dashboard.css` (pantry design tokens, light only) · `dashboard.js` (fetch + draw) ·
`hub-model.js` (pure logic and the sample set, unit-tested) · `config.js` (targets). `okr.js` and `ai-panel.js`
are earlier helpers that still have tests but are no longer used by the page.

## Run it locally

From the repo root:

```bash
npx http-server -p 5518 -c-1
```

Then open <http://localhost:5518/dashboard/>. Add `?demo=1` to preview with representative numbers
(clearly labelled "Demo data — not live") — useful for screenshots before real data exists.

## Test the math

```bash
node --test "dashboard/tests/**/*.test.mjs"   # or `npm test` from the repo root (covers both)
```

The OKR calculations live in `okr.js` as pure functions so they can be tested without a browser.

## Deploy (free)

Any static host works — the page is just files. Two easy options:

- **Vercel:** point a project at this repo, set the output/root to `dashboard/`, deploy. (Deploying
  from your own Vercel account doesn't require admin on the extension repo.)
- **GitHub Pages:** serve `dashboard/` via a Pages workflow or a `gh-pages` branch.

Targets live in [`config.js`](config.js) (`OKR_CONFIG`) so the team can tune them after Sprint 1.
