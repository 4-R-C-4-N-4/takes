# Recovery handoff

Existing branch HEAD is `5a7e96b`; no commits, pushes, resets, rebases or stashes were performed. Changes are confined to `tools/valuation/**` and `docs/valuation/**`. All 18 original result JSONs, including 11 originally untracked JSONs, remain in place. `source-inventory.json` hashes them and recovers 13,300 scored target games from the newer per-slot files without replaying them.

The inspected commits, newest first: `5a7e96b`, `791f001`, `2a0f9b0`, `81aa64a`, `1246611`, `6df99f2`. Existing fixes for calibration sign and per-game own-set promotions were retained.

## Findings and changes

- Reproduced the missing four-copy berolina failure without FSF: the old path calls `sameTierPairing(r, 'berolina', 'knight', 3, 4)` and throws `Error: no 'knight' found to substitute`. There are only two knights. New berolina experiments replace 1/2/4 pawns and divide total inverted material delta by copy count.
- Fixed mixed estimands: measurement/conditional interval, unbounded inversion and damped search parameter are distinct. Recovered bishop's last raw point is 2.96 in [2.79, 3.14], while 3.31 was its feedback parameter. Wraith minor's raw point is 3.48 in [3.30, 3.67], while 3.69 was feedback. Original JSONs are unchanged.
- Fixed nominal anchor deltas: queen+rook removal −14, queen removal −9, rook removal −5. New calibration retains signed outcome counts and trial results.
- Removed random-profile extra-piece fallback. Source/seed replay finds 133/350 missing knight references, 127/350 missing bishop references and 112/350 missing rook references per original iteration. Profiles now require enough references for exact substitution and are played in both colors.
- Fixed delta-range clamping (the calibration range is a delta, not an absolute piece value). Reject absent scored outcomes and invalid/unidentifiable fits rather than fabricate neutral estimates.
- Removed stopping based on comparing damped steps with undamped intervals. Such a comparison cannot establish convergence.
- Preserved exact per-color promotion sets; tests compare generated INI lists with `game.promotionTargets` for asymmetric armies.
- Illegal and missing FSF moves remain excluded before W/D/L and bootstrap; logging now retains actual per-game setups rather than `various`. Default logging is enabled even without an explicit log argument. Regression tests verify both exclusion and log content.
- Cap worker pools at eight; clean up processes even if startup fails, and delete only each worker's own temporary variant directories. Tests cover the cap, success cleanup and failed-start cleanup.
- CLI uses `node --import tsx`, avoiding the sandbox-blocked `tsx` CLI IPC listener. Fresh output directories/overwrite guards protect results and parity logs.
- New rook results retain per-game stratum, cluster and node-budget records. The first recovery batch was already running before trial retention/pair-budget changes and therefore lacks target trial arrays; this limitation is explicit in results.md.

## Actual commands

At repository root:

```sh
git status --short
git log -6 --oneline
pnpm check && pnpm test > "$TMPDIR/valuation-tests.log" 2>&1
git diff --check
```

In `tools/valuation`, with inherited `TMPDIR=/home/ivy/.hermes/cache/scratch`:

```sh
node --import tsx scripts/recover.ts > "$TMPDIR/valuation-targeted.log" 2>&1
node --import tsx scripts/recover-officers.ts > "$TMPDIR/valuation-officers.log" 2>&1
node --import tsx scripts/calibration-sensitivity.ts
node --import tsx scripts/audit.ts
```

The two FSF commands ran sequentially, with eight workers maximum, 6000 base nodes, 700 games per piece/count and one measurement iteration. Calibration uses 40 games × 11 anchors = 440 attempts. The additional identical-army null control uses 200 games. These are identified invalid/missing experiments; the old sweep was not blindly repeated. Repeated second feedback iterations and contaminated minor candidate slots were not replayed.

The initial `pnpm --filter @takes/valuation exec tsx scripts/recover.ts` attempt failed before FSF with `listen EPERM` on a scratch IPC socket. `node --import tsx` succeeded. Entry-point preservation checks deliberately exited 1 before starting FSF:

```text
pnpm --filter @takes/valuation run value -- --piece bishop --out /home/ivy/Work/takes-wt/valuation/docs/valuation/bishop.json
Error: refusing to overwrite .../docs/valuation/bishop.json

pnpm --filter @takes/valuation run run-all -- --outDir docs/valuation
Error: output directory contains results; choose a new --outDir to preserve results
```

Node v22.22.2; pnpm 9.15.0. FSF executable `/home/ivy/programs/Fairy-Stockfish/src/stockfish`, SHA-256 `7bdc2e86501dadede62e2afdb55e7e5d22a9dd1b9e702215bf80279e98a33bff`.

## Statistical blockers

No prices are recommended. Conditional iid-game bootstrap ranges are not full confidence intervals. Independent opening-level sampling, calibration uncertainty, color-mixture inversion and model misspecification remain unresolved. Leave-one-anchor-out refits quantify sensitivity only, not uncertainty bounds. Repeated classic positions and color pairs violate iid-game sampling. Multi-copy conversion assumes additivity. The identical-army control is descriptive and does not establish calibration validity. Historical W/D/L-only outputs cannot separate extra-piece games or recover missing covariance. See `../results.md` for actual tables and limits.

## Final validation and run output

Final command: `pnpm check && pnpm test > "$TMPDIR/valuation-tests-final.log" 2>&1`, exit 0. TypeScript check passed. `git diff --check` exited 0 with no output. All 18 original JSON hashes still match the inventory; tracked historical JSONs also match HEAD. Scope and unchanged HEAD were verified. Every fresh point lies within its own nominal conditional range, and W/D/L/trial counts reconcile.

Final outputs: 5,600 target games + 440 calibration games + 200 null-control games = 6,240 new games; zero excluded games and zero parity events. Eight targeted piece/count experiments used one iteration each. Approximate total recovery wall clock: 16 minutes, within the 20-minute budget.

Descriptive raw values: knight 2.64, bishop 3.38; berolina 1/2/4 copies 1.04/0.77/0.86 per piece; rook-slot wraith 4.12, warden 2.43, lancer 2.14. These are not recommended prices. Null-control White score 0.595 versus fitted zero-delta 0.542. See the results report for conditional ranges and sensitivity refits.

The FSF run sessions both completed with exit 0; each pool's finally block calls quit/SIGKILL on all owned worker processes. Final tests also completed with exit 0. No owned running command sessions remain. Startup-failure cleanup and the eight-worker cap have regression coverage.

Files changed: reporting/calibration/substitution code in `src/{value,logistic,setups}.ts`; process cleanup in `src/{uci,worker-pool}.ts`; package CLI entry points; `scripts/{value,run-all,recover,recover-officers,audit,calibration-sensitivity}.ts`; regression tests; `docs/valuation/results.md` and the separate `docs/valuation/recovery/` JSONs/handoff. No library, engine, or main-worktree files were changed. Original untracked result files remain untracked for the parent to commit.


### Final repository test output

```text
> takes@ test /home/ivy/Work/takes-wt/valuation
> vitest run


 RUN  v5.0.5 /home/ivy/Work/takes-wt/valuation


 Test Files  17 passed (17)
      Tests  164 passed (164)
   Start at  16:35:45
   Duration  36.18s (tests 99%, import 1%)
```


### Calibration, controls and pawn experiments

```text
corrected calibration: 40 games/anchor, 6000 nodes, 8 workers
running knight-minor-x1
{"piece":"knight","count":1,"estimate":2.635294012246421,"lo":2.44089324181422,"hi":2.816057509428971,"excluded":0,"elapsedS":95.877}
running bishop-minor-x1
{"piece":"bishop","count":1,"estimate":3.3800557736828076,"lo":3.1975929689106994,"hi":3.571940472601214,"excluded":0,"elapsedS":88.991}
running berolina-pawn-x1
{"piece":"berolina","count":1,"estimate":1.0354224607571667,"lo":0.8623214311300775,"hi":1.2234206492158366,"excluded":0,"elapsedS":93.478}
running berolina-pawn-x2
{"piece":"berolina","count":2,"estimate":0.7691638624520178,"lo":0.6756683276363584,"hi":0.8596988511337978,"excluded":0,"elapsedS":89.533}
running berolina-pawn-x4
{"piece":"berolina","count":4,"estimate":0.8580978509882546,"lo":0.8098507519448808,"hi":0.9046136420338167,"excluded":0,"elapsedS":89.715}
```


### Null control and invalid rook-slot reruns

```text
running identical-army null control (200 games)
{"kind":"identical-army-null-control","wins":84,"draws":70,"losses":46,"games":200,"whiteScore":0.595,"fittedWhiteScoreAtZero":0.5418845159275337,"excludedGames":0,"parityBugs":0,"settings":{"games":200,"classic":100,"random":100,"nodes":6000,"workers":8,"seed":1}}
running corrected wraith rook slot
{"piece":"wraith","estimate":4.121579068570383,"lo":3.9250114544636983,"hi":4.317033175081751,"elapsedS":89.006}
running corrected warden rook slot
{"piece":"warden","estimate":2.4284019851410172,"lo":2.1518372165987953,"hi":2.687730778508864,"elapsedS":93.801}
running corrected lancer rook slot
{"piece":"lancer","estimate":2.143380770914135,"lo":1.8620575751223138,"hi":2.4284019851410172,"elapsedS":78.322}
```
