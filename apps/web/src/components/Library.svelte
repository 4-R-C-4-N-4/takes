<script lang="ts">
  import { getRuleset, CURRENT_RULESET_VERSION } from '@takes/library';
  import type { Piece } from '@takes/library';
  import Board from './Board.svelte';
  import PieceIcon from './PieceIcon.svelte';
  import { artFor, tierOrder } from '../lib/pieceArt.js';
  import { sqOf } from '../lib/board.js';
  import { KING_PIECE } from '../lib/king.js';
  import { previewMarks, type PreviewMode } from '../lib/preview.js';

  const ruleset = getRuleset(CURRENT_RULESET_VERSION)!;
  const pieces: Piece[] = [KING_PIECE, ...Object.values(ruleset.pieces)];

  let selected = $state<Piece | null>(null);
  let previewFromSq = $state<number>(sqOf(4, 1));
  let mode = $state<PreviewMode>('all');

  const grouped = $derived.by(() => {
    const byTier = new Map<string, Piece[]>();
    for (const t of tierOrder()) byTier.set(t, []);
    for (const p of pieces) byTier.get(p.tier)?.push(p);
    return byTier;
  });

  function costOf(p: Piece): number {
    return p.id === 'king' ? 0 : ruleset.costs[p.id] ?? 0;
  }

  function selectPiece(p: Piece): void {
    selected = p;
    previewFromSq = sqOf(3, 3); // d4: central, shows every direction
  }

  const highlights = $derived(selected ? (previewMarks(selected, previewFromSq, mode) as Map<number, string>) : new Map<number, string>());
  const previewPieces = $derived(selected ? new Map([[previewFromSq, { svg: artFor(ruleset, selected.id), color: 'w' as const }]]) : new Map());
</script>

<h1>Library — {CURRENT_RULESET_VERSION}</h1>

{#each [...grouped] as [tier, list] (tier)}
  {#if list.length}
    <section>
      <h2>{tier}</h2>
      <div class="palette">
        {#each list as p (p.id)}
          <button class="piece-card" class:selected={selected?.id === p.id} onclick={() => selectPiece(p)}>
            <PieceIcon svg={artFor(ruleset, p.id)} size={40} />
            <span class="glyph">{p.glyph}</span>
            <span class="cost">{costOf(p)}</span>
          </button>
        {/each}
      </div>
    </section>
  {/if}
{/each}

{#if selected}
  <section>
    <h2>Preview: {selected.name}</h2>
    <div class="modes" role="group" aria-label="Preview">
      <button class:active={mode === 'all'} onclick={() => (mode = 'all')}>Moves + attacks</button>
      <button class:active={mode === 'moves'} onclick={() => (mode = 'moves')}>Moves</button>
      <button class:active={mode === 'captures'} onclick={() => (mode = 'captures')}>Attacks</button>
    </div>
    <p class="legend">
      <span class="key quiet"></span> move only
      <span class="key capture"></span> capture only
      <span class="key both"></span> move or capture
      — tap a square to move the piece.
    </p>
    <Board
      ranks={8}
      cellSize={40}
      pieces={previewPieces}
      {highlights}
      onSquareClick={(sq) => (previewFromSq = sq)}
    />
  </section>
{/if}

<style>
  .palette { display: flex; flex-wrap: wrap; gap: 8px; }
  .piece-card {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    background: #2d2d33; border: 1px solid #444; border-radius: 8px; padding: 6px;
    color: #eee; cursor: pointer; min-width: 56px;
  }
  .piece-card.selected { border-color: #6ab0f3; }
  .glyph { font-weight: bold; }
  .cost { font-size: 12px; opacity: 0.7; }
  .modes { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
  .modes button { background: #2d2d33; color: #eee; border: 1px solid #444; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
  .modes button.active { border-color: #6ab0f3; box-shadow: 0 0 0 2px #6ab0f3; }
  .legend { font-size: 13px; }
  .key { display: inline-block; width: 12px; height: 12px; border-radius: 2px; margin-left: 8px; vertical-align: middle; }
  .key.quiet { background: rgba(70, 150, 230, 0.8); }
  .key.capture { background: rgba(220, 70, 70, 0.85); }
  .key.both { background: rgba(160, 90, 220, 0.85); }
</style>
