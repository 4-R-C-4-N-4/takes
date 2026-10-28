import { describe, expect, it } from 'vitest';
import { cpuColorFor } from './sides.js';

describe('vs-CPU side selection', () => {
  it('gives the CPU the colour the player did not pick', () => {
    expect(cpuColorFor('w')).toBe('b');
    expect(cpuColorFor('b')).toBe('w');
  });
});
