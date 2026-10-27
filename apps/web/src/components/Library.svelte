<script lang="ts">
  import { getRuleset, CURRENT_RULESET_VERSION, expandPiece, canMove, canCapture } from '@takes/library';
  import type { Piece } from '@takes/library';
  import Board from './Board.svelte';
  import PieceIcon from './PieceIcon.svelte';
  import { artFor, tierOrder } from '../lib/pieceArt.js';
  import { sqOf } from '../lib/board.js';
  import { KING_PIECE } from '../lib/king.js';

  const ruleset = getRuleset(CURRENT_RULESET_VERSION)!;
  const pieces: Piece[] = [KING_PIECE, ...Object.values(ruleset.pieces)];

  let selected: Piece | null = null;
  let previewFromSq: number | null = null;

  function grouped() {
    const byTier = new Map<string, Piece[]>();
    for (const t of tierOrder()) byTier.set(t, []);
    for (const p of pieces) byTier.get(p.tier)?.push(p);
    return byTier;
  }

  function costOf(p: Piece): number {
    return p.id === 'king' ? 0 : ruleset.costs[p.id] ?? 0;
  }

  function selectPiece(p: Piece): void {
    selected = p;
    previewFromSq = sqOf(4, 1); // default preview origin, rank 2, e-file
  }

  function highlightsFor(): Map<number, string> {
    const map = new Map<number, string>();
    if (!selected || previewFromSq === null) return map;
    const vectors = expandPiece(selected, 'w');
    const fromFile = previewFromSq % 8;
    const fromRank = Math.floor(previewFromSq / 8);
    for (const v of vectors) {
      for (let step = 1; step <= Math.min(v.range, 8); step++) {
        const f = fromFile + v.dx * step;
        const r = fromRank + v.dy * step;
        if (f < 0 || f > 7 || r < 0 || r > 7) break;
        const sq = r * 8 + f;
        if (canCapture(v) && !canMove(v)) map.set(sq, 'capture');
        else map.set(sq, map.has(sq) ? map.get(sq)! : 'quiet');
        if (v.path === 'slide') continue; // sliders show full ray; leaps handled by loop bound
      }
    }
    return map;
  }

  function onSquareClick(sq: number): void {
    previewFromSq = sq;
  }
</script>

<h1>Library — {CURRENT_RULESET_VERSION}</h1>

{#each [...grouped()] as [tier, list] (tier)}
  {#if list.length}
    <section>
      <h2>{tier}</h2>
      <div class="palette">
        {#each list as p (p.id)}
          <button class="piece-card" class:selected={selected?.id === p.id} on:click={() => selectPiece(p)}>
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
    <p>Click a square to move the preview origin. Blue = quiet move, red = capture.</p>
    <Board
      ranks={8}
      cellSize={40}
      pieces={new Map([[previewFromSq!, { svg: artFor(ruleset, selected.id), color: 'w' }]])}
      highlights={highlightsFor()}
      onSquareClick={onSquareClick}
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
</style>
