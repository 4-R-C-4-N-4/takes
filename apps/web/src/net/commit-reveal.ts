/**
 * Commit-reveal helpers for blind setup exchange over P2P [PROD-PLAN §2 "Peer-to-peer online play"].
 * Pure, WebCrypto-based (SHA-256); no transport/UI concerns here so it is cheaply unit-testable.
 *
 * Flow: each side commits to its setup before either reveals, so the host's
 * in-browser RoomCore cannot peek at the guest's army (and vice versa) before
 * both armies are locked in.
 */

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = '';
  for (const b of arr) out += b.toString(16).padStart(2, '0');
  return out;
}

/** 16 random bytes as a hex string, suitable as the commit salt. */
export function randomSaltHex(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/** commit = SHA-256(setup + ':' + salt), hex-encoded. */
export async function commitSetup(setup: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${setup}:${salt}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}

/** Recomputes the commit from a revealed (setup, salt) and checks it matches. */
export async function verifyCommit(setup: string, salt: string, commit: string): Promise<boolean> {
  const recomputed = await commitSetup(setup, salt);
  return recomputed === commit;
}
