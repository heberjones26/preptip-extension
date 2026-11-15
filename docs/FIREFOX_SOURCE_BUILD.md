# Reproduce the PrepTip Firefox extension

This source archive accompanies PrepTip 0.1.1 for desktop Firefox 140+.

## Environment

- The submitted extension was built on Windows using Node.js v24.13.0, with bundled zlib 1.3.1-470d3a2.
- Install [Node.js](https://nodejs.org/en/download) 20 or newer. The scripts also run on Linux and macOS. Use v24.13.0 to match the submitted build environment.
- There are no external build dependencies and no packages to install. The scripts use only Node.js built-in modules, so no dependency lockfile is needed.
- Existing PNG icons are supplied. Do not regenerate them for this build.

## Build

Extract the source ZIP into an empty directory, then run this command from its root (the directory containing `manifest.json`):

```sh
node scripts/package.mjs firefox
```

Alternatively, `npm run package:firefox` runs the same command. In Windows PowerShell, use `npm.cmd run package:firefox` if execution policy blocks `npm.ps1`.

The unpacked extension is written to `dist/firefox/`. The installable extension archive is written to `dist/preptip_firefox-0.1.1.zip`.

## What the build changes

`scripts/browser-manifests.mjs` derives the Firefox manifest from the root Chromium manifest. It changes the background and sidebar declarations, removes Chromium-only settings, adds Firefox data-consent and minimum-version declarations, and disables private browsing.

`scripts/package.mjs` copies `src/` and `icons/` without changing their contents, omits the three development-preview files listed in that script, and writes the generated manifest and ZIP. JavaScript, HTML, and CSS are not minified, bundled, transpiled, or generated from templates. There are no remotely downloaded build inputs.

Compare the resulting `dist/firefox/` files with the extracted submitted extension. Their paths and contents must match exactly. ZIP compression bytes can vary between Node.js/zlib versions even when the extracted contents match.

This minimal source archive contains the inputs needed to reproduce the submitted extension. The repository's dashboard, backend, development tests, and deployment configuration are not needed for this build.
