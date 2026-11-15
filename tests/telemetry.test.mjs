import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSendTelemetry } from '../src/lib/telemetry.js';

const firefoxManifest = {
  manifest_version: 3,
  browser_specific_settings: {
    gecko: { data_collection_permissions: { required: ['none'], optional: ['technicalAndInteraction'] } }
  }
};

function extension(manifest = firefoxManifest, getAll = async () => ({ data_collection: [] })) {
  return { runtime: { id: 'preptip-test', getManifest: () => manifest }, permissions: { getAll } };
}

test('Firefox optional telemetry stays off until interaction data is granted', async () => {
  for (const data_collection of [[], ['none'], ['personallyIdentifyingInfo']]) {
    assert.equal(await canSendTelemetry(extension(firefoxManifest, async () => ({ data_collection }))), false);
  }
  assert.equal(await canSendTelemetry(extension(firefoxManifest, async () => ({
    data_collection: ['technicalAndInteraction']
  }))), true);
});

test('Firefox telemetry checks the current permission again after revocation', async () => {
  let allowed = false;
  let checks = 0;
  const api = extension(firefoxManifest, async () => {
    checks++;
    return { data_collection: allowed ? ['technicalAndInteraction'] : [] };
  });
  assert.equal(await canSendTelemetry(api), false);
  allowed = true;
  assert.equal(await canSendTelemetry(api), true);
  allowed = false;
  assert.equal(await canSendTelemetry(api), false);
  assert.equal(checks, 3);
});

test('Firefox telemetry fails closed when permission APIs are absent or fail', async () => {
  const noPermissions = extension();
  delete noPermissions.permissions;
  assert.equal(await canSendTelemetry(noPermissions), false);
  assert.equal(await canSendTelemetry(extension(firefoxManifest, async () => {
    throw new Error('Permissions unavailable');
  })), false);
  for (const permissions of [undefined, {}, { data_collection: 'technicalAndInteraction' }]) {
    assert.equal(await canSendTelemetry(extension(firefoxManifest, async () => permissions)), false);
  }
});

test('ordinary API permissions do not grant Firefox optional data collection', async () => {
  const api = extension(firefoxManifest, async () => ({
    permissions: ['technicalAndInteraction'], origins: ['<all_urls>']
  }));
  assert.equal(await canSendTelemetry(api), false);
});

test('Chromium and Safari retain telemetry without Firefox consent declarations', async () => {
  for (const manifest of [
    { manifest_version: 3, minimum_chrome_version: '116' },
    { manifest_version: 3, browser_specific_settings: { safari: {} } }
  ]) {
    const api = extension(manifest, () => assert.fail('No Firefox permission check is required'));
    assert.equal(await canSendTelemetry(api), true);
  }
});

test('telemetry is disabled without a working extension runtime', async () => {
  for (const api of [null, {}, { runtime: {} }, { runtime: { id: 'preview' } }]) {
    assert.equal(await canSendTelemetry(api), false);
  }
  assert.equal(await canSendTelemetry(extension(null)), false);
  assert.equal(await canSendTelemetry({ runtime: {
    id: 'broken', getManifest: () => { throw new Error('Extension context invalidated'); }
  } }), false);
});

test('telemetry defaults to the runtime available when called', async () => {
  const previousBrowser = globalThis.browser;
  const previousChrome = globalThis.chrome;
  try {
    delete globalThis.browser;
    delete globalThis.chrome;
    assert.equal(await canSendTelemetry(), false);
    globalThis.browser = extension({ manifest_version: 3 });
    assert.equal(await canSendTelemetry(), true);
  } finally {
    if (previousBrowser === undefined) delete globalThis.browser;
    else globalThis.browser = previousBrowser;
    if (previousChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = previousChrome;
  }
});
