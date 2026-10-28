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

## Hand-drawn set v5 (2026.3 new pieces)

`packages/library/pieces/{id}/art.svg` also covers the 20 new 2026.3 pieces.
A first attempt (set v4) encoded movement as small notches on shared boxy
bodies and failed review: the forward pawns were indistinguishable and most
minors read as "box + small topper". Set v5 instead draws each piece as a
bold, memorable silhouette taken from the designer's own nickname — the art's
job is instant recognition on the board; the in-game UI already shows the
Betza shorthand in the palette and legal-move dots. Every v5 piece still uses
the same plinth, baseline and tier-footprint grammar as the classics, and
pawn-tier pieces reuse the pawn's collar/shoulders so they read as a pawn
family while differing above the collar.

Motif per piece:

| Piece | Tier | Motif |
| --- | --- | --- |
| Triton | pawn | Three-pronged trident head |
| Sai | pawn | Sai dagger: central blade with two curved side prongs |
| Worm | pawn | Coiled S-curve worm body |
| Rose | pawn | Layered rose-bloom petals |
| Vine | pawn | Curling vine tendril with a leaf |
| Broom | pawn | Fan-bristled broom head on a shaft |
| Coroner | minor | Hooded cloak silhouette with a hanging toe-tag |
| Bullseye | minor | Concentric target rings |
| Impact | minor | Jagged starburst/meteor spikes |
| Octopus | minor | Bulbous head with four dangling tentacle lines |
| Scarab | minor | Split-shell beetle body with leg ticks each side |
| Seal | minor | Asymmetric rounded seal-animal blob with a flipper |
| Halo | minor | Head with a free-floating ring above it |
| Jester | minor | Three-point jester cap tipped with bells |
| Turtle | minor | Domed shell with a lattice shell pattern |
| Prince | minor | Small three-point crown, deliberately no cross (unlike the king) |
| Dancer | minor | Curved flowing body with one raised, sweeping arm |
| Azazel | rook | Rook tower with curved horns and swept wing tips |
| Hierophant | major | Stacked triple-tiered crown (papal-tiara silhouette) |
| Bane | major | Tall body under a jagged spiked crown, the most imposing silhouette |

Regenerate with:

```sh
python packages/art/scripts/contact-sheet-v5.py
```

This writes `docs/art/set-v5-40.png`, `docs/art/set-v5-96.png`,
`docs/art/set-v5-board.png` (mixed 2026.3 army lineup) and
`docs/art/set-v5-distinctness.json`. Current minimum pairwise 40px silhouette
IoU is ~0.41 (dancer/azazel), far below the set-v3 era's tight pawn/berolina
pairing, reflecting the deliberately bold, differentiated silhouettes.

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
