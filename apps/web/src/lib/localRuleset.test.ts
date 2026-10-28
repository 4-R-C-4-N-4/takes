import { describe, expect, it } from 'vitest';
import { getRuleset } from '@takes/library';
import { createGame } from '@takes/engine';
import { localRuleset } from './localRuleset.js';

describe('local (hotseat/CPU) game ruleset', () => {
  it('uses the ruleset the armies were built for, not just the current one', () => {
    const r = localRuleset('2026.2:R{toad}BQKB{heron}R/PPPPPPPP/8', '2026.2:RNBQKBNR/PPPPPPPP/8');
    expect(r.version).toBe('2026.2');
    expect(() => createGame(r, '2026.2:R{toad}BQKB{heron}R/PPPPPPPP/8', '2026.2:RNBQKBNR/PPPPPPPP/8')).not.toThrow();
  });
  it('keeps candidate sandboxes on their base ruleset', () => {
    expect(localRuleset('2026.3+candidate:RNBQKBNR/PPPPPPPP/8', '2026.3+candidate:RNBQKBNR/PPPPPPPP/8').version).toBe('2026.3');
  });
  it('rejects armies from different or unknown rulesets with a readable message', () => {
    expect(() => localRuleset('2026.2:RNBQKBNR/PPPPPPPP/8', '2026.3:RNBQKBNR/PPPPPPPP/8')).toThrow(/same ruleset/);
    expect(() => localRuleset('1999.1:RNBQKBNR/PPPPPPPP/8', '1999.1:RNBQKBNR/PPPPPPPP/8')).toThrow(/Unknown ruleset/);
  });
  it('returns the published ruleset object', () => {
    expect(localRuleset('2026.3:RNBQKBNR/PPPPPPPP/8', '2026.3:RNBQKBNR/PPPPPPPP/8')).toBe(getRuleset('2026.3'));
  });
});
