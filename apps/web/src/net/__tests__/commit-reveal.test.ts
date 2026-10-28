import { describe, expect, it } from 'vitest';
import { commitSetup, randomSaltHex, verifyCommit } from '../commit-reveal.js';

describe('commit-reveal', () => {
  it('produces a stable 64-hex-char commit for the same input', async () => {
    const commit = await commitSetup('abcxyz', 'deadbeef');
    expect(commit).toMatch(/^[0-9a-f]{64}$/);
    expect(await commitSetup('abcxyz', 'deadbeef')).toBe(commit);
  });

  it('verifies a correctly revealed setup+salt against its commit', async () => {
    const salt = randomSaltHex();
    const setup = 'rnbqkbnr';
    const commit = await commitSetup(setup, salt);
    expect(await verifyCommit(setup, salt, commit)).toBe(true);
  });

  it('rejects a tampered setup (host/guest cheated) against the original commit', async () => {
    const salt = randomSaltHex();
    const commit = await commitSetup('rnbqkbnr', salt);
    expect(await verifyCommit('rnbqkqnr', salt, commit)).toBe(false);
  });

  it('rejects a tampered salt against the original commit', async () => {
    const setup = 'rnbqkbnr';
    const commit = await commitSetup(setup, randomSaltHex());
    expect(await verifyCommit(setup, randomSaltHex(), commit)).toBe(false);
  });

  it('does not leak the setup before reveal: commit alone does not determine the setup string', async () => {
    const salt = randomSaltHex();
    const commitA = await commitSetup('setupA', salt);
    const commitB = await commitSetup('setupB', salt);
    expect(commitA).not.toBe(commitB);
    // Same commit never trivially reproducible without knowing setup+salt (i.e. it's a hash, not reversible/encoded).
    expect(commitA.includes('setupA')).toBe(false);
  });

  it('randomSaltHex produces distinct 32-hex-char salts', () => {
    const a = randomSaltHex();
    const b = randomSaltHex();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
});
