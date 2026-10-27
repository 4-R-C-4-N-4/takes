# Takes — Progress

Source of truth: docs/spec.md (rules), docs/impl.md (build), docs/DECISIONS.md (v1 overrides), docs/plan-review.md.

Gate: `pnpm check && pnpm test` (Node 22, pnpm 9).

## Contracts (main)
- `@takes/library` — types, `expandPiece`, setup string parse/serialize/cost, `getRuleset('2026.1')` (pieces embedded [D4]). Rulesets built by `pnpm build:rulesets`.
- `@takes/engine` — API in packages/engine/src/index.ts (stream A fills it in).

## Status
| Stream | Branch | Scope | State |
| --- | --- | --- | --- |
| 0 scaffold | main | monorepo, library core, decisions | merged |
| A engine | engine | M1: movegen, castling (D2), ep, promotion (D6), FEN/UCI, perft | merged — start/Kiwipete/CPW 3–6/960 perft exact; fast-check props |
| B validator | validator | M2: piece/ruleset/profile validation, king safety | merged — 65 tests; 2026.1 ruleset validates clean |
| C art | art | procedural SVG + badges; tools/artgen codex candidates (9 pieces, 9 codex calls) | merged — candidates need human review before promotion to art.svg |
| D betza | main | Betza exporter, variants.ini, FSF driver; Betza round-trip | merged — all pieces match FSF |
| D2 parity | main | tools/perft: random valid profiles; engine vs FSF perft | merged — 100 pairs depth 3 + 100 played-out depth 2, zero mismatches |
| protocol | main | typed WS messages + input parser | merged |
| E web | web | M3: Svelte app, 5 screens, hotseat, online client | merged — hotseat verified in browser (castle/ep/promo). Orchestrator fixed art.svg override glob (was silently broken) + svelte-check now in root gate |
| F server | server | M4: WS rooms, SQLite, reconnect, FSF bot (D12) | merged — 10 server tests; zero FSF moves rejected |
| protocol bot field | main | create_room.bot ('easy'/'medium'/'hard') | merged |
| H online | online | wire web online flow + bot to server, server serves web, real-browser 2-player verification | dispatched |
| I rules-review | rules-review | adversarial engine/validator review vs spec; pinning tests | dispatched |
| G valuation | valuation | M6: FSF self-play value harness | pass 1 NOT merged: 1% games had FSF moves rejected (shared promotion-set approximation, scored as draws), lancer fit diverged, wrong-tier slots. Pass 2 dispatched: per-game variants, same-tier slots, wider calibration, ≥600 games/slot |

Gate on main: `pnpm check && pnpm test` (check = tsc -b + svelte-check) → 157 passed; `pnpm --filter @takes/web build` ok (2026-10-27).

## Open for Ivy
- Codex art candidates (docs/art/candidates-40.png) read as fairly classical chess silhouettes; procedural (docs/art/procedural-40.png) is clean but samey for rook/warden/wraith. Pick a direction before promoting any art.svg.
- All DECISIONS.md defaults stand unless overridden.
