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
| B — Teachers use the app consistently | Days the app is opened (target 3 of 5) | `rpc/okr_app_usage` *(Objective-B work)* |
| B | Opens that lead to a tip | `rpc/okr_tip_engagement` *(Objective-B work)* |

Cards degrade gracefully: a Key Result whose function isn't live yet shows **"Awaiting data"** instead
of erroring. OKR 1 works today; the rest light up as their functions are applied.

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
