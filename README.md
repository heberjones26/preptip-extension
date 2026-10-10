# PrepTip

A Chrome extension that gives teachers short, guided help inside the web tools they already use, such as Google Sheets, Docs, Slides, Canva, Canvas and YouTube. It's the IS 401 prototype of the [Teacher Prep Tip PRD](docs/PRD.md), built from the [clickable mockup](docs/mockup/preptip-mockup.html).

Tips come live from Supabase (project `is404_teacherTips`). Add a row to `tips` and `tip_steps`, and the extension picks it up within 10 minutes, or right away when you reload it.

## Run it locally

1. Clone the repo.
2. Open `chrome://extensions` in Chrome (or Edge or Brave), turn on **Developer mode**, click **Load unpacked**, and pick this folder.
3. Pin PrepTip: click the puzzle-piece icon in the toolbar, then the pin next to PrepTip.
4. Click the PrepTip icon. The first time, the side panel walks you through setup. Name and email are used only to attach feedback to a teacher; there is no password.

After you change code, click the reload arrow on the PrepTip card in `chrome://extensions` and refresh any tabs you're testing.

There's no build step. Node is only used for the optional checks:

```bash
npm test
```

```bash
npm run check
```

## What to try

| PRD | Try this |
|---|---|
| R2 setup | First click on the icon shows step-by-step setup |
| R3/R4 tips for this site, S1 badge + nudge | Open any Google Sheet: green badge with the tip count, a one-time nudge, and the side panel lists Sheets tips |
| S2 search | Search "make bad grades red" or "freeze" |
| R5 unsupported site | Open wikipedia.org: "No tips available for this site" |
| S3–S5 guided walkthrough | In a Sheet, open **Color-code grades automatically**. Format gets an orange highlight, then Conditional formatting. Click **Data** instead to see the off-track recovery |
| S6 feedback | Finish a tip: thumbs up/down, optional comment, skippable |
| R6/R7 redirect + malicious URL blocking | See [Blocking test URLs](#blocking-test-urls) |
| R8–R10 YouTube | Open any YouTube video: **Download for Slides** below the player |

### Blocking test URLs

The blocklist is in [src/data/blocklist.json](src/data/blocklist.json). These are safe to visit:

- `http://malware.preptip.test/`: a direct visit to a flagged domain (`.test` never resolves; PrepTip intercepts it first)
- `https://testsafebrowsing.appspot.com/s/malware.html`: Google's Safe Browsing test page, flagged here for demos
- `https://httpbin.org/redirect-to?url=https%3A%2F%2Ftestsafebrowsing.appspot.com%2Fs%2Fmalware.html`: a server redirect into a flagged domain, blocked before the page loads, with the warning showing where you came from

## How it's built

Manifest V3, plain JavaScript, no framework and no bundler, so anyone on the team can read and change it. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the file map, message contract and data model.

```
manifest.json
src/
  config.js               Supabase URL + publishable key
  lib/                    shared ES modules (Supabase client, URL matching, message names)
  background.js           service worker: badge, redirects, blocking
  sidepanel/              the PrepTip UI
  content/guide.*         on-page highlights + walkthrough tracking + first-visit nudge
  content/youtube*.*      "Download for Slides" button
  blocked/                warning page for flagged URLs
  data/blocklist.json
supabase/migrations/      RLS policies + register_teacher()
docs/                     PRD, architecture, mockup, dev test pages
```

## Supabase

The extension uses the **publishable** key, which is safe to ship in client code. Row-level security limits what that key can do ([migration](supabase/migrations/20261010000000_extension_access.sql)):

- read `websites`, `tips` and `tip_steps`
- insert into `feedback`, but not read, edit or delete it. A row with no `tip_id` is a "request a tip" submission.
- call `register_teacher(first, last, email)`, which finds or creates a teacher and returns only their id. `users` can't be read directly.

To add a tip: insert a `tips` row whose `url_pattern` matches a `websites` row, then its `tip_steps`. Each step has `step_order`, `step_type` (`guided` or `your_turn`) and `target_element`, for example `menu:Format > Conditional formatting` or `button:Share`. On-page highlighting works today for `menu`, `button`, `link`, `search`, `panel` and `dialog` targets; other kinds show instructions in the panel only.

## Known limits (prototype)

- **YouTube downloads (R9) are intentionally not implemented.** Saving YouTube files breaks YouTube's Terms of Service and gets extensions pulled from the Chrome Web Store. The button meets R8 and R10: restricted videos show "Video cannot be downloaded due to restrictions." Other videos get a one-click link and steps for Google Slides' built-in **Insert → Video**.
- Teacher identity is name + email with no verification. That's fine for a class demo, but real sign-in would come before any real launch.
- The malicious-site list is a small local file, not a live threat feed.
