# Valuation recovery — 2026-10-27

**Estimates remain unreliable for pricing. No prices or tier changes are recommended.**

Generated from actual JSON data by `tools/valuation/scripts/audit.ts`. All 18 original top-level JSONs are preserved; [source-inventory.json](recovery/source-inventory.json) records their SHA-256 hashes and recovered iterations. The old `all.json` is the earlier 150-game aggregate, not the newer per-slot run. [recovery/all.json](recovery/all.json) aggregates fresh results separately.

## Recovery evidence

The six inspected commits end at `5a7e96b`. They fix the promotion approximation and calibration sign but leave reporting and experiment-design bugs. Ten newer per-slot outputs and shared calibration were complete; `berolina-x4.json` and the new aggregate were missing. The user reports an agent rate limit. No saved scaled-run failure traceback was found; the available scratch `run-all.log` describes the older six-piece run. Source replay reproduces a concrete x4 failure: the old berolina path tried to substitute four knights in an army with only two, throwing **no 'knight' found to substitute**. The corrected x4 experiment substitutes four pawns. This deterministic setup error explains why x4 cannot complete under the old code; no FSF search is needed to reproduce it.

Original scaled settings, from the user/source: 700 games per iteration, 6000 base nodes, 12 workers, seed 1, up to 2 iterations; knight stopped after one. JSONs do not independently encode every setting. These per-slot files contain 13300 scored target games, 0 excluded games, 0 target parity events. The shared calibration reports zero exclusions/parity events, but omits signed outcome counts and trial counts. Earlier 150-game JSONs are historical and excluded from current conclusions.

## Saved measurements recovered without replay

Last saved iteration only. W/D/L is from the target perspective. Undamped values below are reconstructed from W/D/L using the ORIGINAL, invalid calibration. Brackets preserve the saved conditional bootstrap ranges. These are audit numbers, not corrected valuation estimates. Extra-piece counts are reconstructed from source and the seed-1 profile sequence, not saved per-game logs.

| Source | W/D/L | Undamped point [saved range] | Damped search parameter | Extra-piece games/iteration |
| --- | --- | --- | --- | --- |
| berolina-x1.json | 65/100/535 | 0.59 [0.36, 0.81] | 0.79 | 133/350 |
| berolina-x2.json | 67/65/568 | 0.36 [0.08, 0.61] | 0.54 | 133/350 |
| bishop-minor.json | 297/155/248 | 2.96 [2.79, 3.14] | 3.31 | 133/350 |
| knight-minor.json | 306/182/212 | 3.14 [2.96, 3.31] | 3.14 | 127/350 |
| lancer-minor.json | 106/83/511 | 1.00 [0.77, 1.21] | 1.27 | 133/350 |
| lancer-rook.json | 86/82/532 | 2.75 [2.51, 2.96] | 2.89 | 112/350 |
| warden-minor.json | 173/174/353 | 2.07 [1.89, 2.23] | 2.15 | 133/350 |
| warden-rook.json | 146/67/487 | 3.34 [3.12, 3.56] | 3.41 | 112/350 |
| wraith-minor.json | 349/181/170 | 3.48 [3.30, 3.67] | 3.69 | 133/350 |
| wraith-rook.json | 222/137/341 | 4.31 [4.13, 4.49] | 4.51 | 112/350 |

Bishop's reported 3.31 with range 2.79–3.14 and wraith minor's 3.69 with range 3.30–3.67 mixed a damped search parameter with an undamped measurement interval. Recovering the raw points removes this mismatch, but does not repair calibration or sampling. Berolina x1 replaced a knight, not a pawn. Berolina x2 replaced two knights in classic games but only one in random games, and inversion did not divide by copy count. Neither is a pawn-tier result.

## Targeted corrected runs

Corrected calibration plus identified invalid/missing experiments only. Fresh settings: 700 target games, 6000 base nodes, 8 FSF workers, seed 1, one measurement iteration. Half classic substitutions, half random-profile substitutions. Random profiles must contain all requested references and are played in both colors; no fallback adds free material. Classic/calibration node jitter adds up to 1036 nodes. The first recovery batch (calibration, controls, pawn experiments) used per-game jitter; the subsequent rook batch uses the same budget for both colors of each pair. The first batch predates trial retention; rook outputs retain per-game stratum/cluster records. FSF temporary files use configured `TMPDIR`. No adaptive convergence is claimed.

| Output | Reference × copies | W/D/L | Raw per-piece value [nominal conditional range] | Search parameter | Excluded/parity |
| --- | --- | --- | --- | --- | --- |
| [berolina-pawn-x1.json](recovery/berolina-pawn-x1.json) | pawn × 1 | 272/223/205 | 1.04 [0.86, 1.22] | 1.04 | 0/0 |
| [berolina-pawn-x2.json](recovery/berolina-pawn-x2.json) | pawn × 2 | 229/191/280 | 0.77 [0.68, 0.86] | 0.77 | 0/0 |
| [berolina-pawn-x4.json](recovery/berolina-pawn-x4.json) | pawn × 4 | 221/182/297 | 0.86 [0.81, 0.90] | 0.86 | 0/0 |
| [bishop-minor-x1.json](recovery/bishop-minor-x1.json) | knight × 1 | 339/169/192 | 3.38 [3.20, 3.57] | 3.38 | 0/0 |
| [knight-minor-x1.json](recovery/knight-minor-x1.json) | bishop × 1 | 233/206/261 | 2.64 [2.44, 2.82] | 2.64 | 0/0 |
| [lancer-rook-x1.json](recovery/lancer-rook-x1.json) | rook × 1 | 69/65/566 | 2.14 [1.86, 2.43] | 2.14 | 0/0 |
| [warden-rook-x1.json](recovery/warden-rook-x1.json) | rook × 1 | 74/91/535 | 2.43 [2.15, 2.69] | 2.43 | 0/0 |
| [wraith-rook-x1.json](recovery/wraith-rook-x1.json) | rook × 1 | 188/176/336 | 4.12 [3.93, 4.32] | 4.12 | 0/0 |

Identical-army null control: 200 scored games (100 classic/100 random attempted), White W/D/L 84/70/46, White score 0.5950 versus fitted zero-delta White score 0.5419; excluded 0, parity 0. This tests color/evaluation behavior, not a piece price; repeated classic openings do not give 200 independent samples. [null-control.json](recovery/null-control.json).

Fresh target totals: 5600 scored, 0 excluded, 0 parity events. Shared calibration: 440 attempted, 0 excluded, 0 parity events, counted once. Wrapper totals in individual results include shared calibration, so summing those would double-count it. Illegal/missing FSF moves are excluded before scoring/bootstrap, never counted as draws. Diagnostics, if any, are in `recovery/parity-bugs.jsonl`; no log with zero exclusions is expected. Per-game variants exactly match `game.promotionTargets` for each color (asymmetric-army regression test).

## Calibration

Original negative anchors removed queen+rook, queen, and rook but used −9, −5, and −3. Correct nominal deltas are −14, −9, and −5. New signed range: [-14, 14]. The fit uses signed White delta and White score; summaries below show absolute delta and the material-favored side's score.

| Anchor | Absolute delta | Favored-side score |
| --- | --- | --- |
| -14 (queen+rook down) | 14 | 1.0000 |
| -9 (queen down) | 9 | 1.0000 |
| -5 (rook down) | 5 | 0.9875 |
| -2 pawns | 2 | 0.6875 |
| -1 pawn | 1 | 0.5375 |
| +1 pawn | 1 | 0.6250 |
| +2 pawns | 2 | 0.8500 |
| +knight | 3 | 0.9125 |
| +bishop | 3 | 0.9875 |
| +rook | 5 | 0.9125 |
| +queen | 9 | 1.0000 |

Fit `sigmoid(a+b*delta)`: `a=0.16793160753265313, b=0.679929377451676`. [calibration.json](recovery/calibration.json) retains signed buckets and trial outcomes for further analysis. Calibration error is shared across all piece estimates; pooling piece runs cannot eliminate it.


Leave-one-anchor-opening-out sensitivity at fixed target score (not a CI or uncertainty bound):

| Result | Minimum | Maximum |
| --- | --- | --- |
| berolina-pawn-x1.json | 0.95 | 1.17 |
| berolina-pawn-x2.json | 0.74 | 0.85 |
| berolina-pawn-x4.json | 0.84 | 0.90 |
| bishop-minor-x1.json | 3.27 | 3.52 |
| knight-minor-x1.json | 2.57 | 2.79 |
| lancer-rook-x1.json | 1.87 | 2.45 |
| warden-rook-x1.json | 2.19 | 2.71 |
| wraith-rook-x1.json | 4.05 | 4.30 |

Full refits are in [calibration-sensitivity.json](recovery/calibration-sensitivity.json). This measures dependence on the chosen anchor set; it cannot bound opening-population error.

## Statistical limits and controls

- Brackets are **nominal 95% iid-game bootstrap ranges conditional on a fixed fitted calibration**, not defensible overall 95% confidence intervals. All displayed points are undamped; if a point ever falls outside the calibration range, the JSON distinguishes the unclamped inversion and the clamped reported estimate and flags extrapolation. They omit calibration uncertainty, opening selection, adjudication, and model uncertainty. No price/tier band checks are justified.
- Classic games repeat one opening and a small set of node budgets. Jitter changes search, not the number of independent openings. Old random games did not actually pair the same profile across colors. Fresh random games are paired, so correlated. Iid-game resampling does not account for these dependencies. W/D/L-only historical outputs cannot recover covariance or isolate contaminated games. Future iteration records now retain stratum, node budget, pair/cluster identity and exclusions to permit cluster-aware analysis.
- Calibration uses 40 games per anchor on fixed openings, not 40 independent random positions. Even a paired calibration bootstrap would only quantify finite-search/node-budget variation on those openings. This design does not identify an unconditional calibration CI. Saturated anchors also make naive empirical bootstrap overconfident; independent opening-level calibration is still required.
- The intercept measures White advantage but target scores pool both colors. Inverting one logistic need not match inversion of the color-mixture response. One nominal-material slope may not fit both pawn removal and added officers. More games alone do not fix these model limits.
- Knight and bishop controls substitute against the other minor at nominal value 3. They need not be exactly equal in these positions. Their variation across runs/iterations prevents a self-consistency claim. The identical-army null control checks color behavior; an independent opening sample remains needed. Old minor/rook placement disagreement cannot establish a tier.
- The raw measurement inverts observed score at the recorded search settings. The feedback parameter is damped and injected into later FSF search; it is separate from the measurement and has no CI. Small damped steps do not establish convergence. New reports have separate `finalEstimate` and `finalFeedbackEstimate` fields.
- Multi-copy conversion divides total inverted delta by copy count, assuming additivity. Four copies need not have the same marginal value as one. Random samples condition on sufficient references; substitutions can change army validity and promotion options. Low-node search and evaluation-based adjudication also depend on FSF's initial piece values.

## Validation and outstanding work

Regression coverage includes exact per-color promotion lists, material deltas, missing-reference rejection, pawn copy counts, per-unit inversion, delta clamping independent of reference value, empty/invalid fits, illegal/missing-move exclusions, and raw-versus-feedback reporting. Actual commands/check outputs are in [the recovery handoff](recovery/handoff.md). Corrected minor-slot wraith/warden/lancer games were not rerun within this budget; their historical minor-slot outputs remain contaminated. Fresh results use one iteration and do not validate the adaptive feedback loop. Contaminated officer results remain exploratory; neither they nor the fresh conditional ranges justify prices.
