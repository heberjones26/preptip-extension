# KR 3 and KR 4 usage testing

Both trackers run locally in each Chrome profile. No metrics are sent to Supabase and no interface, layout, permissions, or visible text were changed. Records contain teacher IDs, not names, emails or visited page URLs.

## What counts as an opening

A registered teacher's first visible panel document load starts an opening. Initial registration starts tracking once a teacher is available. Switching to a different teacher starts that teacher's opening; switching back starts another. Saving the same teacher again does not. Both KR 3 and KR 4 now share the same opening event, teacher and timestamp.

Closing/reopening a new panel document or reloading it starts a new opening. When both Chrome's native panel lifecycle events are available (Chrome 142+), replacing PrepTip with another side panel and returning also starts a new opening even if Chrome retains its document. Duplicate opened events are ignored. Hiding/restoring a window resets a tip's viewing timer but does not create another opening. On older Chrome versions, a retained document returning from a different side panel cannot be reliably distinguished from other visibility changes; use Chrome 142+ for that test case.

Tab changes, rendering views, content-script loads and background-worker startup do not create openings. A panel left open overnight does not count as a new opening on the next date. Unregistered use and the dev.html preview are excluded.

## KR 3

Records are stored under `pt.usage.v1`. Dates and hours use local calendar time. Each daily record contains an opening count, 24-hour histogram, first/last UTC timestamps and the time zone/offset at the first opening that day.

Office days mean Monday–Friday without holiday exclusions. Within a Monday–Sunday week, at least three distinct office days give a teacher a metric of 1. Two days give 0; four or five days still give 1. Weekend openings are recorded but do not count toward this threshold. Repeated openings on one date never increase the distinct-day count.

Reports include previously observed teachers who have zero openings in the selected week. Teachers never observed on this installation are not known and cannot be included. `averageOfficeDays` measures average weekday usage separately from `qualifyingTeachers`. An empty cohort has a null average. The current week is partial until it ends.

## KR 4

Records are stored under `pt.engagement.v1`. Each explicit tip click creates a visit. Automatically restoring a saved guide does not count as a click. More than 10,000 milliseconds continuously visible on that clicked tip makes the visit successful. Exactly 10 seconds is insufficient. Moving between steps of the same guide keeps the timer running.

Hiding the panel resets the continuous interval. Leaving the guide, changing teacher or switching tips ends the previous visit. If a qualifying interval has elapsed before a delayed timeout callback runs, leaving/hiding still records that success. Multiple successful visits in one opening count as one successful opening.

| Field | Meaning |
| --- | --- |
| openings | Measured teacher sessions, including those without clicks |
| openingsWithTipClick | Sessions with at least one explicit tip click |
| tipClicks | Total tip visits, including repeated visits to the same tip |
| successfulOpenings | Sessions with at least one qualifying tip visit |
| clickRate | openingsWithTipClick / openings |
| successfulUseRate | successfulOpenings / openings — the KR 4 metric |

Rates are fractions; multiply by 100 for percentages. With no openings, rates are null. For example, 10 openings, 6 with clicks and 4 with qualifying visits give a 60% click rate and a 40% successful-use rate. Week filters use the opening's local Monday date, even if a tip succeeds after midnight.

KR 4 begins with its first tracked session. Historical KR 3 openings do not have click/duration data and are not added to the KR 4 denominator. Existing records are preserved; previously missed events cannot be reconstructed.

## Inspect and export

Open chrome://extensions, enable Developer mode and inspect PrepTip's service worker. Run:

```js
const usageModule = await import(chrome.runtime.getURL('src/lib/usage.js'));
const engagementModule = await import(chrome.runtime.getURL('src/lib/engagement.js'));
const tracked = await chrome.storage.local.get([usageModule.USAGE_KEY, engagementModule.ENGAGEMENT_KEY]);
const week = usageModule.openingDetails().week;
console.table(usageModule.weeklyReport(tracked[usageModule.USAGE_KEY], week).teachers);
console.log(usageModule.weeklyReport(tracked[usageModule.USAGE_KEY], week));
console.table([engagementModule.engagementReport(tracked[engagementModule.ENGAGEMENT_KEY], { week })]);
// Omit the filter for all measured sessions, or use { userId: 1 } for a teacher.
copy(JSON.stringify(tracked, null, 2));
```

Re-read storage after additional test activity to get fresh results. Use a Monday string such as `2026-11-02` in place of `week` to inspect an earlier week.

## Persistence and limits

A single service-worker queue serializes metrics writes from multiple windows. The same opening is saved to both metrics in one storage call. Events have stable session/visit IDs, so retrying a lost response does not double-count. A session remains associated with its original teacher and panel document after the globally selected teacher changes or the worker restarts.

Failed messages are retained in the open panel's in-memory queue and retried up to three times, then retried on subsequent activity/visibility changes. Permanent invalid messages are rejected. Closing the panel before an unsuccessful queue is saved can lose those events; persistent storage failure or storage quota exhaustion can also leave metrics incomplete. Analytics failures do not block normal UI actions.

Records survive browser restarts until extension storage is cleared or the extension is uninstalled. There is no automatic retention cleanup. Export before clearing storage. For cross-device KR 3 analysis, union dates by teacher before calculating distinct days. For KR 4, deduplicate exported sessions by session ID. Local reports do not represent the entire teacher population or a centralized production analytics service.

Visible duration is a usage proxy, not proof of attention. A visible panel can be unattended or obscured by another window. No screen-attention or operating-system idle tracking is performed.

## Validation

Run `npm test` and `npm run check`. The suite runs the real panel and background modules using mocked DOM, Chrome and network APIs, plus deterministic timer/storage tests. It does not require npm dependencies. Time-zone checks:

```sh
TZ=America/Denver npm test
TZ=Pacific/Auckland npm test
```

Real Chrome smoke checks:

1. Reload the unpacked extension and open its panel as a registered teacher. Confirm one opening in both data stores.
2. Re-render, search and change tabs without opening another panel. Confirm no additional opening.
3. Click a tip and leave within 10 seconds: click only. Click again and remain visible for at least 11 seconds: one successful opening.
4. Stay through multiple steps or multiple successful tips: the opening still contributes only one success.
5. Hide the panel at 5 seconds, wait, and return: require a fresh interval longer than 10 seconds. A minimized/restored window must not add an opening.
6. Switch to another side panel and back (Chrome 142+), or close/reopen PrepTip. Confirm a new opening and require a new explicit tip click.
7. Switch teacher A → B → A: both trackers should add three openings with the correct teacher IDs.
8. Restart Chrome and confirm saved history persists. Automatically restored guides must not add a click.

See `tracker-review.md` for the completed review and verification limits.
