<script lang="ts">
  // Piece tile used in the Library grid: art, name, glyph + cost, tiny move badge.
  import type { Piece } from '@takes/library';
  import PieceIcon from '../PieceIcon.svelte';

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
</script>

<button class="piece-card" class:selected data-testid="piece-tile" {onclick}>
  <PieceIcon svg={art} size={48} />
  <span class="name">{piece.name}</span>
  <span class="row meta">
    <span class="glyph mono">{piece.glyph}</span>
    <span class="num cost">{cost}</span>
  </span>
  <span class="badge" aria-hidden="true">{@html badge}</span>
</button>

<style>
  .piece-card {
    display: grid; grid-template-columns: 1fr; justify-items: center; gap: 4px;
    background: var(--ink-1); border: 1px solid var(--line); border-radius: var(--r-3);
    padding: var(--s-3) var(--s-2); min-width: 108px; cursor: pointer; text-align: center;
    color: var(--text); transition: border-color var(--t-fast) var(--ease), background var(--t-fast) var(--ease);
  }
  .piece-card:hover { background: var(--ink-2); }
  .piece-card.selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
  .name { font-family: var(--font-display); font-size: var(--fs-md); font-weight: 560; margin-top: var(--s-1); }
  .meta { gap: var(--s-2); color: var(--text-faint); font-size: var(--fs-xs); }
  .glyph { color: var(--text-muted); }
  .badge { display: block; width: 26px; height: 26px; margin-top: 2px; opacity: 0.85; --piece-fill: var(--text-faint); --piece-stroke: var(--text-faint); }
  .badge :global(svg) { width: 100%; height: 100%; display: block; }
</style>
