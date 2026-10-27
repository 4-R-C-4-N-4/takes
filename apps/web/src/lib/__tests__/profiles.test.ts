import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadProfiles,
  addProfile,
  renameProfile,
  duplicateProfile,
  deleteProfile,
  seedIfEmpty,
  profileNeedsReview,
} from '../profiles.js';

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

  it('survives a storage exception by returning an empty list', () => {
    (globalThis as any).localStorage = {
      getItem() { throw new Error('boom'); },
      setItem() { throw new Error('boom'); },
    };
    expect(loadProfiles()).toEqual([]);
  });
});
