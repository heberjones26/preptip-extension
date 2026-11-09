# PrepTip

A Chrome extension that gives teachers short, guided help inside the web tools they already use. IS 401 prototype, built from our [PRD](docs/PRD.md) and [clickable mockup](docs/mockup/preptip-mockup.html).

## App Summary

Teachers are expected to use general-purpose tools such as Google Sheets, Canva and Canvas, but those tools are built for everyone, not for classrooms. When a teacher hits a wall, like wanting failing grades to turn red automatically, they either spend scarce prep time learning a complex feature or fall back on slow manual workarounds. PrepTip is a Chrome extension that recognizes which tool a teacher is on and opens a side panel of short, teacher-specific tips for that tool. Choosing a tip starts a guided walkthrough that highlights the exact menu to click on the real page, notices when the teacher opens the wrong menu, and points them back. Teachers can search tips in their own words, request a tip that doesn't exist yet, and rate each tip so the most helpful ones stand out. PrepTip also protects the classroom by blocking redirects to flagged websites before they load, and adds an "Add this moment to Slides" helper on YouTube. All tips live in a Supabase database, so the team can add new help without shipping a new version of the extension.

## System architecture

How data moves through the two parts of PrepTip. The **customer-facing app** is the Chrome extension (teachers); the **team/admin app** is the OKR Metrics Hub (Product Owner / Scrum team). **The two apps meet at Supabase** — the extension *writes* catalog reads, feedback and usage events; the hub *reads* aggregates of them. The AI workflow automation is **planned** (dashed).

```mermaid
flowchart TB
  teacher(["Teacher"])
  team(["Team / Product Owner"])

  subgraph CUST["Customer-facing app · PrepTip Chrome extension (Manifest V3, no build)"]
    panel["Side panel<br/>HTML / CSS / JS"]
    content["Content scripts<br/>on-page guide + URL blocking"]
    worker["Service worker<br/>engagement + badges"]
    local[("chrome.storage<br/>per-browser")]
  end

  tools["Teacher web tools (external)<br/>Google Sheets / Docs / Slides, YouTube, Canvas,<br/>Quizlet, Khan, Desmos, Padlet, Microsoft 365,<br/>Classroom, Kahoot, ClassDojo"]

  subgraph SB["Supabase · hosted Postgres + REST — shared backend (where the two apps connect)"]
    tables[("Tables<br/>websites · tips · tip_steps<br/>users · feedback · events")]
    fns["Functions / RPC<br/>create_teacher_account · sign_in_teacher<br/>tip_ratings · okr_tip_completions<br/>okr_app_usage · okr_tip_engagement · resource_opens"]
  end

  subgraph ADMIN["Team / admin app · OKR Metrics Hub (static site, Vercel)"]
    hub["Dashboard<br/>HTML / CSS / JS"]
  end

  cdn["jsdelivr CDN<br/>Geist fonts"]
  ai["AI workflow automation — PLANNED<br/>Supabase Edge Function to an LLM API, e.g. Gemini"]

  teacher -->|"opens tips, rates thumbs up/down, signs in"| panel
  panel -->|"sign in via RPC; read tip catalog;<br/>write feedback + usage events"| SB
  content -->|"highlight menus; block flagged URLs"| tools
  worker -->|"app opens + 10s+ tip views"| local
  worker -->|"app_open + tip_dwell_success events"| SB

  team -->|"opens the hub"| hub
  hub -->|"read OKR aggregates<br/>(publishable key, read-only)"| SB
  hub -.->|"load fonts"| cdn

  SB -.->|"new tip / resource requests to classify + draft"| ai
  ai -.->|"drafted tip steps, held for team review"| SB
```

## ERD

![PrepTip entity relationship diagram](docs/erd.png)

| Table | What it stores |
|---|---|
| `websites` | Each supported tool, keyed by a URL pattern such as `docs.google.com/spreadsheets` |
| `tips` | A how-to for one website: title, summary, description, feature name, estimated minutes and search keywords |
| `tip_steps` | The ordered steps of a tip. `step_type` is `guided` (PrepTip highlights it) or `your_turn` (the teacher fills something in). `target_element` names what to highlight, e.g. `menu:Format > Conditional formatting` |
| `users` | Teachers, created by the extension's first-run setup (name + email) |
| `feedback` | A teacher's 👍/👎 and optional comment on a tip. A row with no `tip_id` is a "request a tip" submission |
| `events` | One row per usage event (`tip_open`, `tip_complete`, `app_open`, `tip_dwell_success`) that the OKR dashboard aggregates. Insert-only for the public key; raw rows are never readable with it. |

## Tech Stack

| Layer | What we used | Why it fits our team |
|---|---|---|
| Client UI | Chrome extension (Manifest V3) side panel, written in plain HTML, CSS and JavaScript modules | The PRD requires a browser extension with no extra software to install (R1). The side panel keeps help next to the teacher's work instead of in another tab. With no framework or build step, every teammate can read the code and load it straight into Chrome. |
| On-page guidance | Content script that draws highlights inside a Shadow DOM | Lets us point at the real Google Sheets menus without the page's styles breaking ours, or ours breaking the page |
| Background logic | MV3 service worker using `declarativeNetRequest`, `webRequest` and `webNavigation` | Chrome checks flagged URLs and blocks them before the page loads (R6–R7), and the extension never has to read page contents to do it |
| Database + API | Supabase: hosted PostgreSQL with an auto-generated REST API | No server code for us to write or host. The free tier covers a class project, and teammates can add or edit tips in Supabase's table editor without touching code. |
| Security | Postgres row-level security policies and two small database functions ([migrations](supabase/migrations/)) | The extension uses Supabase's public "publishable" key. RLS limits that key to reading tips, adding feedback, registering a teacher and reading helpful counts. It can't read or change anyone's feedback or personal data. |
| Tooling | Git and GitHub; Node.js only for the optional tests and checks (built-in `node:test`, no dependencies) | Nothing to `npm install` before running the extension |

## How to Get It Running

You need **Google Chrome 116 or newer** (Edge and Brave work too) and a Google account to open a Google Sheet. The database is already hosted on Supabase and the extension is pre-configured to use it ([src/config.js](src/config.js)), so there is nothing to set up on the backend.

1. **Get the code.** The repository is public, so you can grab it directly. Either:
   - clone it:
     ```bash
     git clone https://github.com/heberjones26/preptip-extension.git
     ```
   - or, on the GitHub page, click **Code → Download ZIP** and unzip it.

   Either way you should have a folder named `preptip-extension` with `manifest.json` directly inside it.
2. **Open the extensions page.** In Chrome, go to `chrome://extensions`.
3. **Turn on Developer mode** with the toggle in the top-right corner.
4. **Load the extension.** Click **Load unpacked**, then select the `preptip-extension` folder, the one that directly contains `manifest.json`. A **PrepTip** card with an orange lightbulb icon appears. It should not show a red **Errors** button.
5. **Pin it to the toolbar.** Click the puzzle-piece icon to the right of the address bar, then click the pin next to **PrepTip**.
6. **Open a supported site.** Go to `https://sheets.new` to create a blank Google Sheet, or open any Sheet you already have. The PrepTip icon shows a green number, which is how many tips exist for Google Sheets.
7. **Open PrepTip and finish setup.** Click the PrepTip icon. The side panel opens on the right and walks you through four short setup steps. Enter a first name and an email address (no password; this only links your feedback to you). When you finish, the panel lists the Google Sheets tips.

**If something looks wrong:**
- **The panel says "No tips available for this site".** Check that the address starts with `docs.google.com/spreadsheets`.
- **No orange highlights on the page.** The tab was probably open before you loaded the extension; refresh it.
- **You changed the code.** Click the circular reload arrow on the PrepTip card in `chrome://extensions`, then refresh your test tab.

**Optional developer checks** (needs Node.js 20 or newer):

```bash
npm test
```

```bash
npm run check
```

**Releasing to the Chrome Web Store:** bump the manifest version and push a `v*` tag. See [docs/RELEASING.md](docs/RELEASING.md).

## Verifying the Vertical Slice

Our vertical slice is the **"Was this helpful?" 👍 button**. One click goes through every layer:

1. The side panel UI sends the rating.
2. Supabase inserts a row into `feedback`.
3. The next time the panel loads, it reads the totals back from the database through the `tip_ratings` function.
4. The new total shows on the tip's card as "N teachers found this helpful".

The count is never cached in the browser, so seeing it change after a refresh proves the click was saved in the database.

1. Finish **How to Get It Running** and open a Google Sheet with the PrepTip panel showing the Google Sheets tips.
2. Find the card **Average a row of scores** and note the green line under it, for example **"2 teachers found this helpful"**. If there's no green line, the count is 0.
3. Click that card to start its two-step guide.
   - On step 1, click **I did this step**.
   - On step 2 ("Your turn"), click **I'm done**.
4. On the **Nice work!** screen, under **Was this helpful?**, click **👍 Yes**, then click **Submit**. You should see **"Thanks for the feedback!"**.
5. **Refresh.** Close the side panel with its **×**, then click the PrepTip toolbar icon to open it again. This reloads the panel from scratch. Reloading the extension in `chrome://extensions` or restarting Chrome works too.
6. **Confirm.** The **Average a row of scores** card now shows one more than before, e.g. **"3 teachers found this helpful"**. Repeat steps 3–5 and it goes up again each time. A 👎 rating is saved but doesn't add to the helpful count.

If you have access to the Supabase project, you can also open **Table Editor → feedback** and see your new row at the bottom, with `is_helpful = true` and your `user_id`.

## Beyond the vertical slice

| PRD | Try this |
|---|---|
| R2 setup | The first click on the icon shows step-by-step setup. "Change teacher" at the bottom of the panel runs it again |
| R3/R4, S1 | On a Google Sheet: green badge on the icon, a one-time "tips are ready" pop-up, and the Sheets tip list |
| S2 search | Search "make bad grades red" or "freeze" |
| R5 | Open wikipedia.org: the panel says "No tips available for this site" |
| S3–S5 guided walkthrough | On a Sheet, open **Color-code grades automatically**. **Format** gets an orange highlight, then **Conditional formatting**. Click **Data** instead to see the off-track recovery |
| R6/R7 blocking | Visit `http://malware.preptip.test/` or `https://testsafebrowsing.appspot.com/s/malware.html`. Both are safe test addresses on our [blocklist](src/data/blocklist.json). For a redirect: `https://httpbin.org/redirect-to?url=https%3A%2F%2Fmalware.preptip.test%2Fprize` |
| R8/R10 YouTube | Any video shows **Add this moment to Slides** under the player (the PRD's "Download for Slides" button, renamed because it links rather than downloads); age-restricted or private videos show "Video cannot be downloaded due to restrictions." |

## Project layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces talk to each other.

```
manifest.json             extension definition and permissions
src/
  config.js               Supabase URL + publishable key
  lib/                    shared code: Supabase client, URL matching, message names
  background.js           service worker: badge, redirect detection, blocking
  sidepanel/              the PrepTip panel (dev.html is a browser-only test page)
  content/guide.*         on-page highlights, walkthrough tracking, first-visit pop-up
  content/youtube*.*      "Add this moment to Slides" button
  blocked/                warning page for flagged URLs
  data/blocklist.json     flagged domains
supabase/migrations/      RLS policies and database functions
docs/                     PRD, ERD, architecture, mockup, dev test pages
tests/                    unit tests
```

**Adding a tip** needs no code. In Supabase:
1. Insert a `tips` row whose `url_pattern` matches a `websites` row.
2. Insert its `tip_steps` rows.

The extension picks it up within 10 minutes, or right away after you reload it. Highlights currently work for `menu`, `button`, `link`, `search`, `panel` and `dialog` targets; other steps show their instructions in the panel only.

## Grade levels, subjects & Teacher Resources

At setup a teacher can pick the grade they teach — **Pre-school, Kindergarten–3rd, 4th–6th, Middle school, High school, College**, or Special education (or "All grades") — and any number of **subjects** (Math, Physics, Chemistry, Biology, Other science, English / ELA, Spanish & world languages, Social studies, Art, Music, PE & health, Computer science, or Something else). Both are optional, stored locally in `pt.teacher.gradeLevel` and `pt.teacher.subjects`, and change PrepTip's suggestions:

- **Recommended sites by grade and subject** — the "Sites with tips" list leads with a "Recommended for High school · Physics" group. A site has to fit the grade *and* the subject; tools that name your subject (Desmos for a math or physics teacher, Quizlet for Spanish) come first, ahead of tools that suit everyone. The current site shows a "For Physics" or "For High school" badge when it names you.
- **Common Teacher Resources** — a **Teacher resources** link (panel footer) opens a list of teacher-*built* sites (Teachers Pay Teachers, Kahoot, Nearpod, Edpuzzle, Gimkit, Newsela, PBS LearningMedia, PhET, OpenStax, BrainPOP) with a short blurb and an open-link — no walkthroughs, since those sites are already made for teachers. The list holds about 26 resources across subjects (including Conjuguemos for languages, The Physics Classroom, Code.org, CommonLit, iCivics, Chrome Music Lab and GoNoodle), filters by category, and narrows to the teacher's grade and subjects with a toggle to see all. Teachers can also suggest a resource to add.

The grade bands, the subject list, the site→grade and site→subject tags, and the recommend/rank/label helpers live in [`src/data/segments.js`](src/data/segments.js); the curated resource list in [`src/data/resources.js`](src/data/resources.js). Both are bundled (no database) and covered by [`tests/segments.test.mjs`](tests/segments.test.mjs). Change your grade or subjects anytime from the footer.

## Metrics & OKR dashboard

The team tracks its OKRs on a standalone dashboard in [`dashboard/`](dashboard/) — a small static page (same no-build HTML/CSS/JS) that reads **aggregate** numbers from Supabase and shows each Key Result against its target. It is separate from the extension on purpose: a dashboard needs to be responsive and live on the web, which a fixed-width Chrome side panel can't be. See [`dashboard/README.md`](dashboard/README.md) to run or deploy it.

- **Objective A — tips are effective and helpful.** Thumbs-up rate (from `tip_ratings()`) and tips completed end-to-end (from `okr_tip_completions()`).
- **Objective B — teachers use the app consistently.** Days the app is opened and opens that lead to a tip (from the shared `events` table; aggregate functions owned by the team's Objective-B work).

The extension feeds this by logging two events through `logEvent()` ([src/lib/supabase.js](src/lib/supabase.js)): `tip_open` when a teacher opens a tip and `tip_complete` when they finish 100% of its steps.

**Supported sites** come straight from the `websites` table, so adding one needs no code. Beyond Google Sheets, two seed migrations add six more sites with 10 tips each — all general tools where teachers are a minority audience:

- [`..._seed_youtube_m365_padlet.sql`](supabase/migrations/20261101010000_seed_youtube_m365_padlet.sql) — **YouTube, Microsoft 365, Padlet**
- [`..._seed_quizlet_khan_desmos.sql`](supabase/migrations/20261101020000_seed_quizlet_khan_desmos.sql) — **Quizlet, Khan Academy, Desmos**

## Error log

The team needs to know what breaks for teachers, so the extension keeps an error log (table `error_log`, shown in the hub's **Error log** panel):

- **Automatic** — it records when tips or ratings fail to load, a save fails, sign-in fails unexpectedly, the on-page guide can't run, a guided step's target never shows up on the page (a sign the tip no longer matches the real site), or the panel hits an uncaught script error. Messages are scrubbed of URLs, emails and key-like text first; page content and the pages teachers visit are never sent.
- **Teacher reports** — **Report a problem** (footer, or "Something wrong with this tip?" while following a tip) lets a teacher pick what went wrong and add a note. This catches the things that work but are wrong, which automatic capture can't see.
- **In the hub** — errors, errors per 100 app opens, teachers affected, a per-day chart, a breakdown by kind, and the most frequent issues with the tip they happened on. What teachers type in a report is not shown on the public dashboard; it is kept in the Supabase table.

Details and the privacy choices are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#error-log).

## Known limits

- **YouTube downloads (R9) are intentionally not implemented.** Saving YouTube videos breaks YouTube's Terms of Service and gets extensions removed from the Chrome Web Store. Instead, the button copies a link and shows how to add the video with Google Slides' built-in **Insert → Video**.
- Teacher identity is a name and email with no verification. That's fine for a class prototype; a real launch would need proper sign-in.
- The blocklist is a small local file, not a live threat feed.
