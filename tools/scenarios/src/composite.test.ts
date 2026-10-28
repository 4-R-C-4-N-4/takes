import { describe, it, expect } from 'vitest';
import type { ScenarioMetrics } from '@takes/catalog';
import { rankByComposite, DEFAULT_WEIGHTS } from '../src/composite.js';

function metrics(over: Partial<ScenarioMetrics>): ScenarioMetrics {
  return {
    games: 40, excluded: 0, score: 0.5, scoreCI: [0.4, 0.6], movesPerGame: 10, capturesPerGame: 2,
    checksPerGame: 1, forksPerGame: 1, survival: 0.8, finalAttack: 0.3, avgPlies: 100, decisive: 0.5,
    ...over,
  };
}

describe('composite ranking', () => {
  it('ranks a strong-and-active candidate above a merely-high-score, passive one', () => {
    const active = { id: 'active', metrics: metrics({ score: 0.55, movesPerGame: 20, forksPerGame: 3 }) };
    const passive = { id: 'passive', metrics: metrics({ score: 0.6, movesPerGame: 2, forksPerGame: 0 }) };
    const ranked = rankByComposite([active, passive]);
    expect(ranked[0]!.id).toBe('active');
  });

  it('penalizes candidates with excluded (parity) games', () => {
    const clean = { id: 'clean', metrics: metrics({ score: 0.5 }) };
    const dirty = { id: 'dirty', metrics: metrics({ score: 0.5, excluded: 2 }) };
    const ranked = rankByComposite([clean, dirty]);
    expect(ranked[0]!.id).toBe('clean');
  });

  it('weights are configurable: zeroing forks removes their influence', () => {
    const forky = { id: 'forky', metrics: metrics({ forksPerGame: 5, score: 0.5, movesPerGame: 10 }) };
    const plain = { id: 'plain', metrics: metrics({ forksPerGame: 0, score: 0.5, movesPerGame: 10 }) };
    const withForks = rankByComposite([forky, plain], { ...DEFAULT_WEIGHTS, forks: 1 });
    expect(withForks[0]!.id).toBe('forky');
    const noForks = rankByComposite([forky, plain], { ...DEFAULT_WEIGHTS, forks: 0 });
    expect(noForks[0]!.composite).toBeCloseTo(noForks[1]!.composite, 6);
  });

  it('returns [] for an empty input without dividing by zero', () => {
    expect(rankByComposite([])).toEqual([]);
  });
});
