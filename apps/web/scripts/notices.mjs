// Collect installed runtime dependency notices for distribution (including embedded font licences).
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const seen = new Set();
const sections = ['Takes — third-party notices\n\nApplication source: Apache-2.0. Fairy-Stockfish is not bundled.'];
function locate(name, from) {
  let dir = from;
  for (;;) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`Cannot locate installed dependency ${name}`);
    dir = parent;
  }
}
function visit(name, from) {
  if (name.startsWith('@takes/')) return;
  const dir = locate(name, from);
  const data = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const key = `${data.name}@${data.version}`;
  if (seen.has(key)) return;
  seen.add(key);
  const files = readdirSync(dir).filter(f => /^(licen[cs]e|copying|notice|ofl)(\.|$)/i.test(f));
  if (!files.length) throw new Error(`No licence notice found for ${key}; review before publishing`);
  sections.push(`${key} (${data.license ?? 'see licence'})\n${files.map(f => readFileSync(join(dir, f), 'utf8')).join('\n')}`);
  // Follow actual installed paths so pnpm's per-package dependency links resolve correctly.
  const realDir = realpathSync(dir);
  const deps = name === 'svelte' ? ['esm-env', 'clsx'] : Object.keys(data.dependencies ?? {});
  for (const dep of deps) visit(dep, realDir);
}
// Root runtime imports, including Svelte's client runtime (not its compiler dependencies).
for (const name of new Set([...Object.keys(pkg.dependencies), 'svelte'])) visit(name, root);
const out = join(root, 'public', 'THIRD-PARTY-NOTICES.txt');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, sections.join('\n\n' + '='.repeat(72) + '\n\n') + '\n');
console.log(`Notices: ${seen.size} installed runtime dependencies`);
