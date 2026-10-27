<script lang="ts">
  export let svg: string;
  export let size: number = 40;
  export let color: 'w' | 'b' = 'w';
</script>

<span
  class="piece-icon"
  style="--piece-fill: var(--piece-fill-{color}); --piece-stroke: var(--piece-stroke-{color}); width:{size}px; height:{size}px;"
  >{@html svg}</span
>

<style>
  .piece-icon {
    display: inline-block;
  }
  .piece-icon :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
</style>
