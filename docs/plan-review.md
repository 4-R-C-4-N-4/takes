# Takes — Plan Review (spec v0.1 + impl guide)

Oct 27, 2026. Reviewed docs/spec.md and docs/impl.md. Fairy-Stockfish (FSF) claims were checked against the current upstream `src/variants.ini`. The codex art claims come from an actual run, saved in docs/art-spike/.

Overall: the plan is sound and buildable. Pieces-as-data, a shared pure engine, build-time validation, and perft first are all the right calls. The perft numbers in the guide are correct. The issues below are mostly places where the spec and the guide disagree, or where FSF can't express what the plan assumes. Fix them in the docs before M1/M2 so the coding agent doesn't stop to ask.

## A. Resolve before M1/M2 (contradictions / will break)

1. **Rook-tier castling depends on a value that doesn't exist yet.** The spec Tiers section says a value outside the band is "a warning, never a rule change". The Rook row and the guide's validator say the measured value "must" be in the band. Castling ships in M1–M3, but values arrive in M6, so this is circular.
   Fix: for v1, castling eligibility is structural only (an infinite l+r slide). A band miss is a warning, as the Tiers section already says.

2. **The castling partner rule is dynamic in the spec and static in the guide.** The spec says "closest rook-tier piece on that side of rank 1", which is re-evaluated each move. If the inner rook leaves, the outer unmoved rook becomes castle-eligible. The guide stores rights as partner start squares, and FSF uses static Shredder-FEN file rights. The static model is the only one FSF can mirror.
   Fix: write it into the spec as "partner = closest rook-tier piece at game start; the right is lost when it or the king moves". Emit Shredder-FEN castling (file letters), not KQkq. X-FEN KQ means the outermost rook, which is wrong here.

3. **Rulesets aren't actually immutable.** A ruleset pins costs, but piece behaviour lives in `pieces/*.json`. Editing the warden's components silently changes every 2026.1 profile and game replay.
   Fix: the ruleset embeds each piece's components, or a content hash plus a versioned piece id.

4. **Non-unit slide vectors are riders.** Under the movegen as written, `slide [1,2]` is a nightrider and `slide [0,3] range 1` is a 3-rank leaper. That contradicts "leap riders deferred" and gets around the |dy| ≤ 2 leap cap (king safety still catches it, but the stated library constraint doesn't hold).
   Fix: a piece validator rule that slide vectors must be unit (W or F atoms). FSF can only ride W/F/N anyway.

5. **The Betza exporter's "i for rank2" won't load in FSF.** FSF's supported Betza subset has no `i` modifier (atoms, direction modifiers, W/F/N riders, pR/pB/gR/gB, nN/nA/nZ/nD only).
   Fix: map the vanilla pawn to FSF's built-in `pawn`. Its default `doubleStepRegionWhite = *2` matches the spec's rank-2 rule exactly. Keep the spec's `mfWifmnDcfF` as documentation only.
   Variant options that do exist and cover the plan: `castlingRookPieces` (a set, so every rook-tier letter works), `promotionPawnTypes` (every pawn-tier letter), `enPassantTypes = p`, `promotionPieceTypesWhite/Black`, `chess960 = true`, `nMoveRule = 0` (the default is 50), and `customPiece1..25` (classics are built in, so 25 slots go to new pieces).

6. **Glyphs collide, and the glyph is the FEN/UCI letter.** Warden is `W`, and Wraith would naturally also be `W`. FSF needs one unique letter per piece type, `k` is reserved, and the same letter is used for UCI promotion suffixes.
   Fix: a ruleset validation rule that every glyph is a single unique letter that isn't K. Black uses lowercase.

7. **Promotion to "only your playing-set pieces" (Ivy's note) is feasible but needs rules:**
   - FSF supports it through `promotionPieceTypesWhite/Black`, with a variant generated per game. The bot worker would call `loadVariantConfig` per game, which is fine.
   - Define "set" as the non-king, non-pawn-tier piece types in your starting setup, not the pieces currently on the board.
   - Edge case: a setup with only king plus pawn-tier pieces has no targets, and a pawn on rank 7 would have no legal advance. Options are a fallback list, or a builder rule requiring at least one promotable type.
   - The spec should replace the guide's static `promotionTargets` list if this is adopted.

8. **Bot hosting contradicts itself.** The stack table and "Bot runtime" say WASM in a Web Worker. The licensing section argues for server-side. This decides the architecture, so make it before M3 rather than M5.
   - If Takes is open source under GPL-3, client-side WASM is fine.
   - If not, run a native FSF binary over UCI on the Hetzner box. It is also faster than WASM.
   - Either way, keep the bot behind an interface.

## B. Fix in the docs, not blocking

9. **Valuation is self-referential.** FSF plays custom pieces using its own auto-estimated values, so it misplays exactly the pieces it misvalues.
   - Iterate: fit a value, feed it back through `pieceValueMg/Eg`, and re-run until it stabilises.
   - Measure from Takes-style blind setups, not vanilla swaps.
   - Expect roughly thousands of games per piece for a ±0.2 CI. Put a game budget in M6.

10. **Game end belongs to the Takes engine, not FSF.** FSF defaults to the 50-move rule and has its own adjudication. Set `nMoveRule = 0` and never trust FSF's game-over. Bot-vs-human games with no 50-move rule can shuffle forever, so the endless-game decision is needed before M5, not "during".

11. **King safety blocks king capture on move 1, not mate-in-1.** A fool's-mate-style check from rank 4/5 is still possible: a king on e1 with f2 empty passes, and Qh4 still lands. That's probably the intended gamble, but say so in the spec.

12. **"Never stranded" needs to say whether capture-only destinations count.** If they do, a pawn-tier piece with only capture components passes but can never advance without a victim. Recommend requiring at least one move-mode destination per square.

13. **The validator needs severities.** The guide says "Save disabled while any issue exists" and also emits value-band warnings. Return `{severity: 'error' | 'warning'}` and only block on errors.

14. **Old-ruleset profiles are underspecified.** The spec says the server re-checks against the *current* ruleset. The guide says rooms have a ruleset and old profiles get a "needs review" badge. Pick one: either rooms pin a ruleset and profiles must match it, or profiles auto-migrate when they re-validate.

15. **Pieces directory layout conflicts.** The guide has `pieces/{id}.json` (a file) in one place and `pieces/{id}/art.svg` (a folder) in another. Use `pieces/{id}/piece.json` + `art.svg`.

16. **Parity coverage gaps.** The random-profile generator for Layer 2 isn't listed (put it in tools/, seeded). Make sure parity fixtures include vanilla pawns on ranks 1 and 3; FSF's handling of rank-1 pawns is unverified.

17. **Stack nits.**
    - Node 24 has been Active LTS since Oct 2025, and 22 is in maintenance (EOL Apr 2027). Decide which to target.
    - `node:sqlite` would remove the native `better-sqlite3` build dependency, but it's still flagged experimental.
    - ~/Work/takes isn't a git repo yet. Codex and the build both need one.

## C. Art — using codex image gen (spike done)

The procedural SVG pipeline stays the v1 baseline, because every new piece needs art instantly and image gen can't run at definition time. Codex fits the **hand-made override** tier: classics and hero pieces. It also fits raster assets such as board textures, lobby/hero art and the reveal animation.

**Spike (docs/art-spike/):**
- One `codex exec` call produced a 3×2 silhouette sheet: pawn, winged knight, mitred bishop, crenellated rook, queen, and wraith (crenellated body + mitred crest). It took ~60 s and returned a 1536×1024 RGB PNG.
- Each cell was thresholded and traced with the npm `potrace` package (pure JS, so it fits `tools/`). That gives a single-path SVG, viewBox 0 0 100 100, with fill and stroke from `--piece-fill` / `--piece-stroke`.
- Files are 1.0–2.8 KB each. `row40x4.png` shows both colours rendered at 40 px.
- Result: all six are readable and distinguishable at 40 px, and one SVG serves both colours. The pipeline works.

**Problems the spike exposed (design them in):**
- **Normalising each crop to fill the box erases the tier size grammar.** Pawn, rook and queen all come out the same height. Scale against a fixed per-tier height/width table on a shared baseline, never fit-to-box.
- **Mitred cuts split pieces into islands.** The wraith's crest became a ~2 px fleck at 40 px. Prompts need "one connected silhouette, cuts no thinner than ~6% of height". Add an automated check: count connected components and the minimum feature width at 40 px.
- **The model drifts toward Staunton shapes** even when told not to: the pawn grew a bishop finial and the bishop is a classic mitre. The spec bans third-party sets, so grammar compliance needs a human approval gate before an `art.svg` lands.
- **Output size isn't fixed** (1536×1024 here, versus 1254² in other runs). The pipeline must not assume dimensions.

**Proposed `tools/artgen`:**
1. Build the prompt from the piece's components, using the same component→motif mapping the procedural generator uses (tier→base size, orthogonal→crenellated, diagonal→mitred, leap→wings/head, forward-only→pointed top, crest only when capture ≠ move). The grammar then lives in one place.
2. Make one codex call at a time, resumably (skip pieces that already have outputs). If the copy step fails, fall back to `~/.codex/generated_images/`.
3. Threshold, then potrace, then tier-scale onto the baseline, then inject CSS vars. Then run checks: path count, islands, 40 px min-feature, and that both colours render.
4. Write `pieces/{id}/art.candidate.svg` plus a 40 px contact sheet. A human renames it to `art.svg` to approve.

Effort: about 1 day for the tool, plus about 1 min of generation per piece.

## Suggested sequencing tweak

M3 currently gates on procedural art for every piece. The procedural parts library is real design work and not on the rules-risk path. Instead:
- Ship M3 with move-diagram badges plus the glyph letter as fallback art.
- Run procedural art and codex override art as a parallel track that merges by M4.

Rules correctness (M1/M2/M5 parity) remains the critical path.
