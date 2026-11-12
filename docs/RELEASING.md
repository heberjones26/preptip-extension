# Releasing PrepTip to the Chrome Web Store

Code changes (`manifest.json`, `src/`, `icons/`) reach teachers only through a Chrome Web Store release.
Tip content lives in Supabase and needs no release.

Releases are automated by [`.github/workflows/release.yml`](../.github/workflows/release.yml). A release
tests the code, builds the zip, attaches it to a GitHub Release, uploads it to the Web Store and submits it
for review. Once Google approves it, installed copies update themselves within a few hours.

## Cutting a release (button)

1. Merge your changes to `main`.
2. On GitHub, open **Actions → Release → Run workflow**. Leave the branch on `main`, tick
   **Publish to the Chrome Web Store**, pick which part of the version to raise (`patch` turns 0.1.0 into
   0.1.1; use `minor` or `major` for bigger releases) and click **Run workflow**.

   From a terminal, the same thing is:

   ```bash
   gh workflow run release.yml --ref main -f publish=true -f bump=patch
   ```

3. The run raises `"version"` in `manifest.json` and `package.json`, tests and builds, then commits
   `Release v0.1.1` to `main` with a `v0.1.1` tag before uploading. Pull afterwards (`git pull`) so your
   copy has the new version.
4. Track the review in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole/9d329ed8-79eb-43c7-8950-3506ae6f837c/aningbmgfcfgpjodmgonhmlkncicjdlf/edit/status).

If a test fails, nothing is committed or uploaded. If `main` gets a new commit while the run is going, the
push fails; start a new run. If the upload fails after the tag was pushed (for example because another
version is still in review), use **Re-run failed jobs** on that run once it's fixed: it picks up the same
tag instead of raising the version again. If the fix needed a workflow change, re-running uses the old
workflow, so start a new run with bump **none** instead: it publishes the version already on `main`,
reusing its tag.

## Cutting a release (tag)

The older way still works: bump `"version"` in `manifest.json` (and `package.json`) yourself, merge to
`main`, then push a matching tag. The run fails before uploading if the tag doesn't match the manifest.

```bash
git switch main && git pull
git tag v0.1.1
git push origin v0.1.1
```

Only one version can be in review at a time, and the store rejects any upload whose version isn't higher
than the last one.

**Build the zip without releasing:** run `npm run package` locally (writes `dist/preptip-<version>.zip`),
or Actions → **Release** → **Run workflow** with **Publish** unticked, which builds and saves the zip as a
run artifact but never uploads it.

## One-time setup: API credentials

The workflow signs in to the Chrome Web Store API as a Google Cloud **service account**. Its key is stored
as a GitHub secret. You need to do this once, from the Google account that owns the publisher
(heberbjones@gmail.com), and that account needs 2-Step Verification turned on.

### 1. Create a Google Cloud project and enable the API

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create a project
   (for example `preptip-release`). No billing account is needed.
2. Go to **APIs & Services → Library**, search for **Chrome Web Store API**, and click **Enable**.

### 2. Create the service account and a key

1. Go to **IAM & Admin → Service Accounts → Create service account**.
2. Name it `preptip-release`. Skip the optional role and access steps; it needs no Cloud permissions.
3. Open the new account, go to **Keys → Add key → Create new key → JSON**. A `.json` file downloads.
4. Copy the service account's email (`preptip-release@<project-id>.iam.gserviceaccount.com`).

### 3. Give it access to the publisher

1. In the [Developer Dashboard](https://chrome.google.com/webstore/devconsole/9d329ed8-79eb-43c7-8950-3506ae6f837c/settings),
   open **Settings**.
2. Under **Service account**, paste the email from step 2 and click **Add a service account**, then
   **Save changes**. A publisher can have only one service account.

### 4. Store the key in GitHub

From the repo folder, with the GitHub CLI:

```bash
gh secret set CWS_SERVICE_ACCOUNT_KEY < path/to/downloaded-key.json
```

Or on GitHub: **Settings → Secrets and variables → Actions → New repository secret**, name it
`CWS_SERVICE_ACCOUNT_KEY`, and paste the whole JSON file.

Then **delete the downloaded key file**. It grants upload access to the extension, so it should only live in
the GitHub secret. If it leaks, delete the key in the Cloud Console and create a new one.

The publisher ID and extension ID aren't secret; they're set at the top of the workflow.

## Notes

- If you change the item's visibility (for example Unlisted → Public) in the dashboard, publish once by hand
  from the dashboard; the API publishes with the existing visibility.
- Any new permission in `manifest.json` needs a justification on the dashboard's **Privacy** tab before
  the release is submitted, or the review will reject it.
- The workflow trades the key for an access token itself (a signed JWT sent to Google's token endpoint),
  so only the Chrome Web Store API needs to be enabled in the Cloud project. `google-github-actions/auth`
  with `token_format: access_token` would also need the IAM Service Account Credentials API and a
  Token Creator role.
