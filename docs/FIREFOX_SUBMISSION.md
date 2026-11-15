# Firefox submission packet

This release targets Firefox 140 or newer on desktop. Submit the Firefox archive, not the Chromium or Safari package. Mozilla decides listing approval after validation and review.

## Build and upload

Run these commands from the repository root with Node.js 20 or newer. There are no package dependencies to install. In PowerShell, use `npm.cmd` if execution policy prevents `npm` from running.

```sh
npm test
npm run check
npm run package:firefox
npx --yes web-ext lint --source-dir dist/firefox
```

The extension upload is `dist/preptip_firefox-<version>.zip`. It contains the generated Firefox manifest and readable JavaScript modules. The archive has no transpiled, bundled, or minified application code. The package generator changes browser manifest settings and copies the source files; it does not transform JavaScript.

On **Do You Need to Submit Source Code?**, select **Yes** because the custom packaging script generates the Firefox manifest. Upload the separate `dist/preptip_firefox-source-<version>.zip` in the source-code field. That archive contains the original manifest, extension sources, icons, packaging scripts, and a root `README.md` with the [source build instructions](FIREFOX_SOURCE_BUILD.md). Do not substitute the source archive for the extension upload.

Visit the [Add-ons Developer Hub](https://addons.mozilla.org/developers/), choose **Submit a New Add-on**, and select **On this site** for a public listing. Choose desktop platforms. This package does not target Firefox for Android.

## Suggested listing copy

**Name:** PrepTip

**Summary:** Teacher-friendly tips, QuickStart guides, and walkthroughs for the classroom web tools you already use.

**Description:**

PrepTip helps teachers learn the web tools they use for lessons, assignments, feedback, and classroom organization.

- Find tips for the supported website you are using, or browse tips for another tool.
- Start with a whole-site QuickStart guide when a tool is new to you.
- Follow short walkthroughs with on-page highlights where supported, and written instructions when highlighting is unavailable.
- Summarize a tip without losing your current step.
- Search tips, send feedback, and request help with tasks that are not covered yet.
- Optionally generate written instructions using your own Google Gemini API key. Availability and any API charges depend on your Google account; the bundled tips do not require a Gemini key.
- A small bundled demonstration blocklist redirects its five listed domains to a warning page. The YouTube helper lets you prepare a link to a video moment for a Google Slides lesson.

A PrepTip account is required. Grade and subject preferences are optional. Firefox offers a separate choice for usage metrics and automatic error reports; declining that choice leaves tips and walkthroughs available. PrepTip does not run in private browsing windows.

**Support website:** https://github.com/heberjones26/preptip-extension/issues

**Privacy policy:** https://heberjones26.github.io/preptip-extension/privacy.html

Before submission, publish the updated [privacy page](../dashboard/privacy.html) using the existing [GitHub Pages workflow](../.github/workflows/pages.yml). A push to `main` that changes the privacy page triggers that deployment. Alternatively, paste the updated policy into AMO's privacy-policy field. Confirm that any public policy link supplied with the listing reflects the current policy.

## Information the publisher supplies

- Select the intended license in AMO. This repository does not currently declare a license; no open-source license has been assumed for the team.
- Supply the publisher display name and support contact, and capture screenshots of the Firefox sidebar showing real tips and a QuickStart guide.
- Put dedicated review-account credentials in the private **Notes for Reviewers** field. Do not commit a test password, a personal password, or a Gemini key to the public repository.
- State that Google account access may be needed to test highlights inside Google Docs, Sheets, and Slides. The reviewer can also browse the written tips without opening those tools.

## Notes for Reviewers

Use this text alongside the private review-account credentials:

> PrepTip is a teacher help extension for Firefox 140+ on desktop. Click the PrepTip toolbar button to open its Firefox sidebar. Sign in with the separate review credentials supplied here. Grade and subject choices are optional.
>
> From the site picker, choose Google Docs or Google Sheets. Open the QuickStart card, return to the tip list, and open a tip. Choose Summarize tip, then Hide summary; the guide stays at the same step. On the matching website, the extension highlights supported controls. On a different website, the tip remains usable as written instructions.
>
> Account creation is also available from setup using a new username and password. No payment is required for the bundled tips. The optional Gemini feature uses the user's own API key, which stays in browser storage and is sent only to Google. A Gemini key is not required to test the main functionality.
>
> Usage events and automatic error reports are sent only when Firefox's optional technicalAndInteraction data permission is granted. Ratings, tip/resource requests, class-profile saves, and manually submitted problem reports are deliberate user submissions and remain available when optional telemetry is declined. Private browsing is disabled in the Firefox manifest.
>
> The built-in blocklist contains five demonstration domains. The safe non-resolving test address https://malware.preptip.test/ should open PrepTip's warning page. The YouTube helper adds a link-based Slides workflow; it does not download video files.

## Permission rationale

| Permission | Purpose |
| --- | --- |
| `storage` | Cache tips, remember account/profile choices, keep guide progress and locally saved AI tips. |
| `tabs` and `<all_urls>` host access | Match the active website, track the teaching tab, show guides on supported sites, and apply the bundled blocklist. |
| `scripting` | Inject the guide into already-open supported pages after installation or reload. |
| `webNavigation` and `webRequest` | Follow page changes and record redirect origins locally for the warning page. |
| `declarativeNetRequest` | Redirect requests to the bundled flagged domains to the warning page. |

The manifest declares required authentication and identifying data for account/profile functionality, and optional technical/interaction data for remote usage metrics and automatic error reports. The runtime rechecks the optional permission before each such transmission.

## Validator warnings

Review warnings without disabling the validator. The current shared sources can produce these categories:

- **Dynamic HTML assignments:** the panel builds its own screen templates. Catalog, teacher, AI, and error text is escaped by [esc()](../src/sidepanel/text.js) before insertion. The highlighting helper also escapes text before adding fixed markup. Input-escaping and view tests cover these boundaries. No scripts are loaded from the catalog or AI responses.
- **Android data-consent minimum:** this package targets desktop Firefox 140+, and does not declare `gecko_android` support. Select desktop compatibility in AMO. No Android release is included in this submission.

See Mozilla's [submission instructions](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/), [source-code requirements](https://extensionworkshop.com/documentation/publish/source-code-submission/), and [data-consent documentation](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/) for the upload fields and review process.
