// Candidate keys contain expanded dx,dy,range,path,mode vectors (no special pawn rules).
// Compare quiet/capture reach including blocker requirements, not just empty-board squares.
export function hasSameMovesAndAttacksKey(key: string): boolean {
  const quiet = new Set<string>();
  const attacks = new Set<string>();
  for (const item of key.split(';').filter(Boolean)) {
    const [x, y, range, path, mode] = item.split(',');
    const dx = Number(x), dy = Number(y);
    const limit = range === 'inf' ? 7 : Number(range);
    for (let step = 1; step <= Math.min(limit, 7); step++) {
      const tx = dx * step, ty = dy * step;
      if (Math.abs(tx) > 7 || Math.abs(ty) > 7) break;
      // Adjacent steps have no intermediate square, whether encoded as slide or leap.
      const reach = `${tx},${ty},${path === 'slide' && step > 1 ? 'clear' : 'jump'}`;
      if (mode !== 'capture') quiet.add(reach);
      if (mode !== 'move') attacks.add(reach);
    }
  }
  // An unrestricted leap to a destination makes the blocked slide there redundant.
  for (const set of [quiet, attacks]) {
    for (const reach of set) if (reach.endsWith(',jump')) set.delete(reach.replace(/,jump$/, ',clear'));
  }
  return quiet.size === attacks.size && [...quiet].every((reach) => attacks.has(reach));
}
