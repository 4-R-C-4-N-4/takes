/** Rebuild the report from saved JSONs; never runs FSF or overwrites source results. */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRuleset, parseSetup } from '@takes/library';
import { mulberry32, randomProfile } from '@takes/perft';
import { invertLogistic } from '../src/logistic.js';
const dir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/valuation');
const r = getRuleset('2026.1')!;
const sources = readdirSync(dir).filter((p) => p.endsWith('.json')).sort().map((file) => {
  const bytes = readFileSync(resolve(dir, file));
  return { file, sha256: createHash('sha256').update(bytes).digest('hex'), data: JSON.parse(bytes.toString()) };
});
const missingReferences: Record<string, number> = {};
for (const ref of ['knight', 'bishop', 'rook']) {
  const random = mulberry32(1);
  let count = 0;
  for (let i = 0; i < 350; i++) if (!parseSetup(randomProfile(r, random)).ranks.flat().includes(ref)) count++;
  missingReferences[ref] = count;
}
const recovered = sources.filter(({ data }) => data.slot).map(({ file, data }) => ({
  source: file, piece: data.piece, slot: data.slot, referenceId: data.referenceId,
  status: data.piece === 'berolina' ? 'invalid pawn experiment: minor reference, copy count mismatch for x2' : 'descriptive only: wrong calibration deltas, extra-piece random games, repeated openings',
  missingReferenceGamesPerIteration: missingReferences[data.referenceId],
  iterations: data.iterations.map((it: any) => ({ ...it,
    originalFeedbackEstimate: it.estimate,
    recoveredUndampedEstimate: data.referenceValuePawns + invertLogistic(data.calibrationFit, (it.wins + it.draws / 2) / it.games),
    pointOutsideSavedInterval: it.estimate < it.lo || it.estimate > it.hi,
  })),
}));
writeFileSync(resolve(dir, 'recovery/source-inventory.json'), JSON.stringify({ sources: sources.map(({ file, sha256 }) => ({ file, sha256 })), missingReferences, recovered }, null, 2) + '\n');
const f = (x: number) => x.toFixed(2);
const oldRows = recovered.map((d) => {
  const it = d.iterations.at(-1)!;
  return `| ${d.source} | ${it.wins}/${it.draws}/${it.losses} | ${f(it.recoveredUndampedEstimate)} [${f(it.lo)}, ${f(it.hi)}] | ${f(it.originalFeedbackEstimate)} | ${d.missingReferenceGamesPerIteration}/350 |`;
});
const fresh = readdirSync(resolve(dir, 'recovery')).filter((p) => p.endsWith('.json')).map((file) => ({ file, data: JSON.parse(readFileSync(resolve(dir, 'recovery', file), 'utf8')) })).filter(({ data }) => data.iterations);
const freshRows = fresh.map(({ file, data: d }) => {
  const it = d.iterations.at(-1)!;
  return `| [${file}](recovery/${file}) | ${d.referenceId} × ${d.sameTierCount} | ${it.wins}/${it.draws}/${it.losses} | ${f(d.finalEstimate)} [${f(d.finalLo)}, ${f(d.finalHi)}] | ${f(d.finalFeedbackEstimate)} | ${it.excludedGames}/${it.parityBugs} |`;
});
const sum = (rows: any[], field: string) => rows.reduce((n, d) => n + d.iterations.reduce((s: number, it: any) => s + (it[field] ?? 0), 0), 0);
const oldGames = sum(recovered, 'games');
const freshData = fresh.map(({ data }) => data);
const calibration = JSON.parse(readFileSync(resolve(dir, 'recovery/calibration.json'), 'utf8'));
const sensitivityFile = resolve(dir, 'recovery/calibration-sensitivity.json');
const sensitivity = existsSync(sensitivityFile) ? JSON.parse(readFileSync(sensitivityFile, 'utf8')).rows : [];
const nullFile = resolve(dir, 'recovery/null-control.json');
const nullControl = existsSync(nullFile) ? JSON.parse(readFileSync(nullFile, 'utf8')) : undefined;
const nullText = nullControl ? `Identical-army null control: ${nullControl.games} scored games (100 classic/100 random attempted), White W/D/L ${nullControl.wins}/${nullControl.draws}/${nullControl.losses}, White score ${nullControl.whiteScore.toFixed(4)} versus fitted zero-delta White score ${nullControl.fittedWhiteScoreAtZero.toFixed(4)}; excluded ${nullControl.excludedGames}, parity ${nullControl.parityBugs}. This tests color/evaluation behavior, not a piece price; repeated classic openings do not give 200 independent samples. [null-control.json](recovery/null-control.json).` : 'Identical-army null control is pending.';
writeFileSync(resolve(dir, 'recovery/all.json'), JSON.stringify({ schemaVersion: 2, status: 'exploratory-unreliable-no-pricing', calibrationSource: 'calibration.json', calibrationFit: calibration.fit, results: fresh.map(({ file, data }) => ({ source: file, ...data })), nullControl, originalSourceInventory: 'source-inventory.json' }, null, 2) + '\n');
const sensitivityText = sensitivity.length ? `\nLeave-one-anchor-opening-out sensitivity at fixed target score (not a CI or uncertainty bound):\n\n| Result | Minimum | Maximum |\n| --- | --- | --- |\n${sensitivity.map((row: any) => `| ${row.source} | ${f(row.min)} | ${f(row.max)} |`).join('\n')}\n\nFull refits are in [calibration-sensitivity.json](recovery/calibration-sensitivity.json). This measures dependence on the chosen anchor set; it cannot bound opening-population error.\n` : '';
const text = `# Valuation recovery — 2026-10-27

**Estimates remain unreliable for pricing. No prices or tier changes are recommended.**

Generated from actual JSON data by \`tools/valuation/scripts/audit.ts\`. All ${sources.length} original top-level JSONs are preserved; [source-inventory.json](recovery/source-inventory.json) records their SHA-256 hashes and recovered iterations. The old \`all.json\` is the earlier 150-game aggregate, not the newer per-slot run. [recovery/all.json](recovery/all.json) aggregates fresh results separately.

## Recovery evidence

The six inspected commits end at \`5a7e96b\`. They fix the promotion approximation and calibration sign but leave reporting and experiment-design bugs. Ten newer per-slot outputs and shared calibration were complete; \`berolina-x4.json\` and the new aggregate were missing. The user reports an agent rate limit. No saved scaled-run failure traceback was found; the available scratch \`run-all.log\` describes the older six-piece run. Source replay reproduces a concrete x4 failure: the old berolina path tried to substitute four knights in an army with only two, throwing **no 'knight' found to substitute**. The corrected x4 experiment substitutes four pawns. This deterministic setup error explains why x4 cannot complete under the old code; no FSF search is needed to reproduce it.

Original scaled settings, from the user/source: 700 games per iteration, 6000 base nodes, 12 workers, seed 1, up to 2 iterations; knight stopped after one. JSONs do not independently encode every setting. These per-slot files contain ${oldGames} scored target games, ${sum(recovered, 'excludedGames')} excluded games, ${sum(recovered, 'parityBugs')} target parity events. The shared calibration reports zero exclusions/parity events, but omits signed outcome counts and trial counts. Earlier 150-game JSONs are historical and excluded from current conclusions.

## Saved measurements recovered without replay

Last saved iteration only. W/D/L is from the target perspective. Undamped values below are reconstructed from W/D/L using the ORIGINAL, invalid calibration. Brackets preserve the saved conditional bootstrap ranges. These are audit numbers, not corrected valuation estimates. Extra-piece counts are reconstructed from source and the seed-1 profile sequence, not saved per-game logs.

| Source | W/D/L | Undamped point [saved range] | Damped search parameter | Extra-piece games/iteration |
| --- | --- | --- | --- | --- |
${oldRows.join('\n')}

Bishop's reported 3.31 with range 2.79–3.14 and wraith minor's 3.69 with range 3.30–3.67 mixed a damped search parameter with an undamped measurement interval. Recovering the raw points removes this mismatch, but does not repair calibration or sampling. Berolina x1 replaced a knight, not a pawn. Berolina x2 replaced two knights in classic games but only one in random games, and inversion did not divide by copy count. Neither is a pawn-tier result.

## Targeted corrected runs

Corrected calibration plus identified invalid/missing experiments only. Fresh settings: 700 target games, 6000 base nodes, 8 FSF workers, seed 1, one measurement iteration. Half classic substitutions, half random-profile substitutions. Random profiles must contain all requested references and are played in both colors; no fallback adds free material. Classic/calibration node jitter adds up to 1036 nodes. The first recovery batch (calibration, controls, pawn experiments) used per-game jitter; the subsequent rook batch uses the same budget for both colors of each pair. The first batch predates trial retention; rook outputs retain per-game stratum/cluster records. FSF temporary files use configured \`TMPDIR\`. No adaptive convergence is claimed.

| Output | Reference × copies | W/D/L | Raw per-piece value [nominal conditional range] | Search parameter | Excluded/parity |
| --- | --- | --- | --- | --- | --- |
${freshRows.join('\n')}

${nullText}

Fresh target totals: ${sum(freshData, 'games')} scored, ${sum(freshData, 'excludedGames')} excluded, ${sum(freshData, 'parityBugs')} parity events. Shared calibration: ${calibration.trials.length} attempted, ${calibration.excludedGames} excluded, ${calibration.parityBugs} parity events, counted once. Wrapper totals in individual results include shared calibration, so summing those would double-count it. Illegal/missing FSF moves are excluded before scoring/bootstrap, never counted as draws. Diagnostics, if any, are in \`recovery/parity-bugs.jsonl\`; no log with zero exclusions is expected. Per-game variants exactly match \`game.promotionTargets\` for each color (asymmetric-army regression test).

## Calibration

Original negative anchors removed queen+rook, queen, and rook but used −9, −5, and −3. Correct nominal deltas are −14, −9, and −5. New signed range: [${calibration.range.lo}, ${calibration.range.hi}]. The fit uses signed White delta and White score; summaries below show absolute delta and the material-favored side's score.

| Anchor | Absolute delta | Favored-side score |
| --- | --- | --- |
${calibration.calibration.map((c: any) => `| ${c.label} | ${c.deltaPawns} | ${c.p.toFixed(4)} |`).join('\n')}

Fit \`sigmoid(a+b*delta)\`: \`a=${calibration.fit.a}, b=${calibration.fit.b}\`. [calibration.json](recovery/calibration.json) retains signed buckets and trial outcomes for further analysis. Calibration error is shared across all piece estimates; pooling piece runs cannot eliminate it.

${sensitivityText}
## Statistical limits and controls

- Brackets are **nominal 95% iid-game bootstrap ranges conditional on a fixed fitted calibration**, not defensible overall 95% confidence intervals. All displayed points are undamped; if a point ever falls outside the calibration range, the JSON distinguishes the unclamped inversion and the clamped reported estimate and flags extrapolation. They omit calibration uncertainty, opening selection, adjudication, and model uncertainty. No price/tier band checks are justified.
- Classic games repeat one opening and a small set of node budgets. Jitter changes search, not the number of independent openings. Old random games did not actually pair the same profile across colors. Fresh random games are paired, so correlated. Iid-game resampling does not account for these dependencies. W/D/L-only historical outputs cannot recover covariance or isolate contaminated games. Future iteration records now retain stratum, node budget, pair/cluster identity and exclusions to permit cluster-aware analysis.
- Calibration uses 40 games per anchor on fixed openings, not 40 independent random positions. Even a paired calibration bootstrap would only quantify finite-search/node-budget variation on those openings. This design does not identify an unconditional calibration CI. Saturated anchors also make naive empirical bootstrap overconfident; independent opening-level calibration is still required.
- The intercept measures White advantage but target scores pool both colors. Inverting one logistic need not match inversion of the color-mixture response. One nominal-material slope may not fit both pawn removal and added officers. More games alone do not fix these model limits.
- Knight and bishop controls substitute against the other minor at nominal value 3. They need not be exactly equal in these positions. Their variation across runs/iterations prevents a self-consistency claim. The identical-army null control checks color behavior; an independent opening sample remains needed. Old minor/rook placement disagreement cannot establish a tier.
- The raw measurement inverts observed score at the recorded search settings. The feedback parameter is damped and injected into later FSF search; it is separate from the measurement and has no CI. Small damped steps do not establish convergence. New reports have separate \`finalEstimate\` and \`finalFeedbackEstimate\` fields.
- Multi-copy conversion divides total inverted delta by copy count, assuming additivity. Four copies need not have the same marginal value as one. Random samples condition on sufficient references; substitutions can change army validity and promotion options. Low-node search and evaluation-based adjudication also depend on FSF's initial piece values.

## Validation and outstanding work

Regression coverage includes exact per-color promotion lists, material deltas, missing-reference rejection, pawn copy counts, per-unit inversion, delta clamping independent of reference value, empty/invalid fits, illegal/missing-move exclusions, and raw-versus-feedback reporting. Actual commands/check outputs are in [the recovery handoff](recovery/handoff.md). Corrected minor-slot wraith/warden/lancer games were not rerun within this budget; their historical minor-slot outputs remain contaminated. Fresh results use one iteration and do not validate the adaptive feedback loop. Contaminated officer results remain exploratory; neither they nor the fresh conditional ranges justify prices.
`;
writeFileSync(resolve(dir, 'results.md'), text);
console.log(JSON.stringify({ originalFiles: sources.length, oldGames, missingReferences, freshGames: sum(freshData, 'games'), freshExcluded: sum(freshData, 'excludedGames'), freshParity: sum(freshData, 'parityBugs') }, null, 2));
