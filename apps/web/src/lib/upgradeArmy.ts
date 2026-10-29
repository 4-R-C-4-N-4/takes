// Saved armies carry their ruleset version. When a new version is published, an army that is still
// legal under it (same piece ids, within budget and caps, king safe) can be moved to it in one tap.
import { CURRENT_RULESET_VERSION, getRuleset, type Setup } from '@takes/library';
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

/** The Builder always edits under the current ruleset: an army saved for an older version opens
 *  re-versioned (same squares), shows whatever breaks the new rules, and saves as current.
 *  `from` names the old version so the Builder can say so. */
export function openInCurrentRuleset(setup: Setup, current: string = CURRENT_RULESET_VERSION): { setup: Setup; from?: string } {
  if (setup.version === current) return { setup };
  return { setup: { ...setup, version: current }, from: setup.version };
}
