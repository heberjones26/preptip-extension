# Browser installation and packaging

PrepTip shares its tips, QuickStart guides, summaries, settings and on-page walkthroughs across browser packages. The panel opens in a native side panel on Chrome, Edge and Brave, a sidebar on Firefox, and a separate persistent window on desktop Safari. The Safari window follows the active tab in the browser window from which it was opened.

## Build the packages

Node.js 20 or newer is needed to build. There are no npm dependencies to install.

If PowerShell blocks `npm.ps1` under your execution policy, use `npm.cmd` in these commands.

```sh
npm run package:all
```

| Browser | Baseline | Unpacked folder | Archive |
| --- | --- | --- | --- |
| Chrome | 116+ | `dist/chromium/` | `dist/preptip-<version>.zip` |
| Edge and Brave | Current desktop versions based on Chromium 116+ | `dist/chromium/` | Same Chromium archive |
| Firefox | 140+ desktop | `dist/firefox/` | `dist/preptip_firefox-<version>.zip` |
| Safari | 18+ on macOS | `dist/safari/` | `dist/preptip_safari-<version>.zip` |

Build individual targets with `npm run package`, `npm run package:firefox` or `npm run package:safari`. Rebuilding replaces only that target's unpacked folder, so load it again after rebuilding. Each archive has its generated manifest at its root, excludes the development panel/stubs, and includes the runtime modules and bundled data. The checked-in [manifest](../manifest.json) remains directly loadable in Chromium browsers.

## Chrome, Edge and Brave

1. Visit `chrome://extensions`, `edge://extensions` or `brave://extensions` in the matching browser.
2. Enable **Developer mode**, choose **Load unpacked**, then select `dist/chromium`.
3. Pin PrepTip, open a supported website and click its toolbar icon.
4. Complete the account setup and follow a tip. Refresh a website that was already open when PrepTip was installed.

Edge and Brave can also install compatible extensions from the Chrome Web Store. Store publication remains a separate release action; these changes generate the packages without publishing them.

## Firefox

1. Build with `npm run package:firefox`.
2. Visit `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on** and select `dist/firefox/manifest.json`.
4. Allow the requested website permissions, open a supported site, then click the PrepTip toolbar button to open its sidebar.
5. Reload existing site tabs so the on-page guide is injected. After changing code, rebuild and choose **Reload** for PrepTip in `about:debugging`.

Temporary add-ons disappear when Firefox restarts. Normal installation requires a Mozilla-signed XPI, either listed on addons.mozilla.org or signed for self-distribution. Upload the Firefox archive through the [Mozilla distribution process](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/); renaming an unsigned ZIP to XPI does not sign it. The stable add-on ID is `preptip@heberjones26.github.io`.

The Firefox package uses [module background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts) and a native `sidebar_action`. Its minimum version also covers session storage, MAIN-world YouTube scripts and Firefox's [built-in data collection consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/). Account/profile data is declared under identifying and authentication information. Usage metrics and error reporting are optional technical/interaction data; PrepTip checks that permission before transmitting those reports. Teachers can change the consent in Firefox's add-on permissions.

## Safari on macOS

The Safari package contains WebExtension source files. It does not create a signed Mac app or publish to the App Store. Safari runs on macOS; its runtime and native packaging cannot be tested from this Windows workspace. This implementation targets desktop Safari; iPhone/iPad support needs a different panel presentation because iOS does not provide extension windows.

### Temporary installation in recent Safari versions

On versions that offer **Add Temporary Extension**, no Xcode project is needed:

1. Build `npm run package:safari`, then transfer `dist/safari` or its ZIP to the Mac.
2. In Safari's **Settings > Advanced**, enable **Show features for web developers**.
3. In **Settings > Developer**, choose **Add Temporary Extension**, authorize unsigned extensions when prompted, then select the folder or ZIP.
4. Enable PrepTip in **Settings > Extensions** and allow access to the websites where you want guides. Open a supported site and click PrepTip to open its window.

Safari removes these temporary installations when it quits or after 24 hours. See Apple's [temporary installation instructions](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension#Temporarily-install-a-web-extension-folder-in-macOS-Safari).

### Packaging with Xcode

On a Mac with Xcode, run this from the repository root:

```sh
xcrun safari-web-extension-packager dist/safari --project-location dist/safari-xcode --app-name PrepTip --bundle-identifier com.preptip.extension --macos-only
```

Older Xcode versions use the previous tool name:

```sh
xcrun safari-web-extension-converter dist/safari --project-location dist/safari-xcode --app-name PrepTip --bundle-identifier com.preptip.extension --macos-only
```

Choose your own bundle identifier for distribution. In the generated project, configure the signing team and run the containing Mac app, then enable PrepTip in Safari's extension settings. Review any packager compatibility warnings before shipping. Apple's [packaging documentation](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari) describes signing and native app setup.

For distribution without a local Mac/Xcode build, upload the Safari ZIP to Apple's [App Store Connect web packager](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect). This still requires the relevant developer account, app configuration and App Review; the ZIP itself is not an App Store release.

### Website permissions

Allow website access for the pages where PrepTip highlights menus or adds YouTube helpers. If catalog loading, sign-in or AI generation needs permission for its backend, use **Retry**, **Sign in** or **Generate** and accept the browser's permission prompt. AI generation still requires your Gemini API key.

Safari's blocked-page redirects require `declarativeNetRequestWithHostAccess` plus permission for the originating and destination sites. The Safari manifest uses that permission in accordance with Apple's [content-blocking documentation](https://developer.apple.com/documentation/safariservices/blocking-content-with-your-safari-web-extension). Grant access to all websites if you want the extension to apply its blocklist everywhere.

## Verification before release

```sh
npm test
npm run check
npm run package:all
```

The automated checks validate each generated manifest's referenced files, source syntax, archive contents, development-file exclusions and reproducibility. Browser API tests cover panel opening, tab context and storage behavior with browser stubs. These checks do not substitute for installing in each actual browser.

Before publishing a target, install that target and check toolbar opening, account setup, switching tabs/windows, QuickStart, tip summaries, on-page guide progress, YouTube helpers, blocking and backend permissions. In Safari also check that clicking a highlighted page leaves the PrepTip window and walkthrough available; in Firefox check that disabling optional telemetry does not stop tips from working.
