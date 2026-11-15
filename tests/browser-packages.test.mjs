import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { BROWSER_TARGETS, browserManifest, manifestReferences } from '../scripts/browser-manifests.mjs';
import { buildPackages } from '../scripts/package.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

function archiveContents(buffer) {
  const files = new Map();
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(buffer.readUInt16LE(offset + 8), 8, 'files use deflate');
    const size = buffer.readUInt32LE(offset + 18);
    const originalSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    const data = inflateRawSync(buffer.subarray(start, start + size));
    assert.equal(data.length, originalSize);
    assert.ok(!name.includes('\\') && !name.startsWith('/'), 'portable relative archive paths');
    files.set(name, data);
    offset = start + size;
  }
  assert.equal(buffer.readUInt32LE(offset), 0x02014b50, 'central directory follows files');
  assert.equal(buffer.readUInt32LE(buffer.length - 22), 0x06054b50);
  assert.equal(buffer.readUInt16LE(buffer.length - 12), files.size);
  return files;
}

test('browser manifests preserve Chromium and use supported Firefox/Safari entry points', () => {
  const original = structuredClone(source);
  const chromium = browserManifest(source, 'chromium');
  assert.deepEqual(chromium, source);
  assert.notEqual(chromium, source);
  const firefox = browserManifest(source, 'firefox');
  assert.deepEqual(firefox.background, { scripts: ['src/background.js'], type: 'module' });
  assert.equal(firefox.sidebar_action.default_panel, source.side_panel.default_path);
  assert.equal(firefox.sidebar_action.open_at_install, false);
  assert.equal(firefox.browser_specific_settings.gecko.strict_min_version, '140.0');
  assert.match(firefox.browser_specific_settings.gecko.id, /^preptip@/);
  assert.deepEqual(firefox.browser_specific_settings.gecko.data_collection_permissions, {
    required: ['personallyIdentifyingInfo', 'authenticationInfo'], optional: ['technicalAndInteraction']
  });
  const safari = browserManifest(source, 'safari');
  assert.deepEqual(safari.background, source.background);
  assert.equal(safari.sidebar_action, undefined);
  assert.ok(safari.permissions.includes('declarativeNetRequestWithHostAccess'));
  assert.ok(!safari.permissions.includes('declarativeNetRequest'));
  for (const manifest of [firefox, safari]) {
    assert.equal(manifest.side_panel, undefined);
    assert.equal(manifest.minimum_chrome_version, undefined);
    assert.ok(!manifest.permissions.includes('sidePanel'));
    assert.deepEqual(manifest.content_scripts, source.content_scripts);
    assert.deepEqual(manifest.host_permissions, source.host_permissions);
  }
  assert.deepEqual(source, original, 'generating another target never changes the root manifest');
  assert.throws(() => browserManifest(source, '../firefox'), /Unknown browser target/);
});

test('actual browser packages contain complete manifests/resources and exclude development pages', async (t) => {
  const output = mkdtempSync(join(tmpdir(), 'preptip-packages-'));
  t.after(() => rmSync(output, { recursive: true, force: true }));
  const builds = buildPackages({ browsers: BROWSER_TARGETS, outDir: output });
  const snapshots = new Map();
  for (const build of builds) {
    await t.test(build.browser, () => {
      const buffer = readFileSync(build.archive);
      snapshots.set(build.browser, buffer);
      const files = archiveContents(buffer);
      const manifest = JSON.parse(files.get('manifest.json').toString('utf8'));
      assert.deepEqual(manifest, browserManifest(source, build.browser));
      assert.deepEqual(manifest, JSON.parse(readFileSync(join(build.directory, 'manifest.json'), 'utf8')));
      assert.equal(files.size, build.files.length);
      for (const reference of manifestReferences(manifest)) {
        assert.ok(files.has(reference), `missing manifest resource: ${reference}`);
        assert.ok(existsSync(join(build.directory, reference)));
      }
      for (const [path, contents] of files) {
        assert.ok(path === 'manifest.json' || path.startsWith('src/') || path.startsWith('icons/'));
        assert.doesNotMatch(path, /^src\/sidepanel\/dev(?:\.|-)/);
        assert.deepEqual(readFileSync(join(build.directory, path)), contents, `${path} unpacked content matches archive`);
        if (path !== 'manifest.json') assert.deepEqual(readFileSync(join(root, path)), contents);
      }
      assert.ok(files.has('src/sidepanel/sidepanel.js'));
      assert.ok(files.has('src/lib/protocol.js'));
      assert.ok(files.has('src/lib/browser.js'));
      assert.ok(files.has('src/sidepanel/panel-context.js'));
      assert.ok(files.has('src/data/quickstarts.js'));
      writeFileSync(join(build.directory, 'obsolete.js'), 'stale file from a previous package');
    });
  }
  for (const build of buildPackages({ browsers: BROWSER_TARGETS, outDir: output })) {
    assert.deepEqual(readFileSync(build.archive), snapshots.get(build.browser), 'repeated builds are deterministic');
    assert.equal(existsSync(join(build.directory, 'obsolete.js')), false, 'rebuild removes obsolete shipped files');
  }
  assert.deepEqual(readdirSync(output).filter((name) => /^preptip-.*\.zip$/.test(name)), [`preptip-${source.version}.zip`],
    'Chrome release workflow can only select the Chromium archive');
  assert.throws(() => buildPackages({ browsers: ['../../outside'], outDir: output }), /Unknown browser target/);
});
