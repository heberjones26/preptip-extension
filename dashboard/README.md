# PrepTip OKR Dashboard

A small static page the team uses to watch our Sprint OKRs. It reads **aggregate** numbers from the
same Supabase project the extension uses (via the public publishable key) and shows each Key Result
against its target. No build step, no framework — plain HTML/CSS/JS, same as the extension.

It lives outside the extension on purpose: a dashboard needs to be responsive and live on the web,
which a fixed-width Chrome side panel can't be.

## What it shows

| Objective | Key Result | Source |
|---|---|---|
| A — Tips are effective and helpful | Thumbs-up rate (target 80%, floor 5 ratings) | `rpc/tip_ratings` |
| A | Tips completed end-to-end | `rpc/okr_tip_completions` (needs the `events` migration applied) |
| B — Teachers use the app consistently | Days the app is opened (target 3 of 5), plus an 8-week history and this week's spread (how many teachers opened on 1, 2, 3… days) | `rpc/okr_app_usage`, `okr_app_usage_weekly`, `okr_app_usage_distribution` |
| B | Opens that lead to a tip, plus an 8-week history | `rpc/okr_tip_engagement`, `okr_tip_engagement_weekly` |

Beyond the four Key Results the hub also shows:

| Panel | What it answers | Source |
|---|---|---|
| Requested tips | The backlog of tips teachers asked for, most-asked first, with the site, how many times, how many teachers and when; resource suggestions listed separately. Wording is scrubbed in the database (links, emails, phone numbers removed) and never shows who asked | `rpc/requested_tips` |
| Error log | What breaks for teachers: errors, per 100 opens, teachers affected, a per-day chart, the most frequent issues and which tip they happened on (7 or 30 days) | `rpc/error_summary`, `error_trend`, `error_groups` (needs the `error_log` migration) |
| Which tips are landing | Most and least helpful tips by thumbs-up rate | `rpc/tip_ratings` |
| Most-opened resources | Which Common Teacher Resources get clicked | `rpc/resource_opens` |
| AI tip builder | How often teachers build a tip with AI (counts only) | `rpc/ai_tip_summary` (needs the `ai_tip_events` migration) |

A "How each number is measured" section at the bottom defines every figure. What teachers type in a
"Report a problem" note is never shown here (it stays in the Supabase table).

Cards degrade gracefully: a panel whose function isn't live yet shows **"Awaiting data"** or "Lives once
the … migration is applied" instead of erroring. OKR 1 works with no migrations; the rest light up as
their functions are applied.

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
