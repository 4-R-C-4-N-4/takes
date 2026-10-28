// Local games (hotseat, vs CPU, candidate test drives) must run under the ruleset the armies were
// built for. Saved armies and in-progress sessions outlive a ruleset bump; forcing the current
// version onto a '2026.2:' setup throws instead of playing.
import { getRuleset, type Ruleset } from '@takes/library';

const versionOf = (setup: string) => setup.slice(0, Math.max(0, setup.indexOf(':')));

export function localRuleset(white: string, black: string): Ruleset {
  const w = versionOf(white), b = versionOf(black);
  if (w !== b) throw new Error(`Both armies must use the same ruleset (White ${w || '?'}, Black ${b || '?'}).`);
  // Candidate sandboxes are '<base>+candidate'; the caller layers the candidate piece on top.
  const base = w.replace(/\+candidate$/, '');
  const r = getRuleset(base);
  if (!r) throw new Error(`Unknown ruleset '${base}'.`);
  return r;
}
