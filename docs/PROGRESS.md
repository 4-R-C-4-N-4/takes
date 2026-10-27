# Takes — Progress

Source of truth: docs/spec.md (rules), docs/impl.md (build), docs/DECISIONS.md (v1 overrides), docs/plan-review.md.

Gate: `pnpm check && pnpm test` (Node 22, pnpm 9).

## Contracts (main)
- `@takes/library` — types, `expandPiece`, setup string parse/serialize/cost, `getRuleset('2026.1')` (pieces embedded [D4]). Rulesets built by `pnpm build:rulesets`.
- `@takes/engine` — API in packages/engine/src/index.ts (stream A fills it in).

## Status
| Stream | Branch | Scope | State |
| --- | --- | --- | --- |
| 0 scaffold | main | monorepo, library core, decisions | done |
