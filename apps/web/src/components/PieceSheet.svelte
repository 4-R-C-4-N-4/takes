<script lang="ts">
  import { onMount } from 'svelte';
  import type { Piece } from '@takes/library';
  import Inspector from './explore/Inspector.svelte';
  import { pieceLabel } from '../lib/pieceLabel.js';

  let { piece, art, cost, onclose }: { piece: Piece; art: string; cost: number; onclose: () => void } = $props();
  let dialog: HTMLDialogElement;
  let cellSize = $state(40);
  const label = $derived(pieceLabel(piece));

  onMount(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    const resize = () => { cellSize = Math.min(44, Math.floor((window.innerWidth - 64) / 8)); };
    resize();
    window.addEventListener('resize', resize);
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    dialog.querySelector('button')?.focus();
    return () => {
      window.removeEventListener('resize', resize);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  });
</script>

<dialog bind:this={dialog} class="panel piece-sheet" aria-label="Moves of {label.primary}" aria-modal="true"
  oncancel={(ev) => { ev.preventDefault(); onclose(); }}
  onclick={(ev) => { if (ev.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (ev.clientX < rect.left || ev.clientX > rect.right || ev.clientY < rect.top || ev.clientY > rect.bottom) onclose();
  } }}>
  <div class="sheet-actions"><button class="btn ghost" onclick={onclose} aria-label="Close moves">Close</button></div>
  <Inspector {piece} {art} {cost} {cellSize} title={label.primary} />
</dialog>

<style>
  .piece-sheet { color: var(--text); padding: var(--s-4); width: min(480px, calc(100% - 32px)); max-height: 80vh; max-height: 80dvh; overflow-y: auto; overscroll-behavior: contain; box-shadow: var(--shadow-2); }
  .piece-sheet::backdrop { background: var(--ink-0); opacity: 0.8; }
  .piece-sheet :global(.board) { touch-action: pan-y; }
  .sheet-actions { display: flex; justify-content: flex-end; margin-bottom: var(--s-2); }
  @media (max-width: 720px) {
    .piece-sheet { margin: auto 0 0; width: 100%; max-width: 100%; border-radius: var(--r-3) var(--r-3) 0 0; padding-bottom: max(var(--s-4), env(safe-area-inset-bottom)); }
  }
</style>
