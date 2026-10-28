<script lang="ts">
  // Piece tile used in the Library grid: art, name, glyph + cost, tiny move badge.
  import type { Piece } from '@takes/library';
  import PieceIcon from '../PieceIcon.svelte';
  import { pieceLabel } from '../../lib/pieceLabel.js';

  let {
    piece,
    art,
    badge,
    cost,
    selected = false,
    onclick,
  }: {
    piece: Piece;
    art: string;
    badge: string;
    cost: number;
    selected?: boolean;
    onclick: () => void;
  } = $props();

  const label = $derived(pieceLabel(piece));
</script>

<button class="piece-card" class:selected data-testid="piece-tile" title="{label.primary} ({cost} pts)" {onclick}>
  <PieceIcon svg={art} size={60} />
  <span class="name" class:mono={label.primaryIsNotation}>{label.primary}</span>
  <span class="row meta">
    {#if label.secondary}<span class="nickname">{label.secondary}</span>{/if}
    <span class="glyph mono">{piece.glyph}</span>
    <span class="num cost">{cost}</span>
  </span>
  <span class="badge" aria-hidden="true">{@html badge}</span>
</button>

<style>
  .piece-card {
    display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; align-items: center;
    column-gap: var(--s-3); row-gap: 2px;
    background: var(--ink-1); border: 1px solid var(--line); border-radius: var(--r-2);
    padding: var(--s-2) var(--s-3); min-width: 0; width: 100%; cursor: pointer; text-align: left;
    color: var(--text); transition: border-color var(--t-fast) var(--ease), background var(--t-fast) var(--ease);
  }
  .piece-card:hover { background: var(--ink-2); }
  .piece-card.selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
  .piece-card :global(.piece-icon) { grid-row: 1 / 3; flex-shrink: 0; }
  .name { font-family: var(--font-display); font-size: var(--fs-md); font-weight: 560; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .name.mono { font-family: var(--font-mono); font-size: var(--fs-sm); letter-spacing: 0.01em; }
  .meta { gap: var(--s-2); color: var(--text-faint); font-size: var(--fs-xs); min-width: 0; }
  .nickname { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .glyph { color: var(--text-muted); }
  .badge { display: none; }
</style>
