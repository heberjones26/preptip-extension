// Draws the PrepTip lightbulb logo into icons/icon-{16,32,48,128}.png with no dependencies.
// Run: node scripts/make-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const ORANGE = [232, 89, 12];
const WHITE = [255, 255, 255];

// Shapes in the logo's 24x24 design space (matches the SVG in the mockup).
function roundedRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return x >= x0 && x <= x1 && y >= y0 && y <= y1 && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
const inBulb = (x, y) =>
  (x - 12) ** 2 + (y - 9.9) ** 2 <= 5.3 ** 2 ||          // glass
  roundedRect(x, y, 9.6, 12.5, 14.4, 16.6, 0.6) ||         // neck
  roundedRect(x, y, 9.6, 17.4, 14.4, 19.0, 0.8);           // base
const inPlus = (x, y) =>
  (Math.abs(x - 12) <= 0.65 && y >= 8.2 && y <= 11.6) ||
  (Math.abs(y - 10.4) <= 0.65 && x >= 10.6 && x <= 13.4);

function pixel(x, y) {
  if (!roundedRect(x, y, 0, 0, 24, 24, 6)) return null;
  if (inBulb(x, y) && !inPlus(x, y)) return WHITE;
  return ORANGE;
}

function render(size) {
  const SS = 4; // supersampling for smooth edges
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = pixel(((px + (sx + 0.5) / SS) / size) * 24, ((py + (sy + 0.5) / SS) / size) * 24);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
        }
      }
      const i = (py * size + px) * 4;
      if (a) { rgba[i] = r / a; rgba[i + 1] = g / a; rgba[i + 2] = b / a; }
      rgba[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return png(size, rgba);
}

// Minimal PNG encoder (RGBA, 8-bit, no filtering).
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
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ]);
}

const outDir = new URL('../icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(new URL(`icon-${size}.png`, outDir), render(size));
  console.log(`icons/icon-${size}.png`);
}
