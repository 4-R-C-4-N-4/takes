# Takes — Progress

Source of truth: docs/spec.md (rules), docs/impl.md (build), docs/DECISIONS.md (v1 overrides), docs/plan-review.md.

Gate: `pnpm check && pnpm test` (Node 22, pnpm 9).

## Contracts (main)
- `@takes/library` — types, `expandPiece`, setup string parse/serialize/cost, `getRuleset('2026.1')` (pieces embedded [D4]). Rulesets built by `pnpm build:rulesets`.
- `@takes/engine` — API in packages/engine/src/index.ts (stream A fills it in).

## Status
| Stream | Branch | Scope | State |
| --- | --- | --- | --- |
| 0 scaffold | main | monorepo, library core, decisions | done (8 tests) |
| A engine | engine (~/Work/takes-wt/engine) | M1 rules engine + perft | dispatched |
| B validator | validator (~/Work/takes-wt/validator) | M2 piece/profile validation, king safety | dispatched |
| C art | art (~/Work/takes-wt/art) | procedural SVG + badges, tools/artgen codex candidates | dispatched |

| D betza | main | Betza exporter, variants.ini gen, FSF batch driver; Betza round-trip vs FSF (every piece, every square, blocker rings) | done on main (FSF built at ~/programs/Fairy-Stockfish/src/stockfish) |
| protocol | main | typed WS messages + untrusted-input parser | done on main |

## Next wave (after A/B merge)
- D2 FSF perft parity on random profile pairs (needs engine + random profile generator)
- E apps/web: library, builder, profiles, hotseat game (M3; needs engine+validator+art)
- F packages/protocol + apps/server invite rooms (M4; needs engine+validator)
