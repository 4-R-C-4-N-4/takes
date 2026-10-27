<script lang="ts">
  import { getRuleset, CURRENT_RULESET_VERSION, parseSetup, serializeSetup, setupCost, type Setup } from '@takes/library';
  import { KING_ID } from '@takes/library';
  import { validateProfile, hasErrors, type Issue } from '@takes/validator';
  import Board from './Board.svelte';
  import PieceIcon from './PieceIcon.svelte';
  import { artFor, tierOrder } from '../lib/pieceArt.js';
  import { computeCastlingHints } from '../lib/castling.js';
  import { loadProfiles, addProfile, type StoredProfile } from '../lib/profiles.js';
  import { routeHref } from '../lib/router.js';

  export let profileId: string | undefined = undefined;

  const ruleset = getRuleset(CURRENT_RULESET_VERSION)!;

  function emptySetup(): Setup {
    return { version: CURRENT_RULESET_VERSION, ranks: [Array(8).fill(null), Array(8).fill(null), Array(8).fill(null)] };
  }

  let setup: Setup = emptySetup();
  let selectedPaletteId: string | null = null; // tap-to-select fallback
  let setupText = '';

  if (profileId) {
    const existing = loadProfiles().find((p: StoredProfile) => p.id === profileId);
    if (existing) {
      try { setup = parseSetup(existing.setup); } catch { /* keep empty */ }
    }
  }
  syncText();

  function syncText(): void { setupText = serializeSetup(setup); }

  function cellIndex(sq: number): [number, number] { return [Math.floor(sq / 8), sq % 8]; } // [rankIdx, file]

  function placeAt(sq: number, pieceId: string | null): void {
    const [r, f] = cellIndex(sq);
    const rank = setup.ranks[r]!;
    rank[f] = pieceId;
    setup = { ...setup, ranks: setup.ranks.map((row, i) => (i === r ? [...rank] : row)) };
    syncText();
  }

  function onBoardSquareClick(sq: number): void {
    if (selectedPaletteId) {
      placeAt(sq, selectedPaletteId);
      selectedPaletteId = null;
      return;
    }
    const [r, f] = cellIndex(sq);
    const current = setup.ranks[r]![f]!;
    if (current) placeAt(sq, null); // tap placed piece with nothing selected -> remove
  }

  function selectPalette(id: string): void {
    selectedPaletteId = selectedPaletteId === id ? null : id;
  }

  function cost(): number { return setupCost(setup, ruleset); }
  function issues(): Issue[] { return validateProfile(setupText, ruleset, { color: 'w' }); }
  function boardPieces(): Map<number, { svg: string; color: 'w' | 'b' }> {
    const map = new Map<number, { svg: string; color: 'w' | 'b' }>();
    for (let r = 0; r < 3; r++) {
      for (let f = 0; f < 8; f++) {
        const id = setup.ranks[r]![f];
        if (id) map.set(r * 8 + f, { svg: artFor(ruleset, id), color: 'w' });
      }
    }
    return map;
  }
  function issueHighlights(iss: Issue[]): Map<number, string> {
    const map = new Map<number, string>();
    for (const issue of iss) for (const sq of issue.squares) {
      if (sq < 24) map.set(sq, issue.severity); // only rank 1-3 is on this board
    }
    return map;
  }

  function castlingFiles(): Set<number> {
    const hints = computeCastlingHints(setup, ruleset);
    const files = new Set<number>();
    if (hints.kingsidePartnerFile !== null) files.add(hints.kingsidePartnerFile);
    if (hints.queensidePartnerFile !== null) files.add(hints.queensidePartnerFile);
    return files;
  }

  function onPasteSetup(): void {
    try {
      const parsed = parseSetup(setupText);
      setup = parsed;
    } catch (e) {
      alert(`Could not parse setup: ${(e as Error).message}`);
    }
  }

  let saveName = '';
  function save(): void {
    const name = saveName.trim() || `Profile ${new Date().toLocaleString()}`;
    addProfile(name, setupText);
    location.hash = routeHref('profiles');
  }
</script>

<h1>Builder</h1>

<div class="palette-wrap">
  {#each tierOrder() as tier (tier)}
    <div class="tier-row">
      <span class="tier-label">{tier}</span>
      {#each Object.values(ruleset.pieces).filter((p) => p.tier === tier) as p (p.id)}
        <button
          class="palette-piece"
          class:selected={selectedPaletteId === p.id}
          on:click={() => selectPalette(p.id)}
          title="{p.name} ({ruleset.costs[p.id]})"
        >
          <PieceIcon svg={artFor(ruleset, p.id)} size={32} />
        </button>
      {/each}
    </div>
  {/each}
  <div class="tier-row">
    <span class="tier-label">king</span>
    <button class="palette-piece" class:selected={selectedPaletteId === KING_ID} on:click={() => selectPalette(KING_ID)}>
      <PieceIcon svg={artFor(ruleset, 'king')} size={32} />
    </button>
  </div>
</div>

<p class="budget" class:over={cost() > ruleset.pool}>Cost: {cost()} / {ruleset.pool}</p>

<Board
  ranks={3}
  cellSize={48}
  pieces={boardPieces()}
  highlights={issueHighlights(issues())}
  onSquareClick={onBoardSquareClick}
/>

<p class="hint">Castling partners (rook-tier near king): files {[...castlingFiles()].join(', ') || 'none'}</p>

{#if issues().length}
  <ul class="issues">
    {#each issues() as issue}
      <li class={issue.severity}>{issue.message}</li>
    {/each}
  </ul>
{/if}

<div class="setup-io">
  <label>
    Setup string
    <input bind:value={setupText} />
  </label>
  <button on:click={onPasteSetup}>Load from text</button>
</div>

<div class="save-row">
  <input placeholder="Profile name" bind:value={saveName} />
  <button disabled={hasErrors(issues())} on:click={save}>Save profile</button>
</div>

<style>
  .palette-wrap { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
  .tier-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .tier-label { width: 50px; font-size: 12px; opacity: 0.7; text-transform: capitalize; }
  .palette-piece { background: #2d2d33; border: 1px solid #444; border-radius: 6px; padding: 2px; cursor: pointer; }
  .palette-piece.selected { border-color: #6ab0f3; box-shadow: 0 0 0 2px #6ab0f3; }
  .budget { font-weight: bold; }
  .budget.over { color: #e05; }
  .issues { list-style: none; padding: 0; }
  .issues li.error { color: #e55; }
  .issues li.warning { color: #e9a93c; }
  .setup-io, .save-row { display: flex; gap: 6px; margin-top: 8px; }
  .setup-io input, .save-row input { flex: 1; }
</style>
