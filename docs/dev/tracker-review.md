# Tracker review — November 2, 2026

The review found integration problems not covered by the original 12 helper tests. They are corrected in this package.

| Finding | Correction | Verification |
| --- | --- | --- |
| KR 3 deduplicated by teacher for the entire document while KR 4 created another session when switching A → B → A. | One opening event and one serialized recorder update both trackers together. | Actual setup handlers and recorder tests confirm three openings in both metrics. |
| An elapsed 11-second visit could be lost if the teacher left before a delayed timeout callback ran. | Check elapsed visible time before hiding, leaving or switching tips, as well as in the timer. | The original reproduced 0 successes instead of 1; the regression now passes. |
| Failed messages were silently dropped, and a lost acknowledgement could leave inconsistent opening counts. | Ordered retries retain original IDs; the recorder deduplicates opening, click and success events. | Simulated write failures and lost acknowledgements recover without duplicate counts. |
| Changing the selected teacher in another window could discard activity from an already-open session. | Bind subsequent activity to the original session's teacher and document. | Tests cover profile changes, worker recreation and rejection of another document's events. |
| Returning to a retained panel document did not start a new opening. | Listen for native panel close/open events where both are available; distinguish those from window visibility. | Simulated lifecycle events cover retained-document reopen, duplicates and unrelated windows/panels. Native Chrome validation is still pending. |

Verification completed:

- 33 automated tests passed under America/Denver and Pacific/Auckland.
- Tests include the actual sidepanel.js and background.js modules with controlled browser, DOM and network APIs, not only standalone metric functions.
- KR 3 covers repeated dates, weekends, 3-of-5 qualification, five days still scoring 1, zero-use weeks, teacher separation, local midnight, daylight-saving dates and year boundaries.
- KR 4 covers explicit clicks, auto-restored guides, the strict greater-than-10-second threshold, step transitions, early exits, hidden intervals, tip switches, and one success per opening.
- Manifest references and all source JavaScript syntax checks passed.
- Every existing HTML/CSS file, views.js and manifest.json is byte-for-byte unchanged from the prior delivered package. Metrics remain local and existing history is preserved.

Limits: there is no Chrome/Chromium executable in the review environment. Browser APIs and lifecycle delivery were simulated; the native Chrome smoke checks in usage-testing.md remain to be run. Older Chrome without both lifecycle events relies on new document loads and cannot reliably count returning to a retained panel. Storage outages that outlast the panel lifetime can still lose unsaved events. Visible duration does not prove attention, and these local records cannot measure unobserved teachers or other installations automatically.

Platform references used during review:

- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel): onOpened is available from Chrome 141, onClosed from Chrome 142.
- [Chromium side-panel coordinator](https://chromium.googlesource.com/chromium/src/+/3e02c9a7ecbaf73570e025707795c0bf9cb6d088/chrome/browser/ui/views/side_panel/extensions/extension_side_panel_coordinator.cc): panel replacement, cached views and open/close dispatch.
