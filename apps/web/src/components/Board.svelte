<script lang="ts">
  // Reusable SVG board: renders `ranks` x 8 squares. Used by Library preview, Builder and Game.
  import PieceIcon from './PieceIcon.svelte';
  import { squareXY, isLight } from '../lib/board.js';

  let {
    ranks = 8,
    flipped = false,
    cellSize = 44,
    pieces = new Map<number, { svg: string; color: 'w' | 'b' }>(),
    highlights = new Map<number, string>(),
    fileLabels = false,
    onSquareClick = undefined,
    onPieceDown = undefined,
  }: {
    ranks?: number;
    flipped?: boolean;
    cellSize?: number;
    /** sq (0..63, but only squares within `ranks` used) -> { svg, color } */
    pieces?: Map<number, { svg: string; color: 'w' | 'b' }>;
    /** sq -> css class name for highlight overlay */
    highlights?: Map<number, string>;
    /** show a-h file letters under the board */
    fileLabels?: boolean;
    onSquareClick?: ((sq: number) => void) | undefined;
    onPieceDown?: ((sq: number, ev: PointerEvent) => void) | undefined;
  } = $props();

  const width = $derived(cellSize * 8);
  const height = $derived(cellSize * ranks);

  function squares(ranks: number): number[] {
    const out: number[] = [];
    for (let r = 0; r < ranks; r++) for (let f = 0; f < 8; f++) out.push(r * 8 + f);
    return out;
  }
  const squareList = $derived(squares(ranks));

  function xy(sq: number, ranks: number, flipped: boolean, cellSize: number): { x: number; y: number } {
    const f = sq % 8;
    const r = Math.floor(sq / 8);
    const col = flipped ? 7 - f : f;
    const row = flipped ? r : ranks - 1 - r;
    return { x: col * cellSize, y: row * cellSize };
  }

  function onKey(sq: number, ev: KeyboardEvent): void {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      onSquareClick?.(sq);
    }
  }
</script>

<div class="board-shell" data-board-root style="--cell:{cellSize}px">
  <svg viewBox="0 0 {width} {height}" width={width} height={height} class="board" role="img" aria-label="board">
    {#each squareList as sq (sq)}
      {@const p = xy(sq, ranks, flipped, cellSize)}
      <rect
        x={p.x}
        y={p.y}
        width={cellSize}
        height={cellSize}
        class="square {isLight(sq) ? 'light' : 'dark'}"
        role="button"
        tabindex="0"
        data-sq={sq}
        aria-label="square {'abcdefgh'[sq % 8]}{Math.floor(sq / 8) + 1}"
        onclick={() => onSquareClick?.(sq)}
        onkeydown={(ev) => onKey(sq, ev)}
      />
      {#if highlights.has(sq)}
        <rect x={p.x} y={p.y} width={cellSize} height={cellSize} class="highlight {highlights.get(sq)}" />
      {/if}
    {/each}
    {#each squareList as sq (sq)}
      {@const p = xy(sq, ranks, flipped, cellSize)}
      {#if pieces.has(sq)}
        {@const piece = pieces.get(sq)!}
        <foreignObject x={p.x} y={p.y} width={cellSize} height={cellSize}>
          <div
            class="piece-cell"
            role="button"
            tabindex="0"
            data-sq={sq}
            aria-label="piece at square {'abcdefgh'[sq % 8]}{Math.floor(sq / 8) + 1}"
            onpointerdown={(ev) => onPieceDown?.(sq, ev)}
            onclick={() => onSquareClick?.(sq)}
            onkeydown={(ev) => onKey(sq, ev)}
          >
            <PieceIcon svg={piece.svg} color={piece.color} size={cellSize} />
          </div>
        </foreignObject>
      {/if}
    {/each}
    {#each squareList.filter((sq) => (flipped ? sq % 8 === 7 : sq % 8 === 0)) as sq}
      {@const p = xy(sq, ranks, flipped, cellSize)}
      <text class="rank-label" x={p.x + 3} y={p.y + 12} fill={isLight(sq) ? '#302b22' : '#fff'}>{Math.floor(sq / 8) + 1}</text>
    {/each}
  </svg>
  {#if fileLabels}
    <div class="file-row" style="width:{width}px">
      {#each Array(8) as _, i}
        {@const f = flipped ? 7 - i : i}
        <span class="file-label" style="width:{cellSize}px">{'abcdefgh'[f]}</span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .rank-label { pointer-events: none; font-size: 11px; font-weight: bold; }
  .board-shell { display: inline-block; max-width: 100%; }
  .board { touch-action: none; max-width: 100%; height: auto; display: block; }
  .square.light { fill: #e9e3d3; }
  .square.dark { fill: #7a6a52; }
  .square:focus-visible { outline: 3px solid #6ab0f3; outline-offset: -2px; }
  .highlight { pointer-events: none; }
  .highlight.quiet { fill: rgba(70, 150, 230, 0.4); }
  .highlight.capture { fill: rgba(220, 70, 70, 0.45); }
  .highlight.select { fill: rgba(240, 220, 90, 0.5); }
  .highlight.lastmove { fill: rgba(240, 220, 90, 0.3); }
  .highlight.error { fill: rgba(220, 40, 40, 0.5); }
  .highlight.warning { fill: rgba(230, 170, 40, 0.5); }
  .highlight.check { fill: rgba(255, 0, 0, 0.6); }
  .piece-cell { width: 100%; height: 100%; cursor: pointer; }
  .piece-cell:focus-visible { outline: 2px solid #6ab0f3; }
  .file-row { display: flex; }
  .file-label { text-align: center; font-size: 11px; opacity: 0.6; }
</style>
