// Low-cost non-pawn candidates: busy-board mobility and whether they can mate with their king's help.
import type { Piece, Component } from '@takes/library';
import { analyseMate } from '../src/mate.js';
import { mobilityOf } from './mobility-lib.js';

const leap = (vec: [number, number], sym: Component['sym'] = 'all'): Component => ({ vec, sym, range: 1, path: 'leap', mode: 'both' });
const P = (components: Component[]): Piece => ({ id: 'x', name: 'x', glyph: 'Z', tier: 'minor', components });
const W = leap([1, 0]), F = leap([1, 1]), D = leap([2, 0]), A = leap([2, 2]), N = leap([1, 2]);
const vW = leap([0, 1], ['f', 'b']), sW = leap([1, 0], ['l', 'r']);
const list: Array<[string, string, Piece]> = [
  ['W', 'Wazir', P([W])], ['F', 'Ferz', P([F])], ['D', 'Dabbaba', P([D])], ['A', 'Alfil', P([A])],
  ['vWF', 'Dancer (ours): the symmetric Copper/Silver General', P([vW, F])], ['sWF', 'Dancer turned sideways', P([sW, F])],
  ['WA', 'Waffle / Phoenix (was Heron in 2026.2)', P([W, A])], ['FD', 'Ferz + Dabbaba (was Toad in 2026.2)', P([F, D])],
  ['AD', 'Alibaba', P([A, D])], ['FA', 'Ferz + Alfil', P([F, A])], ['WD', 'Wazir + Dabbaba ("Woody Rook" family)', P([W, D])],
  ['FAD', 'FAD', P([F, A, D])], ['WAD', 'Champion', P([W, A, D])], ['WF', 'Man / Commoner (Prince, ours)', P([W, F])],
  ['N', 'Knight (reference)', P([N])],
];
console.log('| Betza | Name | Busy-board mobility (25%) | Mates with its king? | Longest mate |');
console.log('| --- | --- | --- | --- | --- |');
for (const [b, name, p] of list) {
  const a = analyseMate(p, true);
  console.log(`| ${b} | ${name} | ${mobilityOf(p).toFixed(1)} | ${a.winShare > 0.9 ? 'yes' : a.winShare > 0 ? `partly (${(a.winShare * 100).toFixed(0)}%)` : 'no'} | ${a.winShare > 0.9 ? a.longestMate : '–'} |`);
}
