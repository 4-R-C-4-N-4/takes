// D19: every piece above pawn tier must be fully symmetric (left/right AND front/back). A
// candidate's key is the ';'-joined set of expanded "dx,dy,range,path,mode" vectors (see
// docs/catalog screen output). A piece is symmetric on an axis iff for every vector, the
// vector mirrored on that axis is also present in the key.
function mirror(item: string, axis: 'dx' | 'dy'): string {
  const parts = item.split(',');
  const i = axis === 'dx' ? 0 : 1;
  parts[i] = String(-Number(parts[i]));
  return parts.join(',');
}

function isSymmetricOnAxis(key: string, axis: 'dx' | 'dy'): boolean {
  const items = key.split(';').filter((s) => s.length > 0);
  if (items.length === 0) return true;
  const set = new Set(items);
  return items.every((item) => set.has(mirror(item, axis)));
}

export function isFrontBackSymmetricKey(key: string): boolean {
  return isSymmetricOnAxis(key, 'dy');
}

export function isLeftRightSymmetricKey(key: string): boolean {
  return isSymmetricOnAxis(key, 'dx');
}

/** A key is fully symmetric iff it is both left/right and front/back symmetric. */
export function isFullySymmetricKey(key: string): boolean {
  return isLeftRightSymmetricKey(key) && isFrontBackSymmetricKey(key);
}

/** Pawn-tier candidates always pass D19 (forward-only, one-sided movement is the point of a pawn). */
export function passesFullSymmetry(key: string, tier: string): boolean {
  if (tier === 'pawn') return true;
  return isFullySymmetricKey(key);
}
