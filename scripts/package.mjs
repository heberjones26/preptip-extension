// Builds the Chrome Web Store upload: dist/preptip-<version>.zip with manifest.json at the root
// and only the files the extension ships (manifest, src/, icons/), minus browser-only dev pages.
// No dependencies: a small zip writer on top of node:zlib. Run: npm run package
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const INCLUDE = ['manifest.json', 'src', 'icons'];
// The side panel's dev.html test page and its stubs run in a normal tab, never in the extension.
const EXCLUDE = new Set(['src/sidepanel/dev.html', 'src/sidepanel/dev-chrome-stub.js', 'src/sidepanel/dev-catalog.json']);

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));

function walk(p) {
  return statSync(p).isDirectory() ? readdirSync(p).sort().flatMap((name) => walk(join(p, name))) : [p];
}

const files = INCLUDE.flatMap((entry) => walk(join(root, entry)))
  .map((p) => relative(root, p).split(sep).join('/')) // zip paths always use forward slashes
  .filter((p) => !EXCLUDE.has(p));

// ---------- zip writer ----------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Fixed timestamp (1980-01-01) so the same sources always produce the same zip.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

const locals = [];
const centrals = [];
let offset = 0;
for (const path of files) {
  const data = readFileSync(join(root, path));
  const packed = deflateRawSync(data, { level: 9 });
  const name = Buffer.from(path, 'utf8');
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);           // version needed
  local.writeUInt16LE(0x0800, 6);       // UTF-8 names
  local.writeUInt16LE(8, 8);            // deflate
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  locals.push(local, name, packed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);         // version made by
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);

  offset += local.length + name.length + packed.length;
}

const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

const outDir = join(root, 'dist');
const out = join(outDir, `preptip-${manifest.version}.zip`);
mkdirSync(outDir, { recursive: true });
writeFileSync(out, Buffer.concat([...locals, ...centrals, end]));
console.log(`✔ ${relative(root, out)} (${files.length} files, v${manifest.version})`);
