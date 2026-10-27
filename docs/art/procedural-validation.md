# Procedural art validation

Reviewed all ten pieces (nine ruleset pieces and the engine-fixed king) in the
40px, 64px and labeled contact sheets. Revised the partial renderer to remove
clipped tops/sides and disconnected crests; after the first sheet review, changed
the lancer from a shallow gate to a spear. Final sheets were inspected again in
both player colors on light and dark squares. All silhouettes share y=92;
pawns occupy 59% of the canvas including the outline, tallest pieces 91%.

The reproducible runner is `python packages/art/scripts/contact-sheet.py`.
Its final output included:

```text
40px minimum: {'pair': ['berolina', 'pawn'], 'distance': 0.022885}
64px minimum: {'pair': ['berolina', 'pawn'], 'distance': 0.023346}
```

The metric is full-canvas mean absolute alpha difference / 255, measured without
labels or backgrounds. All 45 pairs at each resolution and their raster bounds
are recorded in `procedural-distinctness.json`. The runner also checks transparent
outer edges and a minimum distance above 1%. This measures bitmap differences;
it does not establish a human recognition threshold.

Actual check results:

- `pnpm check`: exit 0; `svelte-check found 0 errors and 3 warnings in 1 file`.
  The warnings are existing accessibility warnings in `apps/web/src/components/Board.svelte`.
- `pnpm exec vitest run packages/art/test/index.test.ts tools/artgen/test/pipeline.test.ts --pool=threads --maxWorkers=2`:
  `Test Files 2 passed (2)`; `Tests 23 passed (23)`.
- Plain `pnpm test` did not finish and was interrupted. A bounded retry using
  `timeout 60s pnpm test -- --pool=threads --maxWorkers=4 --reporter=verbose`
  exited 124 after reporting 171 passing test cases; no final suite summary.
- `pnpm test -- --pool=threads --maxWorkers=4 --exclude 'apps/server/**' --exclude 'apps/web/src/net/__tests__/online-game.test.ts'`:
  exit 0; `Test Files 17 passed (17)`; `Tests 167 passed (167)`; duration 36.68s.
  Server and online-game tests remain unverified by a completed suite run here.
- `git diff --check`: exit 0, no output.

The suggested tsx invocation encountered sandbox `listen EPERM` for its IPC pipe.
The Node loader worked, but Node spawning rsvg-convert encountered `spawnSync
rsvg-convert EPERM`. The included Python runner executes the raster jobs
successfully using the same loader, with temporary tiles outside the repository.
Node prints an experimental-loader warning. No dependencies or root config changed.

Only `packages/art/**` and `docs/art/**` were edited. No commit or push was made.
