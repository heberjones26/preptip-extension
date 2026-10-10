// Sanity checks before loading the extension: every file the manifest points to exists,
// and every JS file parses. Run: npm run check
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
let failures = 0;
const fail = (msg) => { failures++; console.error('✖', msg); };

const referenced = new Set([
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
  manifest.side_panel?.default_path,
  manifest.background?.service_worker,
  ...(manifest.content_scripts || []).flatMap((cs) => [...(cs.js || []), ...(cs.css || [])]),
  ...(manifest.web_accessible_resources || []).flatMap((w) => w.resources)
].filter(Boolean));

for (const file of referenced) {
  if (!existsSync(join(root, file))) fail(`manifest references missing file: ${file}`);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

for (const file of walk(join(root, 'src')).filter((f) => f.endsWith('.js'))) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    fail(`${relative(root, file)} does not parse:\n${err.stderr}`);
  }
}

for (const file of walk(join(root, 'src')).filter((f) => f.endsWith('.json'))) {
  try { JSON.parse(readFileSync(file, 'utf8')); } catch (err) { fail(`${relative(root, file)}: ${err.message}`); }
}

if (failures) process.exit(1);
console.log(`✔ manifest files present (${referenced.size}) and all scripts parse`);
