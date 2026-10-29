import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadProfiles,
  addProfile,
  renameProfile,
  duplicateProfile,
  deleteProfile,
  seedIfEmpty,
  profileNeedsReview,
  updateProfile,
  autoUpgradeProfiles,
} from '../profiles.js';
import { CURRENT_RULESET_VERSION } from '@takes/library';

// Minimal localStorage polyfill for node test environment.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, v); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}

beforeEach(() => {
  (globalThis as any).localStorage = new MemoryStorage();
});

describe('profiles store', () => {
  it('starts empty and seeds samples once', () => {
    expect(loadProfiles()).toHaveLength(0);
    const seeded = seedIfEmpty();
    expect(seeded.length).toBeGreaterThanOrEqual(2);
    const again = seedIfEmpty();
    expect(again).toHaveLength(seeded.length);
  });

  it('adds, renames, duplicates and deletes a profile', () => {
    let profiles = addProfile('Test', '2026.1:RNBQKBNR/PPPPPPPP/8');
    const id = profiles[0]!.id;
    profiles = renameProfile(id, 'Renamed');
    expect(profiles[0]!.name).toBe('Renamed');
    profiles = duplicateProfile(id);
    expect(profiles).toHaveLength(2);
    profiles = deleteProfile(id);
    expect(profiles).toHaveLength(1);
  });

  it('flags profiles pinned to an old ruleset version as needing review', () => {
    const profiles = addProfile('Old', '1999.0:RNBQKBNR/PPPPPPPP/8');
    expect(profileNeedsReview(profiles[0]!)).toBe(true);
  });

  it('saving an edited army updates it in place instead of adding a copy', () => {
    let profiles = addProfile('Mine', '2026.3:R{impact}B{bane}KB1R/PPPPPPPP/8');
    const id = profiles[0]!.id;
    profiles = updateProfile(id, 'Mine v2', `${CURRENT_RULESET_VERSION}:R{impact}B{bane}KB2/PPPPPPPP/8`);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ id, name: 'Mine v2', setup: `${CURRENT_RULESET_VERSION}:R{impact}B{bane}KB2/PPPPPPPP/8` });
    expect(loadProfiles()).toEqual(profiles);
  });

  it('automatically moves still-legal old armies to the current ruleset and leaves broken ones for review', () => {
    addProfile('Leapers', '2026.3:R{halo}B1KB{jester}R/PPPPPPPP/8');
    addProfile('Too rich', '2026.3:R{impact}B{bane}KB1R/PPPPPPPP/8'); // over the pool once Bane costs 15
    addProfile('Current', `${CURRENT_RULESET_VERSION}:RNBQKBNR/PPPPPPPP/8`);
    const { profiles, upgraded } = autoUpgradeProfiles();
    expect(upgraded).toBe(1);
    expect(profiles.map((p) => p.setup)).toEqual([
      `${CURRENT_RULESET_VERSION}:R{halo}B1KB{jester}R/PPPPPPPP/8`,
      '2026.3:R{impact}B{bane}KB1R/PPPPPPPP/8',
      `${CURRENT_RULESET_VERSION}:RNBQKBNR/PPPPPPPP/8`,
    ]);
    expect(loadProfiles()).toEqual(profiles);
    expect(autoUpgradeProfiles().upgraded).toBe(0); // idempotent
  });

  it('survives a storage exception by returning an empty list', () => {
    (globalThis as any).localStorage = {
      getItem() { throw new Error('boom'); },
      setItem() { throw new Error('boom'); },
    };
    expect(loadProfiles()).toEqual([]);
  });
});
