# PrepTip architecture

Chrome Manifest V3 extension, plain JavaScript, **no build step**. Load it with `chrome://extensions` → Developer mode → Load unpacked → pick the repo root.

Requirement numbers (R1–R10) refer to "Behavioral Requirements" in the PRD. Screen numbers (S1–S6) refer to "AI Screen Specs" and to the clickable mockup at `docs/mockup/preptip-mockup.html` (screens 1, 2, 2A, 2B, 3, 4, 4A, 5, 5A, 6).

## Files and owners

| Path | What | Module type |
|---|---|---|
| `manifest.json` | Permissions, content scripts, side panel | — |
| `src/config.js` | Supabase URL + publishable key | ES module |
| `src/lib/protocol.js` | Message types + storage keys (**the contract**) | ES module |
| `src/lib/supabase.js` | `getCatalog`, `getTipRatings`, `createAccount`, `signIn`, `submitFeedback`, `requestTip` | ES module |
| `src/lib/sites.js` | `matchSite`, `tipsForSite`, `searchTips`, `parseTarget` | ES module |
| `src/data/segments.js` | Grade bands + site→grade tags + `fitsGrade`/`splitByGrade` (recommend-by-grade) | ES module |
| `src/data/resources.js` | `RESOURCES` — curated teacher-built sites (blurb + link, no steps) | ES module |
| `src/background.js` | Service worker: badge, panel behavior, nudge info, redirect detection, malicious-URL blocking | ES module |
| `src/blocked/*` | Warning page shown in place of a blocked URL (R7) | page |
| `src/data/blocklist.json` | Flagged domains | data |
| `src/sidepanel/*` | The whole PrepTip UI (S1 nudge excluded): setup, tips, search, empty states, guide, feedback | page, ES modules |
| `src/content/guide.js` + `.css` | On-page highlight, guide cursor, coach tooltip, click tracking, off-track detection, S1 nudge | **classic script** (no imports) |
| `src/content/youtube-main.js` | Runs in the page's MAIN world; reads the player response for restriction status | classic, MAIN world |
| `src/content/youtube.js` + `.css` | "Download for Slides" button below the player (R8–R10) | classic |

Content scripts cannot use `import`. They copy the message-type strings they need from `protocol.js`.

## Data (Supabase `is404_teacherTips`)

`getCatalog()` returns `{ fetchedAt, websites, tips, stale? }`:

```js
websites: [{ url_pattern: 'docs.google.com/spreadsheets', name: 'Google Sheets' }, ...]
tips: [{
  tip_id, url_pattern, title, summary, description, feature_name,
  estimated_required_minutes, keywords,               // keywords = comma-separated teacher words
  tip_steps: [{ step_id, step_order, step_type,       // 'guided' | 'your_turn'
                target_element, step_description }]   // already sorted by step_order
}]
```

`target_element` grammar is `kind:Path > Sub > Sub` (parse with `parseTarget`). Kinds in the data today:
`menu`, `button`, `link`, `search`, `dialog`, `panel`, `print`, `grid`, `cell`, `formula_bar`, `slide`, `editor`, `player`.
Examples: `menu:Format > Conditional formatting`, `menu:View > Freeze > 1 row`, `button:Share`, `panel:Conditional format rules`.

RLS: the publishable key can **read** websites/tips/tip_steps, **insert** into feedback (needs `is_helpful` or text), **insert** into `events` (usage events of a known type), call `rpc/create_teacher_account` and `rpc/sign_in_teacher`, and call `rpc/tip_ratings` (per-tip helpful/total counts, used for "N teachers found this helpful" and never cached), `rpc/okr_tip_completions` (OKR 2 totals) and `rpc/resource_opens` (per-resource open counts). It cannot read feedback, users or events rows.

### Sign-in (R2)

Each account is a unique username and a password. No email, and no Supabase Auth.

- `rpc/create_teacher_account(p_username, p_password)` → `[{ user_id, username }]`. Usernames are 3–30 letters, numbers, `.`, `-` or `_`, unique ignoring case (unique index on `lower(username)`). A taken username fails with code `23505` (HTTP 409); the panel then shows "… is already taken" and offers to sign in. Passwords need 8+ characters and are stored as bcrypt hashes (`pgcrypto`).
- `rpc/sign_in_teacher(p_username, p_password)` → `[{ user_id, username }]`, or `[]` when the username or password is wrong.
- The panel keeps `pt.teacher` (`{ userId, username, gradeLevel }`) and `pt.setupDone`. A saved teacher from the old name + email setup has no `username`, so the panel signs it out on load. `gradeLevel` is the teacher's chosen grade band (or null); it's picked on the "You're set" screen and lives only in the browser.

"Sign out" removes `pt.teacher` and `pt.setupDone`, clears any running guide, and shows the sign-in form.

### Usage events & OKRs

`events` ([supabase/migrations/20261101000000_usage_events.sql](../supabase/migrations/20261101000000_usage_events.sql)) is a shared, insert-only table behind the OKR dashboard. The side panel logs `tip_open` (a teacher opened a tip), `tip_complete` (finished 100% of its steps) and `resource_open` (opened a Common Teacher Resource) via `logEvent()` in `src/lib/supabase.js`. `okr_tip_completions()` and `resource_opens()` return only aggregate totals. `app_open` and `tip_dwell_success` are reserved for the team's Objective-B tracking. The dashboard itself is a separate static site in [`dashboard/`](../dashboard/) (reads aggregates, never embedded in the extension).

## Messages

All messages are plain objects `{ type, ...payload }`. Types live in `src/lib/protocol.js`.

### Side panel → content script (`chrome.tabs.sendMessage(tabId, msg)`)

| type | payload | response |
|---|---|---|
| `PT_PING` | — | `{ ok: true }`. If this throws, the panel injects `src/content/guide.js` + `guide.css` with `chrome.scripting` and retries. |
| `PT_GUIDE_SHOW` | `{ tipId, stepIndex, totalSteps, step: { step_type, target_element, step_description } }` | `{ ok: true }`. Replace any current highlight with this step. |
| `PT_GUIDE_CLEAR` | — | `{ ok: true }`. Remove all overlays and stop tracking. |

### Content script → side panel (`chrome.runtime.sendMessage(msg)`)

The panel filters by `sender.tab.id === activeTabId` and by `tipId`/`stepIndex`.

| type | payload | when |
|---|---|---|
| `PT_GUIDE_STATUS` | `{ tipId, stepIndex, found: boolean, label: string \| null }` | After each `PT_GUIDE_SHOW` and whenever "found" changes. `label` = the text of what's highlighted now (e.g. `"Format"` while waiting for the menu to open, then `"Conditional formatting"`). |
| `PT_GUIDE_STEP_DONE` | `{ tipId, stepIndex }` | **guided** steps only: the teacher clicked the final segment of the target path. |
| `PT_GUIDE_OFFTRACK` | `{ tipId, stepIndex, clicked: 'Data', expected: 'Format' }` | **menu** steps only: the teacher opened a different top-level menu. |
| `PT_GUIDE_BACK_ON_TRACK` | `{ tipId, stepIndex }` | After an off-track, when the expected item is clicked/opened. |

### Content script → background

| type | payload | response |
|---|---|---|
| `PT_GET_SITE_INFO` | — | `{ site: { url_pattern, name } \| null, tipCount, showNudge: boolean }` for `sender.tab.url`. `showNudge` is true only the first time a teacher sees a supported site. |
| `PT_NUDGE_DISMISSED` | `{ urlPattern }` | `{ ok: true }`. Records it in `pt.nudgesSeen`. |
| `PT_OPEN_PANEL` | — | `{ ok: boolean }`. Background calls `chrome.sidePanel.open({ tabId: sender.tab.id })`. This can fail when Chrome doesn't count it as a user gesture; the nudge then says "Click the PrepTip icon in your toolbar". |

### Blocked page → background

| type | payload | response |
|---|---|---|
| `PT_PROCEED_ANYWAY` | `{ url }` | `{ ok: true }` after the domain is allowed for this browser session. The page then navigates to `url`. |

### Background → side panel

| type | payload |
|---|---|
| `PT_TAB_CONTEXT_CHANGED` | `{ tabId, url }`. Sent when the active tab changes or finishes loading. The panel re-renders its site context. The panel also listens to `chrome.tabs.onActivated/onUpdated` itself, so this is a convenience. |

## Storage

`chrome.storage.local`: `pt.teacher` (`{ userId, username, gradeLevel }`), `pt.setupDone`, `pt.catalog`, `pt.nudgesSeen`.
`chrome.storage.session`: `pt.redirect.<tabId>` (`{ from, to, at, kind }`, written by background, shown by the panel as "You were redirected here from …"), `pt.guide.<tabId>` (`{ tipId, stepIndex }`, written by the panel so a guide resumes after the panel reopens), `pt.allowedDomains`, and the background-only `pt.lastUrl.<tabId>` (the tab's last committed URL, used as the "from" of client redirects; it lives in storage because the service worker can be killed at any time).

## declarativeNetRequest rule ids

- Dynamic block rules: ids 1000+ (priority 1), rebuilt from `src/data/blocklist.json` on install/startup.
- Session "proceed anyway" allow rules: ids 50001+ (priority 100), added by `PT_PROCEED_ANYWAY`, gone when the browser closes.

Content scripts never read storage directly (session storage is closed to them by default). They ask the background.

## Visual language

Copy tokens from the mockup (`docs/mockup/preptip-mockup.html`, the `:root` block and the `.side`/`.xp` section): brand `#E8590C`, brand-dk `#C2410C`, brand-soft `#FFF1E7`, ink `#1E2433`, ok `#15803D`, warn `#B45309`, radius 10–14px, font stack `"Nunito", "Segoe UI", system-ui, sans-serif` (no remote font loading). On-page overlays use the same orange ring and the dark coach tooltip.
