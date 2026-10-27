import type { Ruleset } from './types.js';
import { KING_ID } from './types.js';

/** Classic single-letter codes in setup strings (impl.md "Setup string"). */
export const CLASSIC_LETTERS: Record<string, string> = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' };
const CLASSIC_BY_ID: Record<string, string> = Object.fromEntries(Object.entries(CLASSIC_LETTERS).map(([k, v]) => [v, k]));

/** A parsed setup: 3 ranks x 8 files from the owner's POV. ranks[0] = rank 1. null = empty. */
export interface Setup {
  version: string;
  ranks: Array<Array<string | null>>; // [3][8] of pieceId
}

export class SetupParseError extends Error {}

export function parseSetup(s: string): Setup {
  const colon = s.indexOf(':');
  if (colon <= 0) throw new SetupParseError('missing ruleset version prefix');
  const version = s.slice(0, colon);
  const body = s.slice(colon + 1);
  const rankStrs = body.split('/');
  if (rankStrs.length !== 3) throw new SetupParseError(`expected 3 ranks, got ${rankStrs.length}`);
  const ranks = rankStrs.map((rs, ri) => {
    const row: Array<string | null> = [];
    let i = 0;
    while (i < rs.length) {
      const ch = rs[i]!;
      if (ch >= '1' && ch <= '8') { for (let n = 0; n < Number(ch); n++) row.push(null); i++; }
      else if (ch === '{') {
        const end = rs.indexOf('}', i);
        if (end < 0) throw new SetupParseError(`unterminated {id} on rank ${ri + 1}`);
        const id = rs.slice(i + 1, end);
        if (!/^[a-z][a-z0-9_-]*$/.test(id)) throw new SetupParseError(`bad piece id '${id}'`);
        row.push(id); i = end + 1;
      } else if (CLASSIC_LETTERS[ch]) { row.push(CLASSIC_LETTERS[ch]!); i++; }
      else throw new SetupParseError(`unexpected '${ch}' on rank ${ri + 1}`);
    }
    if (row.length !== 8) throw new SetupParseError(`rank ${ri + 1} has ${row.length} files, expected 8`);
    return row;
  });
  return { version, ranks };
}

export function serializeSetup(setup: Setup): string {
  const body = setup.ranks.map((row) => {
    let out = ''; let empty = 0;
    for (const id of row) {
      if (id === null) { empty++; continue; }
      if (empty) { out += String(empty); empty = 0; }
      out += CLASSIC_BY_ID[id] ?? `{${id}}`;
    }
    if (empty) out += String(empty);
    return out;
  }).join('/');
  return `${setup.version}:${body}`;
}

/** Piece ids used (excluding king), with counts. */
export function setupCounts(setup: Setup): Record<string, number> {
  const c: Record<string, number> = {};
  for (const row of setup.ranks) for (const id of row) if (id && id !== KING_ID) c[id] = (c[id] ?? 0) + 1;
  return c;
}

export function setupCost(setup: Setup, ruleset: Ruleset): number {
  let total = 0;
  for (const [id, n] of Object.entries(setupCounts(setup))) total += (ruleset.costs[id] ?? NaN) * n;
  return total;
}

/**
 * Absolute square index (a1=0..h8=63) for a setup cell. Black's rank 1 maps to rank 8; files unchanged.
 */
export function setupSquare(color: 'w' | 'b', rankIdx: number, file: number): number {
  const rank = color === 'w' ? rankIdx : 7 - rankIdx;
  return rank * 8 + file;
}
