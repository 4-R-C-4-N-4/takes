// Profile storage: localStorage 'takes.profiles', wrapped in try/catch [impl.md "Profile storage"].
import { CURRENT_RULESET_VERSION } from '@takes/library';

export interface StoredProfile {
  id: string;
  name: string;
  setup: string; // includes ruleset version prefix
  createdAt: number;
}

const KEY = 'takes.profiles';

function genId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function loadProfiles(): StoredProfile[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveProfiles(profiles: StoredProfile[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(profiles));
    return true;
  } catch {
    return false;
  }
}

export function addProfile(name: string, setup: string): StoredProfile[] {
  const profiles = loadProfiles();
  profiles.push({ id: genId(), name, setup, createdAt: Date.now() });
  saveProfiles(profiles);
  return profiles;
}

export function renameProfile(id: string, name: string): StoredProfile[] {
  const profiles = loadProfiles().map((p) => (p.id === id ? { ...p, name } : p));
  saveProfiles(profiles);
  return profiles;
}

export function duplicateProfile(id: string): StoredProfile[] {
  const profiles = loadProfiles();
  const src = profiles.find((p) => p.id === id);
  if (src) profiles.push({ ...src, id: genId(), name: `${src.name} copy`, createdAt: Date.now() });
  saveProfiles(profiles);
  return profiles;
}

export function deleteProfile(id: string): StoredProfile[] {
  const profiles = loadProfiles().filter((p) => p.id !== id);
  saveProfiles(profiles);
  return profiles;
}

export function profileNeedsReview(p: StoredProfile): boolean {
  const colon = p.setup.indexOf(':');
  const version = colon > 0 ? p.setup.slice(0, colon) : '';
  return version !== CURRENT_RULESET_VERSION;
}

export const SEED_PROFILES: Array<{ name: string; setup: string }> = [
  { name: 'Vanilla', setup: '2026.3:RNBQKBNR/PPPPPPPP/8' },
  { name: 'Leaper Court', setup: '2026.3:R{halo}B1KB{jester}R/PPPPPPPP/8' },
  { name: 'Hierophant', setup: '2026.3:R{scarab}B{hierophant}KB{seal}1/PPPPPPPP/8' },
  { name: 'Bane', setup: '2026.3:R1B{bane}KB1R/PPPPPPPP/8' },
  { name: 'Triton Push', setup: '2026.3:R{octopus}B1KB{turtle}R/PPP{triton}{triton}PPP/8' },
];

/** Seed sample profiles into localStorage on first run only (empty store). */
export function seedIfEmpty(): StoredProfile[] {
  const existing = loadProfiles();
  if (existing.length > 0) return existing;
  let profiles: StoredProfile[] = [];
  for (const s of SEED_PROFILES) profiles = addProfile(s.name, s.setup);
  return profiles;
}
