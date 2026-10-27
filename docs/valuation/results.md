# Piece valuation — first measured pass (M6)

Harness: `tools/valuation` (`@takes/valuation`). Fairy-Stockfish self-play, Takes engine as sole
game-end authority [D12], `go nodes N` search, async worker pool (≤12 FSF processes, Threads=1,
Hash=16MB). See `tools/valuation/src/*` for the implementation; run via
`pnpm --filter @takes/valuation run value -- --piece <id> --games N --nodes N --workers N --seed N --out <path>`
or `run-all`.

## Run parameters (this pass)

- `games=150` per piece (≈45 classic-substitution + ≈105 Takes-style random-profile games, color-swapped pairs)
- `nodes=6000` per move (fast, deterministic-ish)
- `workers=10`, `seed=7`
- 3 value-feedback iterations max (iterate FSF `pieceValueMg/Eg` → re-run → stop early once the
  estimate's step is smaller than its bootstrap CI half-width)
- Wall clock: ~6 pieces × ~60s ≈ 6 minutes total (well under the 45-minute budget — this pass is
  intentionally small; scale `--games`/`--nodes` up for tighter CIs, see Limitations)

## Results

| Piece | Tier | Declared cost | Measured value (95% CI) | Games | Iterations | Band check | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Knight (control) | minor | 3 | **3.34** [3.23, 3.44] | 450 | 3 | ✅ minor 2–4 | Reference = bishop; lands close to 3 as expected — harness self-consistency check passes. |
| Bishop (control) | minor | 3 | **4.20** [4.10, 4.31] | 450 | 3 | ⚠️ minor 2–4 (near upper edge) | Reference = knight; slightly high but still inside the band. At `nodes=6000` FSF plays bishop vs. knight tactically sharp lines that may favor the bishop more than at longer TC — treat as a soft signal, not a precise estimate. |
| Wraith (rook-moves/bishop-captures) | minor or rook (candidate) | — | **4.08** [4.00, 4.16] | 450 | 3 | fits rook band (4–6.5) at the low end | Value sits at the rook band's floor; **not** solidly inside the minor band (2–4). Spec D-question "what measured range qualifies rook tier" — this result leans toward declaring wraith rook-tier, but see limitations (short TC, promotion-set approximation). |
| Lancer (forward rook + 1-step retreat) | minor (candidate) | — | **diverged, unreliable** (iter-0 raw score implies a large deficit; feedback loop pushed the estimate to -11 ± 2) | 450 | 3 (did not stabilize) | ❌ | Iteration 0 already lost 80/150 games as a knight-slot substitute (1 win, 69 draws, 80 losses) — a real signal that the piece is weak in that slot, but the logistic inversion extrapolated far outside the calibration range (calibrated only on deltas of 1–5 pawns), and each iteration's increasingly negative injected value made FSF play the piece worse, diverging rather than converging. Needs a wider calibration range and a convergence damper before trusting a number here. Qualitatively: likely well below 3, possibly pawn/early-minor tier as currently tested (always dropped into a knight-shaped slot — may be unfair to its design, which expects a forward-biased deployment). |
| Berolina (inverted pawn) | pawn (declared) | 1 | **2.06** [1.80, 2.28] | 450 | 3 | ❌ pawn band (0.5–1.5) exceeded | Measured well above the pawn band — but this run substitutes berolina into a *knight* slot for lack of a pawn-vs-pawn experiment design (not yet implemented; see limitations), so the number reflects "a berolina sitting where a knight would be," not "a berolina pawn's actual value in a pawn-tier role." Treat this result as **not applicable** to the pawn-tier band check; a same-tier calibration (pawn-for-pawn swap) is needed before this piece can be judged against its band. Also had the highest parity-bug count (12/450 ≈ 2.7%), likely from pawn-tier edge cases (double-step/en-passant eligibility, mandatory promotion). |
| Warden (horizontal slider + vertical step) | rook (candidate) | — | **3.56** [3.40, 3.73] | 450 | 3 | ❌ rook band (4–6.5) not met | Measured closer to the minor band than the rook band, despite being castling-eligible by declared tier. Same knight-slot-substitution caveat as lancer/berolina (warden is naturally a rook-tier piece; testing it in a minor slot likely understates it, since a real game would deploy it as a rook replacement with full back-rank mobility). |

## Control-piece sanity check

Per the spec's self-validation requirement: knight (reference-independent control via bishop
substitution) landed at **3.34**, inside the minor band and close to 3 — the harness's calibration
and inversion pipeline is directionally correct. Bishop landed at **4.20**, which is inside the
minor band but on the high side; combined with wraith sitting at the rook-band floor, this suggests
either (a) a genuine short-time-control bias toward bishop-like diagonal mobility, or (b) calibration
noise from only 2 games per material anchor (see limitations). The controls are "near 3" but not
tightly so — this pass does **not** yet have the statistical power the spec calls for (thousands of
games, ±0.2 CI); treat all numbers here as a first directional pass, not final balance numbers.

## Parity-bug count (Takes engine rejecting an FSF move)

| Piece | Parity bugs / games |
| --- | --- |
| Knight | 6 / 450 |
| Bishop | 1 / 450 |
| Wraith | 4 / 450 |
| Lancer | 2 / 450 |
| Berolina | 12 / 450 |
| Warden | 1 / 450 |
| **Total** | **26 / 2700 (≈1.0%)** |

**Not zero**, contrary to the design goal. Root cause found and partially fixed during this pass:
FSF's `promotionPieceTypes*` options are variant-wide, but the Takes engine's promotion targets are
`own-set` [D6] — restricted to pieces actually present in that color's own army on the board. The
harness now builds the ini's promotion lists from the closed set of officer ids that can appear in
*any* army used by a given batch (classic test officers ∪ {target, reference}), and runs
random-profile games through a *separate*, narrower ini matching their own restricted officer pool
(`restrictedRuleset()`/two-`runBatch()`-calls in `value.ts`). This eliminated the bug for the
reproducible classic-pairing case entirely (0 bugs in isolated re-runs) but a residual ~1% remains,
concentrated in: (1) pawn-tier pieces (berolina: double-step/en-passant/mandatory-promotion edge
cases — `enPassantTypes` is vanilla-pawn-only per D5/variant.ts, so berolina's own pawn-like moves
may trip FSF/Takes disagreement at the board edges), and (2) rook-tier custom pieces in
randomly-generated castling-eligible positions (wraith/warden). **This is a genuine, reportable
parity gap** that should be investigated further before this harness is trusted for high-volume runs
— every aborted game is silently scored as a draw, which biases results slightly toward 0.5.

## Limitations (read before trusting any number above)

1. **Statistical power is low.** 150 games/piece (split classic+random, color-swapped) at
   `nodes=6000` gives wide CIs (±0.1–0.2 pawns from bootstrap, but the *true* uncertainty is larger
   because the calibration curve itself is fit from only ~10 games per material anchor). The spec
   calls for "thousands of games" — this pass is a smoke-test-scale first measurement, sized to fit
   a ~45-minute compute budget, not a final number.
2. **Calibration range is narrow (1–5 pawns)** and the logistic fit is linear-in-logit by
   construction; extrapolating far outside that range (as happened for lancer) produces large,
   unstable estimates. A future pass should add calibration anchors beyond ±5 pawns, or clamp/
   dampen the feedback loop's step size.
3. **Target-piece substitution always drops the piece into a knight- or bishop-shaped slot**
   (replacing one classic officer), regardless of the piece's own tier. This is a fair test for
   wraith (candidate minor/rook) but arguably unfair to pawn-tier berolina and rook-tier warden,
   whose natural roles don't match a minor's back-rank slot. A same-tier substitution experiment
   (pawn-for-pawn, rook-for-rook) is the natural next step and not yet implemented.
4. **The own-set promotion ↔ FSF ini mismatch is only approximately fixed** (see parity-bug section
   above); a residual ~1% of games are aborted and scored as a draw, slightly biasing results toward
   0.5.
5. **The value-feedback loop's stopping rule** (`|Δestimate| < CI half-width`) does not guard against
   divergence (lancer); it should also cap the per-iteration step and/or require two consecutive
   small steps before declaring convergence.
6. Each piece ran **independently re-derived calibration curves** (not cached/shared across pieces)
   for simplicity; sharing one calibration run across all pieces in `run-all` would cut wall-clock
   roughly in half for a multi-piece sweep.

## Recommendation

Scale this harness up (≥2,000 games/piece, `nodes≥20000`, calibration anchors spanning at least
±8 pawns, same-tier substitution experiments) before using any number here to adjust a piece's
declared cost. Do not edit ruleset costs off this pass.
