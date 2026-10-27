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
