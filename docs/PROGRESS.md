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
| H online | online | web online flow + bot, server serves web (`pnpm serve`) | merged — 2-player invite game, mid-game reload/resume, bot game verified in real browser (docs/screens) |
| I rules-review | rules-review | adversarial engine/validator review | merged — fixed fromFEN KQkq → closest partner (D2); +18 pinning tests |
| J web-polish | web-polish | Builder reactivity bug (orchestrator found: placing pieces does nothing), drag&drop, responsive board, phone | dispatched |
| K art-v2 | art-v2 | procedural art: bigger, distinct silhouettes, king, documented grammar | dispatched |
| G valuation | valuation | M6: FSF self-play value harness | pass 1 NOT merged: 1% games had FSF moves rejected (shared promotion-set approximation, scored as draws), lancer fit diverged, wrong-tier slots. Pass 2 dispatched: per-game variants, same-tier slots, wider calibration, ≥600 games/slot |

Gate on main: `pnpm check && pnpm test` (check = tsc -b + svelte-check) → 178 passed; `pnpm --filter @takes/web build` ok (2026-10-27).

## Open for Ivy
- Codex art candidates (docs/art/candidates-40.png) read as fairly classical chess silhouettes; procedural (docs/art/procedural-40.png) is clean but samey for rook/warden/wraith. Pick a direction before promoting any art.svg.
- All DECISIONS.md defaults stand unless overridden.

- Risk noted by rules review: fromFEN recomputes own-set promotion targets from the current board; resume paths must replay moves from setups (server does), never resume from a mid-game FEN.

## Integrated recovery — 2026-10-27

- Procedural art redesign merged, with king, direction/range signatures and bitmap checks; docs/art/procedural-labeled.png.
- Builder tap/drag fixes, profile navigation/import and hotseat reactivity merged. Desktop and phone Playwright checks passed on integrated main; docs/screens/polish/VERIFIED.md. Palette tap selection now persists across placements (Ivy requested); same palette toggles off.
- Rank labels added; validator corrected to allow pawns on setup rank 3 (promotion rank is 8).
- Valuation recovery merged as EXPERIMENTAL tooling, not pricing authority. Eight fresh 700-game piece/slot runs, calibration and null-control data preserved. Zero fresh parity/exclusion events; confidence ranges are conditional and not overall CIs. No price/tier changes made. Details docs/valuation/results.md.
- Final integrated gate: pnpm check → zero errors/warnings; pnpm test → 216 tests, 27 files; web build succeeds.
- No active implementation workers remain. Previous dispatched entries above are historical. Remaining work: valuation methodology (independent openings, cluster/calibration uncertainty, color-mixture model), physical touch-drag validation, final art approval, production deployment/hardening. Current local run: pnpm serve.
