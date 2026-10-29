// Saved armies carry their ruleset version. When a new version is published, an army that is still
// legal under it (same piece ids, within budget and caps, king safe) can be moved to it in one tap.
import { CURRENT_RULESET_VERSION, getRuleset } from '@takes/library';
import { validateProfile, hasErrors } from '@takes/validator';

export type UpgradeResult = { ok: true; setup: string } | { ok: false; reason: string };

export function upgradeSetup(setup: string, toVersion: string = CURRENT_RULESET_VERSION): UpgradeResult {
  const colon = setup.indexOf(':');
  if (colon <= 0) return { ok: false, reason: 'Not a setup string.' };
  const next = `${toVersion}:${setup.slice(colon + 1)}`;
  const r = getRuleset(toVersion);
  if (!r) return { ok: false, reason: `Unknown ruleset ${toVersion}.` };
  const errors = validateProfile(next, r, { color: 'w' }).filter((i) => i.severity === 'error');
  if (hasErrors(errors)) return { ok: false, reason: errors.map((e) => e.message).join('; ') };
  return { ok: true, setup: next };
}
