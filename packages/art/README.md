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
