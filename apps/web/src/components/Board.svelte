<script lang="ts">
  // Reusable SVG board: renders `ranks` x 8 squares. Used by Library preview, Builder and Game.
  import PieceIcon from './PieceIcon.svelte';
  import { squareXY, isLight } from '../lib/board.js';

  export let ranks: number = 8; // number of ranks shown, from the bottom
  export let flipped: boolean = false;
  export let cellSize: number = 44;
  /** sq (0..63, but only squares within `ranks` used) -> { svg, color } */
  export let pieces: Map<number, { svg: string; color: 'w' | 'b' }> = new Map();
  /** sq -> css class name for highlight overlay */
  export let highlights: Map<number, string> = new Map();
  export let onSquareClick: ((sq: number) => void) | undefined = undefined;
  export let onPieceDown: ((sq: number, ev: PointerEvent) => void) | undefined = undefined;

  const width = () => cellSize * 8;
  const height = () => cellSize * ranks;

  function squares(): number[] {
    const out: number[] = [];
    for (let r = 0; r < ranks; r++) for (let f = 0; f < 8; f++) out.push(r * 8 + f);
    return out;
  }

  function xy(sq: number): { x: number; y: number } {
    const f = sq % 8;
    const r = Math.floor(sq / 8);
    const col = flipped ? 7 - f : f;
    const row = flipped ? r : ranks - 1 - r;
    return { x: col * cellSize, y: row * cellSize };
  }
</script>

<svg viewBox="0 0 {width()} {height()}" width={width()} height={height()} class="board" role="img" aria-label="board">
  {#each squares() as sq (sq)}
    {@const p = xy(sq)}
    <rect
      x={p.x}
      y={p.y}
      width={cellSize}
      height={cellSize}
      class="square {isLight(sq) ? 'light' : 'dark'}"
      role="button"
      tabindex="-1"
      on:click={() => onSquareClick?.(sq)}
    />
    {#if highlights.has(sq)}
      <rect x={p.x} y={p.y} width={cellSize} height={cellSize} class="highlight {highlights.get(sq)}" />
    {/if}
  {/each}
  {#each squares() as sq (sq)}
    {@const p = xy(sq)}
    {#if pieces.has(sq)}
      {@const piece = pieces.get(sq)!}
      <foreignObject x={p.x} y={p.y} width={cellSize} height={cellSize}>
        <div
          style="width:100%;height:100%"
          on:pointerdown={(ev) => onPieceDown?.(sq, ev)}
          on:click={() => onSquareClick?.(sq)}
        >
          <PieceIcon svg={piece.svg} color={piece.color} size={cellSize} />
        </div>
      </foreignObject>
    {/if}
  {/each}
</svg>

<style>
  .board { touch-action: none; max-width: 100%; }
  .square.light { fill: #e9e3d3; }
  .square.dark { fill: #7a6a52; }
  .highlight { pointer-events: none; }
  .highlight.quiet { fill: rgba(70, 150, 230, 0.4); }
  .highlight.capture { fill: rgba(220, 70, 70, 0.45); }
  .highlight.select { fill: rgba(240, 220, 90, 0.5); }
  .highlight.lastmove { fill: rgba(240, 220, 90, 0.3); }
  .highlight.error { fill: rgba(220, 40, 40, 0.5); }
  .highlight.warning { fill: rgba(230, 170, 40, 0.5); }
  .highlight.check { fill: rgba(255, 0, 0, 0.6); }
</style>
