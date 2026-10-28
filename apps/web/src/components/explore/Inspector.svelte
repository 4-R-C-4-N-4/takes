<script lang="ts">
  // Shared piece inspector: preview board, moves/attacks segmented control, legend,
  // plain-language description, cost/tier. Used by Library and Lab (Candidates).
  import type { Piece } from '@takes/library';
  import Board from '../Board.svelte';
  import PieceIcon from '../PieceIcon.svelte';
  import { describePiece } from '../../lib/describePiece.js';
  import { previewMarks, type PreviewMode } from '../../lib/preview.js';
  import { sqOf } from '../../lib/board.js';

  let {
    piece,
    art,
    title = undefined,
    cellSize = 44,
    cost = undefined,
    extra = undefined,
  }: {
    piece: Piece;
    art: string;
    /** Override the heading (e.g. a short Betza string) when piece.name isn't display-friendly. */
    title?: string | undefined;
    cellSize?: number;
    cost?: number | undefined;
    extra?: import('svelte').Snippet | undefined;
  } = $props();

  let from = $state(sqOf(3, 3));
  let mode = $state<PreviewMode>('all');

  // Reset the preview square to the center whenever the inspected piece changes.
  $effect(() => {
    void piece.id;
    from = sqOf(3, 3);
  });

  const highlights = $derived(previewMarks(piece, from, mode) as Map<number, string>);
  const pieces = $derived(new Map([[from, { svg: art, color: 'w' as const }]]));
  const description = $derived(describePiece(piece));
</script>

<div class="inspector stack" data-testid="inspector">
  <header class="row head">
    <PieceIcon svg={art} size={48} />
    <div class="stack tight">
      <h2 class:mono-title={title !== undefined}>{title ?? piece.name}</h2>
      <p class="muted meta">
        {#if title !== undefined && title !== piece.name}<span class="nickname">{piece.name}</span>{/if}
        <span class="mono">{piece.glyph}</span>
        <span class="eyebrow tier">{piece.tier}</span>
        {#if cost !== undefined}<span class="num cost">{cost} pt{cost === 1 ? '' : 's'}</span>{/if}
      </p>
    </div>
  </header>

  <div class="segmented" role="group" aria-label="Preview">
    <button aria-pressed={mode === 'all'} onclick={() => (mode = 'all')}>Moves + attacks</button>
    <button aria-pressed={mode === 'moves'} onclick={() => (mode = 'moves')}>Moves</button>
    <button aria-pressed={mode === 'captures'} onclick={() => (mode = 'captures')}>Attacks</button>
  </div>

  <Board ranks={8} {cellSize} {pieces} {highlights} onSquareClick={(sq) => (from = sq)} />

  <p class="legend muted">
    <span class="key quiet"></span> move
    <span class="key capture"></span> capture
    <span class="key both"></span> move or capture
    — tap a square to move the piece.
  </p>

  <p class="description">{description}</p>

  {#if extra}{@render extra()}{/if}
</div>

<style>
  .inspector { font-size: var(--fs-md); }
  .stack.tight { gap: 2px; min-width: 0; }
  .head { align-items: center; min-width: 0; }
  .head h2 { overflow-wrap: anywhere; min-width: 0; }
  .head h2.mono-title { font-family: var(--font-mono); font-size: var(--fs-lg); font-weight: 600; }
  .meta { display: flex; gap: var(--s-2); align-items: center; flex-wrap: wrap; }
  .nickname { color: var(--text-muted); }
  .cost { color: var(--text); font-weight: 600; }
  .legend { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: center; font-size: var(--fs-xs); margin-top: var(--s-1); }
  .key { display: inline-block; width: 11px; height: 11px; border-radius: var(--r-1); margin-right: 3px; vertical-align: middle; }
  .key.quiet { background: var(--mark-move); border: 1px solid var(--line-strong); }
  .key.capture { background: transparent; border: 2px solid var(--mark-capture); }
  .key.both { background: var(--mark-both); }
  .description { color: var(--text-muted); max-width: 48ch; }
</style>
