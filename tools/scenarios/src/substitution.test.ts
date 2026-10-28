import { describe, it, expect } from 'vitest';
import { getRuleset } from '@takes/library';
import { tierSubstitution, buildCandidateArmy } from '../src/substitution.js';
import { buildCandidateRuleset } from '../src/candidate-ruleset.js';
import { FIXTURE_CATALOG } from '../src/fixtures.js';

function candidateCopies(army: string, candidateId: string): number {
  return army.split(`{${candidateId}}`).length - 1;
}

describe('same-tier substitution', () => {
  const base = getRuleset('2026.2')!;

  it('pawn tier substitutes pawns, with a 3-copy variant available', () => {
    expect(tierSubstitution('pawn', 0)).toEqual({ referenceId: 'pawn', count: 1 });
    expect(tierSubstitution('pawn', 1)).toEqual({ referenceId: 'pawn', count: 3 });
  });

  it('minor tier substitutes knight or bishop', () => {
    expect(tierSubstitution('minor', 0).referenceId).toBe('knight');
    expect(tierSubstitution('minor', 1).referenceId).toBe('bishop');
  });

  it('rook tier substitutes rook, major tier substitutes queen', () => {
    expect(tierSubstitution('rook').referenceId).toBe('rook');
    expect(tierSubstitution('major').referenceId).toBe('queen');
  });

  it('buildCandidateArmy (classic path) swaps exactly `count` reference pieces for the candidate', () => {
    const entry = FIXTURE_CATALOG.find((e) => e.piece.id === 'f_wazir')!; // pawn tier
    const { ruleset, candidateId } = buildCandidateRuleset(base, entry, 1);
    const sub = tierSubstitution(entry.tier);
    const army = buildCandidateArmy(ruleset, candidateId, sub, false, 1);
    expect(candidateCopies(army, candidateId)).toBe(sub.count);
  });

  it('3-copy pawn-tier variant places 3 candidates', () => {
    const entry = FIXTURE_CATALOG.find((e) => e.piece.id === 'f_ferz')!;
    const { ruleset, candidateId } = buildCandidateRuleset(base, entry, 1);
    const sub = tierSubstitution(entry.tier, 1);
    const army = buildCandidateArmy(ruleset, candidateId, sub, false, 2);
    expect(candidateCopies(army, candidateId)).toBe(3);
  });

  it('random-profile path places at least one candidate copy (falling back to classic if scarce)', () => {
    const entry = FIXTURE_CATALOG.find((e) => e.piece.id === 'f_archbishop')!;
    const { ruleset, candidateId } = buildCandidateRuleset(base, entry, 9);
    const sub = tierSubstitution(entry.tier);
    const army = buildCandidateArmy(ruleset, candidateId, sub, true, 42);
    expect(candidateCopies(army, candidateId)).toBeGreaterThanOrEqual(1);
  });
});
