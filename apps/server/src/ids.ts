/** Invite code / token generation helpers. */
import { randomInt, randomBytes } from 'node:crypto';
import { INVITE_ALPHABET, INVITE_LENGTH } from '@takes/protocol';

export function generateInviteCode(): string {
  let out = '';
  for (let i = 0; i < INVITE_LENGTH; i++) {
    out += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  }
  return out;
}

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}
