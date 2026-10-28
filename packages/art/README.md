# Procedural piece art

`pieceSvg(piece, options?)` generates deterministic SVG from library components.
`KING_PIECE` supplies the engine-fixed king. `badgeSvg` and `badgeMarks` retain
movement diagrams; `resolveArt` prefers a supplied handmade override. The app
integration and candidate artwork are outside this package's scope.

## Visual grammar

Use bold, connected silhouettes with a single fill and 3-unit rounded outline.
The fixed `0 0 100 100` canvas is never cropped or individually fitted. All pieces
stand on y=92. Nominal tier heights are pawn 56, minor 78, rook 70, major 88;
including outline these occupy 59%, 81%, 73%, and 91% of the canvas. The tallest
pieces therefore read at approximately 90%, with a small protective margin.
Tier widths are 42, 52, 66, and 48 respectively. Pawn feet are small, rook feet
are broad, and major bodies are tall. Keep the waist and feet substantial at 40px.

| Components | Silhouette cue |
| --- | --- |
| Orthogonal sliders | Deep square battlements |
| Horizontal slide + vertical step | Wide shelf and shallow central gate (warden) |
| Diagonal motion | Split, slashed mitre |
| Leap | Swept wings and central head |
| Forward slider + backward step | Spear with a broad guard (lancer) |
| Orthogonal + diagonal sliders | Three-point open crown (queen) |
| Forward quiet / diagonal capture | Blunt forward head with capture shoulders (pawn) |
| Diagonal quiet / forward capture | Forked shoulders around a straight spear (berolina) |
| Orthogonal quiet / diagonal capture | Battlement shoulders with split crest (wraith) |

Direction and step/infinite-range signatures come from expanded movement vectors.
The renderer selects these forms by signature, never by library piece id. Capture
crests are integrated into the head so they cannot float or collide with the body.
The king is the sole identity exception: its one-step movement body carries a
broad, connected cross. This separates it from both queen and wraith.

This is a compact fallback grammar, not a unique encoding of every possible move
set: finite ranges share the step category, leap vectors share wings, and some
future direction subsets may share a silhouette. Consult the move badge for exact
rules. New library definitions automatically receive art; extend the grammar when
new pieces require additional distinctions.

## Theme and API

The SVG uses `--piece-fill` and `--piece-stroke` for both player colors. Optional
`fillFallback` and `strokeFallback` add CSS variable fallbacks for standalone use.
Names are XML-escaped. Geometry uses no random state, external images or fonts.
Existing coarse motif helpers remain available alongside `pieceSignatures`.

## Hand-drawn set v3

`packages/library/pieces/{id}/art.svg` holds a hand-authored override per piece
(`resolveArt` prefers it over the procedural fallback); `apps/web` resolves these
via `import.meta.glob`, including `king/art.svg` even though the king has no
`piece.json` (its data comes from `KING_PIECE` in `apps/web/src/lib/king.ts`).
All overrides share one geometric style: `viewBox 0 0 100 100`, a single
rounded plinth baseline at y=86-92, `stroke-width 4`/`stroke-linejoin round`,
and only `var(--piece-fill)`/`var(--piece-stroke)` for color. Tier widths
follow the procedural grammar (pawn narrowest, rook/major widest) so silhouette
weight still signals tier at a glance.

Motif per piece:

| Piece | Motif |
| --- | --- |
| Pawn | Round head on a collar, classic Staunton-style silhouette drawn fresh |
| Berolina | Diamond (rotated-square) head + a V-notch chevron collar cut into the shoulder, unmistakably not a round pawn |
| Knight | Horse head and mane facing left, minor-tier base |
| Bishop | Pointed mitre bulb with a diagonal slit and ball finial |
| Wraith | Tower shoulders (echoing the rook) rising into a bishop-like pointed hood, with a diagonal slit cue for its diagonal capture |
| Lancer | Vertical shaft through a wide crossguard, topped with a spear point reaching above the other minors |
| Toad | Squat arched back with two eye bumps and diagonal step notches on each flank |
| Heron | Thin tall neck/body with a sideways beak and small orthogonal notch tabs |
| Rook | Crenellated tower, widest plinth |
| Queen | Tall tapering body under a 5-point open coronet |
| Dragon | Queen-height body with swept wings at mid-height and a 3-point crest (vs. the queen's 5), the widest and most imposing silhouette |
| King | Major-tier body topped by a bold connected cross finial |

Regenerate the verification sheets with:

```sh
python packages/art/scripts/contact-sheet-v3.py
```

This writes `docs/art/set-v3-40.png`, `docs/art/set-v3-96.png` (contact sheets
across white/black pieces on light/dark squares), `docs/art/set-v3-board.png`
(a full-roster board lineup), and `docs/art/set-v3-distinctness.json` (pairwise
40px silhouette IoU; the closest pair should stay inspected visually — IoU
alone does not capture color/detail distinctness).

## Set v5: Codex concept silhouettes (current, all 2026.3 pieces + king)

Every override in `packages/library/pieces/{id}/art.svg` (classics, king and the 20 keepers) is a
traced Codex concept silhouette on the shared plinth. Two hand-drawn attempts for the new pieces
failed review: v4 encoded movement as notches on boxy bodies (forward pawns indistinguishable), and
a geometric v5 draft still read as small motifs on stubby bodies. The board's job is instant
recognition; the UI already shows the movement shorthand (e.g. `B3N`) and legal-move dots.

Motifs follow the designer's nicknames: Triton trident, Sai dagger, Worm coil, Rose bloom, Vine
leaf tendril, Broom, Coroner hooded figure with staff, Bullseye target, Impact starburst, Octopus,
Scarab beetle, Seal balancing a ball, Halo robed figure with halo, Jester cap, Turtle shell, Prince
crown with **no cross** (never confusable with the King), Dancer, Azazel horned winged figure,
Hierophant papal triple crown, Bane spiked skull crown. Classics are a matching illustrated
Staunton-style set.

Pipeline (concept sheets are not committed):

1. Codex generates one grid sheet per batch: bold flat black silhouettes on white, all on the same
   round plinth (prompts recorded in the commit message).
2. `python packages/art/scripts/split_sheet.py sheet.png crops/ id1,id2,...` finds grid cells,
   cuts every cell at the median plinth height and saves padded figure masks.
3. Thicken thin-stroked figures (Pillow `MinFilter(5..9)`) if they vanish at 40px.
4. `tools/artgen/scripts/trace-concepts.ts crops/ id ...` potraces each mask and fits it into the
   tier box above the classic plinth (pawn top 30 / minor 17 / rook 15 / major 8; plinth widths
   42/48/58/54, y 86-92), with `var(--piece-fill)` / `var(--piece-stroke)` and even-odd holes.
   Run it with tsx from a package that has tsx (e.g. copy into `apps/server` temporarily).
5. `python packages/art/scripts/contact-sheet-v5.py` renders `docs/art/set-v5-{40,96,board}.png`
   and `set-v5-distinctness.json` (pairwise 40px silhouette IoU; min pair broom/seal ≈ 0.33).

## Review and regeneration

From the repository root:

```sh
python packages/art/scripts/contact-sheet.py
pnpm check
pnpm test
git diff --check
```

The raster runner requires Node 22, Python with Pillow, `rsvg-convert` and
ImageMagick (`magick`). It uses the supplied TS ESM loader with `--loader`, then
executes raster jobs from Python because Node subprocesses and tsx IPC can be
blocked by the workspace sandbox. Temporary tiles live in the system temporary
directory and are removed automatically. No image generation service is used.

Outputs in `docs/art/`:

- `procedural-40.png`: ten columns, art then badges, four rows each in white/light,
  white/dark, black/light and black/dark order.
- `procedural-64.png`: the same ten pieces in all four color/square combinations.
- `procedural-labeled.png`: named 40px silhouettes, useful for quick recognition.
- `procedural-sheet.svg`: larger labeled SVG overview, including badges.
- `procedural-distinctness.json`: every pair's bitmap distance and raster bounds
  at 40px and 64px.

Distance is the mean absolute alpha difference divided by 255 over the entire
canvas, with identical black fill and outline on transparency. This prevents
labels, theme contrast and background colors from inflating distinctness. The
runner checks all edges are transparent and minimum pair distance exceeds 1%.
The closest pair is pawn/berolina: 0.022885 at 40px and 0.023346 at 64px. These
numbers measure silhouette differences, not human recognition; inspect the
sheets at native size as well. The unit tests separately enforce geometry-only
uniqueness for all ten pieces, component-order invariance, tier envelopes, baseline,
CSS variables, direction/range classification, badges and override behavior.
