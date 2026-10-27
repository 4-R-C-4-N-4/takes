// Build the codex image-gen prompt for a piece, reusing the single source of
// truth for the component -> motif mapping (packages/art/src/motifs.ts), plus
// fixed style text so every generation targets the same visual grammar.
import type { Piece } from '@takes/library';
import { describePieceGrammar } from '@takes/art';

export const STYLE_SUFFIX =
  'Style: solid black silhouette on a flat white background. A single connected silhouette ' +
  '(no isolated floating parts, no cuts thinner than about 6% of the overall height). Front ' +
  'orthographic view, centered, like a chess piece on a table viewed from the side. No text, ' +
  'no shading, no gradients, no background scenery. Do NOT draw a Staunton chess set piece or ' +
  'copy any existing/trademarked chess set design — invent an original bold shape. Bold, bulky, ' +
  'readable even when shrunk to 40 pixels tall.';

/** Build the full codex image-gen prompt text for a library piece. */
export function buildPrompt(p: Piece): string {
  const grammar = describePieceGrammar(p);
  return `Create a single chess piece game-icon illustration. ${grammar} ${STYLE_SUFFIX}`;
}
