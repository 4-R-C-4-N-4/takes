# Takes — v1 Working Decisions

These are provisional defaults that resolve the issues raised in docs/plan-review.md. Ivy can override any of them. Where this file conflicts with spec.md or impl.md, this file wins until the spec is revised. Each decision is tagged [D#] so code and tests can reference it.

- [D1] **Castling eligibility.** A piece is rook tier with castling if it has a `slide` component with infinite range covering both `l` and `r`, in any mode. That structural test is enough. A measured value outside the band is a validator WARNING only.

- [D2] **Castling partner.** Fixed at game start. On each side of the king, the partner is the closest rook-tier piece on rank 1 at game start. The right is stored as that partner's start square, and is lost permanently when the king or that partner moves, or the partner is captured. No other piece ever inherits the right. FEN uses Shredder-style file letters, e.g. `HAha`.

- [D3] **Slide vectors.** Slide components must use unit vectors, i.e. max(|dx|, |dy|) == 1 (W or F direction). Leap components keep the rule |dy| ≤ 2, range 1, max(|dx|,|dy|) ≥ 2. No riders in v1.

- [D4] **Rulesets embed piece definitions.** A published ruleset JSON contains the full `Piece` objects (components included) plus costs. `packages/library/pieces/*` is the authoring source. A ruleset build step snapshots those files into `packages/library/rulesets/<version>.json`. Engines and validators read pieces from the ruleset only.

- [D5] **Glyphs.** Each piece's `glyph` is a single uppercase ASCII letter A–Z, not `K`, and unique within a ruleset. White's FEN letter is the uppercase glyph and Black's is lowercase. UCI promotion suffixes use the lowercase glyph. Classics use P N B R Q. Wraith = `X`, Lancer = `L`, Berolina = `E`, Warden = `W`.

- [D6] **Promotion targets** (Ivy's preference): the non-king, non-pawn-tier piece types present in that player's STARTING setup. If that set is empty, fall back to the ruleset's `promotionFallback`, which defaults to `["queen"]`. The targets are computed once at game start, separately for each color. The ruleset field is `promotionMode: "own-set"`. The engine also supports `"list"` mode, which uses `promotionTargets`, so tests can run vanilla chess.

- [D7] **Pawn-tier "never stranded".** From every square on ranks 1–7 on an empty board, the piece must have at least one on-board destination in move mode ('move' or 'both'). Capture-only reach does not count.

- [D8] **Validator issues** have the shape `{severity: 'error'|'warning', code, message, squares}`. Only errors block saving or playing.

- [D9] **Rooms pin a ruleset.** A profile is accepted only if its ruleset version equals the room's ruleset. A profile on an older ruleset shows "needs review" and can be re-saved under the current ruleset if it validates.

- [D10] **Piece files** live at `packages/library/pieces/{id}/piece.json`, with an optional `art.svg` alongside. The JSON may contain an optional `art.candidate.svg`. Candidate art is never loaded by the app.

- [D11] **Endless games.** A ruleset field `maxPlies` defaults to 400. Reaching it is a draw with reason `move-cap`. Threefold repetition is still a draw. There is no fifty-move rule.

- [D12] **Bots.** Fairy-Stockfish sits behind a `BotEngine` interface. The default implementation is a native Fairy-Stockfish binary on the server, speaking UCI, which avoids the GPL question for the client bundle. A WASM worker can be added later if the project goes GPL. The Takes engine is the sole authority for game end. FSF variant config sets `nMoveRule = 0`.

- [D13] **Runtime.** Node 22 (installed: v22.22.2) and pnpm 9. Persistence uses `better-sqlite3` for now. TypeScript strict, ESM only.

- [D14] **Mate-in-1 on move 1** is allowed. King safety only guarantees the king cannot be captured, or be in check, on the first move of either side.

- [D15] **Art.** Procedural SVG is the baseline for every piece. Codex image-gen output goes to `art.candidate.svg` only, and a human promotes it to `art.svg`. Pieces are scaled by a per-tier size table, never fit to the box.

- [D16] **Setup budget.** The pool is 39, which matches the vanilla army. `maxCount` is queen: 1. Values are placeholders until valuation (M6).

- [D17] **Ruleset 2026.2 (current).** Ivy removed the Warden: its sideways-slide/vertical-step design did not earn a slot. 2026.1 stays published and unchanged (old profiles show "needs review"). 2026.2 adds three hop pieces using existing range-1 leap components, with no new rules:
  - **Toad** `T` (minor, cost 3): leaps exactly two squares orthogonally over anything, and steps one square diagonally. Betza `DF`.
  - **Heron** `H` (minor, cost 3): leaps exactly two squares diagonally over anything, and steps one square orthogonally. Betza `AW`.
  - **Dragon** `D` (major, cost 13, max 1): a queen that can also hop exactly one adjacent square in any of the eight directions, landing two squares away. The jump limit is the balance lever: it cannot ride past a blocker or jump two squares. Betza `QDA`.
  Costs are provisional until valuation. Queen and Dragon are each capped at one.

- [D18] **Takes rule (hard constraint on every rules extension).** A capturing piece must end its move on the captured piece's square. En passant is the only exception. Hopping is allowed, but the hurdle is never captured. This rules out checkers-style jump captures, shooting, capture by approach or withdrawal, and explosions. Any new path type must name its capture square, and that square must be its landing square. Cannon, grasshopper, lame leapers and riders all satisfy this, and are candidate extensions after the catalog.

- [D19] **Officers read the same advancing and retreating** (Ivy). Minor pieces should be front/back symmetric: their backward moves mirror their forward moves, so players can judge what is safe at a glance. The validator emits `FRONT_BACK_SYMMETRY` as a warning for minor pieces; pawn tier is exempt, since it is forward-only by design. The Lancer violates this and stays only until it is replaced. Catalog screens use `--four-way` (left/right and front/back symmetric): 1,403 of 56,211 pieces.
  - Open question: should rook and major tiers follow the same rule?
