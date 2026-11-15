// Builds unpacked extensions and deterministic archives, without dependencies.
// npm run package defaults to Chromium and preserves the Chrome Web Store zip name.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSER_TARGETS, browserManifest } from './browser-manifests.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const INCLUDE = ['manifest.json', 'src', 'icons'];
// These stubs and test pages run in ordinary tabs, never in the installed extension.
const EXCLUDE = new Set(['src/sidepanel/dev.html', 'src/sidepanel/dev-chrome-stub.js', 'src/sidepanel/dev-catalog.json']);

function walk(path) {
  return statSync(path).isDirectory() ? readdirSync(path).sort().flatMap((name) => walk(join(path, name))) : [path];
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Fixed timestamp (1980-01-01) makes archives reproducible for unchanged sources.
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [path, data] of entries) {
    const packed = deflateRawSync(data, { level: 9 });
    const name = Buffer.from(path, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(33, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(33, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centrals.reduce((size, buffer) => size + buffer.length, 0), 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

export function buildPackages({ browsers = ['chromium'], outDir = join(root, 'dist'), archives = true } = {}) {
  // Validate all targets before writing or removing any directories.
  for (const browser of browsers) {
    if (!BROWSER_TARGETS.includes(browser)) throw new Error(`Unknown browser target: ${browser}`);
  }
  const source = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  const files = INCLUDE.flatMap((entry) => walk(join(root, entry)))
    .map((path) => relative(root, path).split(sep).join('/'))
    .filter((path) => !EXCLUDE.has(path));
  const output = resolve(outDir);
  mkdirSync(output, { recursive: true });
  return [...new Set(browsers)].map((browser) => {
    const manifest = browserManifest(source, browser);
    const directory = resolve(output, browser);
    // Only replace the named browser directory immediately inside our output folder.
    if (dirname(directory) !== output || relative(output, directory) !== browser) {
      throw new Error(`Unsafe package output: ${directory}`);
    }
    rmSync(directory, { recursive: true, force: true });
    mkdirSync(directory, { recursive: true });
    const entries = files.map((path) => [path, path === 'manifest.json'
      ? Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
      : readFileSync(join(root, path))]);
    for (const [path, data] of entries) {
      const destination = join(directory, path);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, data);
    }
    let archive = null;
    if (archives) {
      // These names keep the release workflow's preptip-*.zip glob Chromium-only.
      const name = browser === 'chromium' ? `preptip-${manifest.version}.zip` : `preptip_${browser}-${manifest.version}.zip`;
      archive = join(output, name);
      writeFileSync(archive, zip(entries));
    }
    return { browser, directory, archive, manifest, files };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const browser = process.argv[2] || 'chromium';
  const builds = buildPackages({ browsers: browser === 'all' ? BROWSER_TARGETS : [browser] });
  for (const build of builds) {
    console.log(`${build.browser}: ${relative(root, build.directory)} and ${relative(root, build.archive)} (${build.files.length} files)`);
  }
}
