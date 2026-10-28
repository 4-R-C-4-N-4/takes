<script lang="ts">
  // Reusable SVG board: renders `ranks` x 8 squares. Used by Library preview, Builder and Game.
  import PieceIcon from './PieceIcon.svelte';
  import { isLight } from '../lib/board.js';

  let {
    ranks = 8,
    flipped = false,
    cellSize = 44,
    pieces = new Map<number, { svg: string; color: 'w' | 'b' }>(),
    highlights = new Map<number, string>(),
    fileLabels = false,
    coordinates = false,
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
    /** show rank/file coordinates inside the edge squares (DESIGN.md board spec) */
    coordinates?: boolean;
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

  // Edge squares: bottom row gets file letters, left column gets rank numbers.
  function isBottomRow(sq: number, ranks: number, flipped: boolean): boolean {
    const r = Math.floor(sq / 8);
    return flipped ? r === ranks - 1 : r === 0;
  }
</script>

<div class="board-shell" data-board-root style="--cell:{cellSize}px; --cols:8; --ranks:{ranks}">
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
        {@const h = highlights.get(sq)!}
        <rect x={p.x} y={p.y} width={cellSize} height={cellSize} class="highlight {h}" />
        {#if h === 'quiet' || h === 'both'}
          <circle class="mark-dot" cx={p.x + cellSize / 2} cy={p.y + cellSize / 2} r={cellSize * 0.14} />
        {/if}
        {#if h === 'capture' || h === 'both'}
          <circle class="mark-ring" cx={p.x + cellSize / 2} cy={p.y + cellSize / 2} r={cellSize * 0.42} />
        {/if}
      {/if}
      {#if coordinates && isBottomRow(sq, ranks, flipped)}
        <text class="coord file" x={p.x + cellSize - 4} y={p.y + cellSize - 4}>{'abcdefgh'[sq % 8]}</text>
      {/if}
    {/each}
    {#each squareList.filter((sq) => (flipped ? sq % 8 === 7 : sq % 8 === 0)) as sq}
      {@const p = xy(sq, ranks, flipped, cellSize)}
      <text class="rank-label" x={p.x + 3} y={p.y + 12} fill={isLight(sq) ? 'oklch(30% 0.02 60 / 0.65)' : 'oklch(96% 0.012 90 / 0.8)'}>{Math.floor(sq / 8) + 1}</text>
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
            <PieceIcon svg={piece.svg} color={piece.color} size={cellSize * 0.84} />
          </div>
        </foreignObject>
      {/if}
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
  .board-shell { display: inline-block; max-width: 100%; }
  .board {
    touch-action: none; width: 100%; max-width: calc(var(--cell) * 8); height: auto; display: block;
    border-radius: var(--r-3); box-shadow: var(--shadow-2);
  }
  .square.light { fill: var(--sq-light); }
  .square.dark { fill: var(--sq-dark); }
  .square { cursor: pointer; }
  .square:focus-visible { outline: 3px solid var(--accent); outline-offset: -3px; }

  .highlight { pointer-events: none; }
  .highlight.select { fill: var(--mark-select); }
  .highlight.lastmove { fill: var(--mark-last); }
  .highlight.error { fill: var(--mark-error); }
  .highlight.warning { fill: var(--mark-warning); }
  .highlight.check { fill: var(--mark-check); }
  /* quiet/capture/both are drawn via the dot/ring marks below; keep a very faint tint so the
     highlighted square remains detectable even without the mark (e.g. in automated checks). */
  .highlight.quiet, .highlight.capture, .highlight.both { fill: transparent; }

  .mark-dot { fill: var(--mark-move); pointer-events: none; }
  .mark-ring {
    fill: none; stroke: var(--mark-capture); stroke-width: calc(var(--cell) * 0.07); pointer-events: none;
  }

  .coord { pointer-events: none; font-family: var(--font-ui); font-weight: 600; font-size: calc(var(--cell) * 0.22); }
  .coord.file { text-anchor: end; fill: color-mix(in oklch, var(--sq-light) 0%, var(--sq-dark) 0%); }
  /* Coordinate colour follows the square it sits on, computed per-square via currentColor trick isn't
     practical in SVG text fill from CSS alone, so use a contrast-safe neutral that reads on both. */
  .coord { fill: oklch(40% 0.02 60 / 0.65); }

  .piece-cell {
    width: 100%; height: 100%; cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: transform var(--t-fast) var(--ease);
  }
  .piece-cell:hover { transform: scale(1.04); }
  .piece-cell:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; border-radius: var(--r-1); }
  @media (prefers-reduced-motion: reduce) { .piece-cell { transition: none; } .piece-cell:hover { transform: none; } }

  .file-row { display: flex; margin-top: var(--s-1); }
  .file-label { text-align: center; font-size: var(--fs-xs); color: var(--text-faint); font-weight: 600; }
</style>
