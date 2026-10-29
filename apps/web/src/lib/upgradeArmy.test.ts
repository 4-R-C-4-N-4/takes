import { describe, expect, it } from 'vitest';
import { upgradeSetup } from './upgradeArmy.js';

describe('upgrading saved armies to the current ruleset', () => {
  it('re-versions an army that is still legal under the current ruleset', () => {
    expect(upgradeSetup('2026.3:R{halo}B1KB{jester}R/PPPPPPPP/8')).toEqual({ ok: true, setup: '2026.4:R{halo}B1KB{jester}R/PPPPPPPP/8' });
  });

  it('refuses when the army breaks the new rules (Bane now costs more), and says why', () => {
    const res = upgradeSetup('2026.3:R{seal}B{bane}KB{seal}R/PPPPPPPP/8'); // 5+5+3+12+3+5+5+8 = 46 > 39 even before
    expect(res.ok).toBe(false);
    const tight = upgradeSetup('2026.3:R{impact}B{bane}KB1R/PPPPPPPP/8'); // 38 in 2026.3, 41 in 2026.4
    expect(tight).toMatchObject({ ok: false });
    if (!tight.ok) expect(tight.reason).toMatch(/budget|pool|exceeds/i);
  });

  it('refuses armies using pieces the current ruleset no longer has', () => {
    const res = upgradeSetup('2026.2:R{toad}BQKB{heron}R/PPPPPPPP/8');
    expect(res.ok).toBe(false);
  });

  it('leaves current armies alone', () => {
    expect(upgradeSetup('2026.4:RNBQKBNR/PPPPPPPP/8')).toEqual({ ok: true, setup: '2026.4:RNBQKBNR/PPPPPPPP/8' });
  });
});
