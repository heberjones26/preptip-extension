// Validate every browser's packaged manifest and all source JavaScript/JSON.
import { readFileSync, existsSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { BROWSER_TARGETS, manifestReferences } from './browser-manifests.mjs';
import { buildPackages } from './package.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
let failures = 0;
const fail = (message) => { failures++; console.error(message); };
const output = mkdtempSync(join(tmpdir(), 'preptip-check-'));
try {
  for (const build of buildPackages({ browsers: BROWSER_TARGETS, outDir: output, archives: false })) {
    const manifest = JSON.parse(readFileSync(join(build.directory, 'manifest.json'), 'utf8'));
    const references = manifestReferences(manifest);
    for (const file of references) {
      if (!existsSync(join(build.directory, file))) fail(`${build.browser} manifest references missing file: ${file}`);
    }
    console.log(`${build.browser}: ${references.size} manifest references checked`);
  }
} finally {
  // output is the exact temporary directory just returned by mkdtempSync.
  rmSync(output, { recursive: true, force: true });
}

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
for (const file of [...walk(join(root, 'src')), ...walk(join(root, 'scripts'))]) {
  if (/\.m?js$/.test(file)) {
    try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
    catch (error) { fail(`${relative(root, file)} does not parse:\n${error.stderr}`); }
  } else if (file.endsWith('.json')) {
    try { JSON.parse(readFileSync(file, 'utf8')); }
    catch (error) { fail(`${relative(root, file)}: ${error.message}`); }
  }
}
if (failures) process.exit(1);
console.log('All browser manifest references exist and all scripts parse');
