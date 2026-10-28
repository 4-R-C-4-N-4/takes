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
  <PieceIcon svg={art} size={60} />
  <span class="name">{piece.name}</span>
  <span class="row meta">
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
  .name { font-family: var(--font-display); font-size: var(--fs-md); font-weight: 560; }
  .meta { gap: var(--s-2); color: var(--text-faint); font-size: var(--fs-xs); }
  .glyph { color: var(--text-muted); }
  .badge { display: none; }
</style>
