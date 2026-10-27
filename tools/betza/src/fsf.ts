/** Minimal synchronous Fairy-Stockfish UCI driver for tools/tests (not for production bots). */
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

export function fsfPath(): string | null {
  const p = process.env.FSF_PATH ?? join(homedir(), 'programs/Fairy-Stockfish/src/stockfish');
  return existsSync(p) ? p : null;
}

/** Runs `go perft depth` and returns the divide map (uci -> count). */
export function fsfDivide(ini: string, variant: string, fen: string, depth: number): Record<string, number> {
  return fsfDivideBatch(ini, variant, [fen], depth)[0]!;
}

/** One FSF process, many positions. Returns one divide map per FEN, in order. */
export function fsfDivideBatch(ini: string, variant: string, fens: string[], depth: number): Array<Record<string, number>> {
  const bin = fsfPath();
  if (!bin) throw new Error('Fairy-Stockfish not found (set FSF_PATH)');
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'fsf-'));
  const iniPath = join(dir, 'variants.ini');
  writeFileSync(iniPath, ini);
  const input = [`setoption name VariantPath value ${iniPath}`, `setoption name UCI_Variant value ${variant}`, 'setoption name UCI_Chess960 value true', ...fens.flatMap((f) => [`position fen ${f}`, `go perft ${depth}`]), 'quit', ''].join('\n');
  const res = spawnSync(bin, [], { input, encoding: 'utf8', maxBuffer: 64 << 20 });
  if (res.status !== 0) throw new Error(`fsf exited ${res.status}: ${res.stderr}`);
  if (/variant .* not found|Invalid/i.test(res.stdout)) throw new Error('fsf rejected variant: ' + res.stdout.slice(0, 500));
  const results: Array<Record<string, number>> = [];
  let cur: Record<string, number> = {};
  for (const line of res.stdout.split('\n')) {
    const t = line.trim();
    const m = /^([a-z]\d+[a-z]\d+[a-z]?): (\d+)$/.exec(t);
    if (m) cur[m[1]!] = Number(m[2]);
    else if (t.startsWith('Nodes searched')) { results.push(cur); cur = {}; }
  }
  if (results.length !== fens.length) throw new Error(`fsf returned ${results.length} results for ${fens.length} positions`);
  return results;
}
