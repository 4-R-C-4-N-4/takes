/** Engine-vs-Fairy-Stockfish perft parity [impl.md Testing Layer 2]. */
import type { Ruleset } from '@takes/library';
import { createGame, divide, type Game } from '@takes/engine';
import { variantIni, fsfDivideBatch } from '@takes/betza';

export interface ParityCase { white: string; black: string; fen: string; moves?: string[] }
export interface ParityResult { ok: boolean; case: ParityCase; engine: Record<string, number>; fsf: Record<string, number>; diff: string[] }

export function gameVariant(r: Ruleset, g: Game, name: string): string {
  return variantIni(r, { name, promotion: { w: g.promotionTargets('w'), b: g.promotionTargets('b') } });
}

/** Compare per-move divide at `depth`. Cases sharing promotion sets are batched into one FSF process. */
export function parity(r: Ruleset, cases: Array<{ white: string; black: string }>, depth: number, playout: (g: Game) => void = () => {}): ParityResult[] {
  const groups = new Map<string, Array<{ c: ParityCase; eng: Record<string, number> }>>();
  for (const { white, black } of cases) {
    const g = createGame(r, white, black);
    playout(g);
    const key = g.promotionTargets('w').join(',') + '|' + g.promotionTargets('b').join(',');
    const ini = gameVariant(r, g, 'parity');
    const arr = groups.get(ini) ?? [];
    arr.push({ c: { white, black, fen: g.toFEN() }, eng: divide(g, depth) });
    groups.set(ini, arr);
    void key;
  }
  const out: ParityResult[] = [];
  for (const [ini, arr] of groups) {
    const fsf = fsfDivideBatch(ini, 'parity', arr.map((a) => a.c.fen), depth);
    arr.forEach((a, i) => {
      const f = fsf[i]!; const e = a.eng;
      const diff: string[] = [];
      for (const k of new Set([...Object.keys(f), ...Object.keys(e)])) if (f[k] !== e[k]) diff.push(`${k}: engine=${e[k] ?? '-'} fsf=${f[k] ?? '-'}`);
      out.push({ ok: diff.length === 0, case: a.c, engine: e, fsf: f, diff: diff.sort() });
    });
  }
  return out;
}
