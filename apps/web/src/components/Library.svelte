<script lang="ts">
  import { getRuleset, CURRENT_RULESET_VERSION } from '@takes/library';
  import type { Piece } from '@takes/library';
  import { artFor, badgeFor, tierOrder } from '../lib/pieceArt.js';
  import { KING_PIECE } from '../lib/king.js';
  import PieceTile from './explore/PieceTile.svelte';
  import Inspector from './explore/Inspector.svelte';

  const ruleset = getRuleset(CURRENT_RULESET_VERSION)!;
  const pieces: Piece[] = [KING_PIECE, ...Object.values(ruleset.pieces)];

  let selected = $state<Piece | null>(null);

  const grouped = $derived.by(() => {
    const byTier = new Map<string, Piece[]>();
    for (const t of tierOrder()) byTier.set(t, []);
    for (const p of pieces) byTier.get(p.tier)?.push(p);
    return byTier;
  });

  const tierTitle: Record<string, string> = { pawn: 'Pawn', minor: 'Minor', rook: 'Rook', major: 'Major' };

  function costOf(p: Piece): number {
    return p.id === 'king' ? 0 : ruleset.costs[p.id] ?? 0;
  }

  function selectPiece(p: Piece): void {
    selected = p;
  }
</script>

<div class="page library">
  <div class="page-head">
    <div>
      <h1>Library</h1>
      <p>Every piece in {CURRENT_RULESET_VERSION}, grouped by tier. Pick one to see how it moves and attacks.</p>
    </div>
  </div>

  <div class="explore">
    <div class="stack tiers">
      {#each [...grouped] as [tier, list] (tier)}
        {#if list.length}
          <section class="stack">
            <h2 class="eyebrow">{tierTitle[tier] ?? tier}</h2>
            <div class="palette">
              {#each list as p (p.id)}
                <PieceTile
                  piece={p}
                  art={artFor(ruleset, p.id)}
                  badge={badgeFor(ruleset, p.id)}
                  cost={costOf(p)}
                  selected={selected?.id === p.id}
                  onclick={() => selectPiece(p)}
                />
              {/each}
            </div>
          </section>
        {/if}
      {/each}
    </div>

    <aside class="panel inspector-pane" class:empty={!selected}>
      {#if selected}
        <Inspector piece={selected} art={artFor(ruleset, selected.id)} cost={costOf(selected)} cellSize={44} />
      {:else}
        <p class="muted">Pick a piece to preview its moves and attacks.</p>
      {/if}
    </aside>
  </div>
</div>

<style>
  .library { max-width: var(--content-max); margin: 0 auto; }
  .explore { display: grid; grid-template-columns: 1fr minmax(300px, 380px); gap: var(--s-6); align-items: start; }
  .tiers { gap: var(--s-6); }
  .palette { display: flex; flex-wrap: wrap; gap: var(--s-3); }
  .inspector-pane { position: sticky; top: var(--s-5); padding: var(--s-5); min-height: 120px; }
  .inspector-pane.empty { display: flex; align-items: center; justify-content: center; }

  @media (max-width: 860px) {
    .explore { grid-template-columns: 1fr; }
    .inspector-pane { position: static; }
  }
</style>
