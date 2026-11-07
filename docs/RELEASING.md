# Releasing PrepTip to the Chrome Web Store

Code changes (`manifest.json`, `src/`, `icons/`) reach teachers only through a Chrome Web Store release.
Tip content lives in Supabase and needs no release.

Releases are automated by [`.github/workflows/release.yml`](../.github/workflows/release.yml): pushing a
`v*` tag tests the code, builds the zip, attaches it to a GitHub Release, uploads it to the Web Store and
submits it for review. Once Google approves it, installed copies update themselves within a few hours.

## Cutting a release

1. Merge your changes to `main`.
2. Bump `"version"` in `manifest.json` (and `package.json` to match). The store rejects any upload whose
   version isn't higher than the last one.
3. Tag and push:

   ```bash
   git switch main && git pull
   git tag v0.1.1
   git push origin v0.1.1
   ```

4. Watch the **Release** run in the repo's Actions tab. The workflow fails before uploading if the tag
   doesn't match the manifest version or a test fails.
5. Track the review in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole/9d329ed8-79eb-43c7-8950-3506ae6f837c/aningbmgfcfgpjodmgonhmlkncicjdlf/edit/status).

Only one version can be in review at a time. If a tag is pushed while an earlier version is still being
reviewed, the upload step fails; wait for the review, then re-run the failed job from the Actions tab.

**Build the zip without releasing:** run `npm run package` locally (writes `dist/preptip-<version>.zip`),
or Actions → **Release** → **Run workflow**, which builds and saves the zip as a run artifact but never
uploads it.

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
- If you'd rather not keep a key at all, Google also supports
  [Workload Identity Federation](https://github.com/google-github-actions/auth#workload-identity-federation-through-a-service-account)
  for GitHub Actions; swap `credentials_json` in the workflow for `workload_identity_provider` and
  `service_account`.
