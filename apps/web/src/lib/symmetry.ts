// D19: minor pieces should be front/back symmetric. A candidate's key is the ';'-joined set of
// expanded "dx,dy,range,path,mode" vectors (see docs/catalog screen output). A piece is
// front/back symmetric iff for every vector, the vector with dy negated is also present.
export function isFrontBackSymmetricKey(key: string): boolean {
  const items = key.split(';').filter((s) => s.length > 0);
  if (items.length === 0) return true;
  const set = new Set(items);
  for (const item of items) {
    const parts = item.split(',');
    const dy = Number(parts[1]);
    const mirrored = [parts[0], String(-dy), ...parts.slice(2)].join(',');
    if (!set.has(mirrored)) return false;
  }
  return true;
}

/** Pawn-tier candidates always pass D19 (forward-only movement is the point of a pawn). */
export function passesFrontBackSymmetry(key: string, tier: string): boolean {
  if (tier === 'pawn') return true;
  return isFrontBackSymmetricKey(key);
}
