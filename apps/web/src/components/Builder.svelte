<script lang="ts">
  import { getRuleset, CURRENT_RULESET_VERSION, parseSetup, serializeSetup, setupCost, type Setup } from '@takes/library';
  import { KING_ID } from '@takes/library';
  import { validateProfile, hasErrors, type Issue } from '@takes/validator';
  import Board from './Board.svelte';
  import PieceIcon from './PieceIcon.svelte';
  import { artFor, tierOrder, badgeFor } from '../lib/pieceArt.js';
  import { computeCastlingHints } from '../lib/castling.js';
  import { loadProfiles, addProfile, type StoredProfile } from '../lib/profiles.js';
  import { routeHref } from '../lib/router.js';
  import { idle, startDrag, moveDrag, tapSelect, consumeSelection, cancel, type DragState, type DragSource } from '../lib/drag.js';

  let { profileId = undefined }: { profileId?: string | undefined } = $props();

  const ruleset = getRuleset(CURRENT_RULESET_VERSION)!;
  const VANILLA_SETUP = '2026.1:RNBQKBNR/PPPPPPPP/8';

  function emptySetup(): Setup {
    return { version: CURRENT_RULESET_VERSION, ranks: [Array(8).fill(null), Array(8).fill(null), Array(8).fill(null)] };
  }

  let setup = $state<Setup>(emptySetup());
  let drag = $state<DragState>(idle());
  let saveName = $state('');

  if (profileId) {
    const existing = loadProfiles().find((p: StoredProfile) => p.id === profileId);
    if (existing) {
      try { setup = parseSetup(existing.setup); } catch { /* keep empty */ }
    }
  }

  const setupText = $derived(serializeSetup(setup));
  const cost = $derived(setupCost(setup, ruleset));
  const issues = $derived(validateProfile(setupText, ruleset, { color: 'w' }));
  const castlingHints = $derived(computeCastlingHints(setup, ruleset));
  const castlingFiles = $derived.by(() => {
    const files = new Set<number>();
    if (castlingHints.kingsidePartnerFile !== null) files.add(castlingHints.kingsidePartnerFile);
    if (castlingHints.queensidePartnerFile !== null) files.add(castlingHints.queensidePartnerFile);
    return files;
  });

  const boardPieces = $derived.by(() => {
    const map = new Map<number, { svg: string; color: 'w' | 'b' }>();
    for (let r = 0; r < 3; r++) {
      for (let f = 0; f < 8; f++) {
        const id = setup.ranks[r]![f];
        if (id) map.set(r * 8 + f, { svg: artFor(ruleset, id), color: 'w' });
      }
    }
    return map;
  });

  const issueHighlights = $derived.by(() => {
    const map = new Map<number, string>();
    for (const issue of issues) for (const sq of issue.squares) {
      if (sq < 24) map.set(sq, issue.severity); // only rank 1-3 is on this board
    }
    // selection / drag-source feedback
    if (drag.mode !== 'idle' && drag.source.kind === 'board') map.set(drag.source.fromCell, 'select');
    if (castlingFiles.size) {
      for (const f of castlingFiles) {
        if (!map.has(f)) map.set(f, 'quiet');
        if (!map.has(f + 56)) map.set(f + 56, 'quiet');
      }
    }
    return map;
  });

  const selectedPaletteId = $derived(drag.mode === 'selected' && drag.source.kind === 'palette' ? drag.source.pieceId : null);
  const selectedBoardCell = $derived(drag.mode === 'selected' && drag.source.kind === 'board' ? drag.source.fromCell : null);
  const selectedPreviewSvg = $derived.by(() => {
    const id = selectedPaletteId ?? (selectedBoardCell !== null ? setup.ranks[Math.floor(selectedBoardCell / 8)]![selectedBoardCell % 8] : null);
    return id ? badgeFor(ruleset, id) : null;
  });

  function cellIndex(sq: number): [number, number] { return [Math.floor(sq / 8), sq % 8]; } // [rankIdx, file]

  function placeAt(sq: number, pieceId: string | null): void {
    const [r, f] = cellIndex(sq);
    const rank = setup.ranks[r]!;
    const next = [...rank];
    next[f] = pieceId;
    setup = { ...setup, ranks: setup.ranks.map((row, i) => (i === r ? next : row)) };
  }

  function pieceAt(sq: number): string | null {
    const [r, f] = cellIndex(sq);
    return setup.ranks[r]![f] ?? null;
  }

  function applySource(source: DragSource, destSq: number | null): void {
    if (source.kind === 'palette') {
      if (destSq !== null) placeAt(destSq, source.pieceId);
      return;
    }
    // board -> board move, or board -> off-board remove
    const piece = pieceAt(source.fromCell);
    placeAt(source.fromCell, null);
    if (destSq !== null && piece) placeAt(destSq, piece);
  }

  // ---------- tap-to-select fallback ----------
  function onBoardSquareClick(sq: number): void {
    if (drag.mode === 'dragging') return; // click fires after pointerup during drag; ignore
    const source = consumeSelection(drag);
    if (source) {
      applySource(source, sq);
      drag = idle();
      return;
    }
    const current = pieceAt(sq);
    if (current) drag = tapSelect({ kind: 'board', fromCell: sq });
  }

  function selectPalette(id: string): void {
    if (selectedPaletteId === id) { drag = idle(); return; }
    drag = tapSelect({ kind: 'palette', pieceId: id });
  }

  // ---------- pointer drag ----------
  function squareUnderPoint(x: number, y: number): { sq: number | null; onBoard: boolean } {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const sqEl = el?.closest('[data-sq]') as HTMLElement | null;
    const onBoard = !!el?.closest('[data-board-root]');
    const sq = sqEl ? Number(sqEl.getAttribute('data-sq')) : null;
    return { sq, onBoard };
  }

  function onGlobalPointerMove(ev: PointerEvent): void {
    if (drag.mode !== 'dragging') return;
    drag = moveDrag(drag, ev.clientX, ev.clientY);
  }

  function onGlobalPointerUp(ev: PointerEvent): void {
    if (drag.mode !== 'dragging') return;
    const { sq, onBoard } = squareUnderPoint(ev.clientX, ev.clientY);
    applySource(drag.source, onBoard ? sq : null);
    drag = idle();
    window.removeEventListener('pointermove', onGlobalPointerMove);
    window.removeEventListener('pointerup', onGlobalPointerUp);
  }

  function startPointerDrag(source: DragSource, ev: PointerEvent): void {
    ev.preventDefault();
    drag = startDrag(source, ev.clientX, ev.clientY);
    window.addEventListener('pointermove', onGlobalPointerMove);
    window.addEventListener('pointerup', onGlobalPointerUp, { once: true });
  }

  function onPalettePointerDown(id: string, ev: PointerEvent): void {
    startPointerDrag({ kind: 'palette', pieceId: id }, ev);
  }

  function onBoardPieceDown(sq: number, ev: PointerEvent): void {
    startPointerDrag({ kind: 'board', fromCell: sq }, ev);
  }

  let setupTextDraft = $state('');
  $effect(() => { setupTextDraft = setupText; });

  function onPasteSetup(): void {
    try {
      setup = parseSetup(setupTextDraft);
    } catch (e) {
      alert(`Could not parse setup: ${(e as Error).message}`);
    }
  }

  function loadVanilla(): void {
    try { setup = parseSetup(VANILLA_SETUP); } catch { /* ignore */ }
  }

  function clearBoard(): void {
    setup = emptySetup();
  }

  function save(): void {
    const name = saveName.trim() || `Profile ${new Date().toLocaleString()}`;
    addProfile(name, setupText);
    location.hash = routeHref('profiles');
  }

  // responsive board sizing
  let viewportWidth = $state(typeof window !== 'undefined' ? window.innerWidth : 1024);
  let viewportHeight = $state(typeof window !== 'undefined' ? window.innerHeight : 768);
  $effect(() => {
    const onResize = () => { viewportWidth = window.innerWidth; viewportHeight = window.innerHeight; };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });
  const cellSize = $derived(Math.floor(Math.min(viewportWidth * 0.9, viewportHeight * 0.8, 640) / 8));
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
          onclick={() => selectPalette(p.id)}
          onpointerdown={(ev) => onPalettePointerDown(p.id, ev)}
          title="{p.name} ({ruleset.costs[p.id]} pts)"
        >
          <PieceIcon svg={artFor(ruleset, p.id)} size={32} />
          <span class="piece-label">{p.name} · {ruleset.costs[p.id]}</span>
        </button>
      {/each}
    </div>
  {/each}
  <div class="tier-row">
    <span class="tier-label">king</span>
    <button
      class="palette-piece"
      class:selected={selectedPaletteId === KING_ID}
      onclick={() => selectPalette(KING_ID)}
      onpointerdown={(ev) => onPalettePointerDown(KING_ID, ev)}
      title="King (0 pts)"
    >
      <PieceIcon svg={artFor(ruleset, 'king')} size={32} />
      <span class="piece-label">King · 0</span>
    </button>
  </div>
</div>

{#if selectedPreviewSvg}
  <div class="selection-preview">
    <span>Selected:</span>
    <PieceIcon svg={selectedPreviewSvg} size={48} />
  </div>
{/if}

<div class="budget-bar-wrap">
  <p class="budget" class:over={cost > ruleset.pool}>Cost: {cost} / {ruleset.pool}</p>
  <div class="budget-bar" role="meter" aria-valuenow={cost} aria-valuemin={0} aria-valuemax={ruleset.pool}>
    <div class="budget-fill" class:over={cost > ruleset.pool} style="width: {Math.min(100, (cost / ruleset.pool) * 100)}%"></div>
  </div>
</div>

<Board
  ranks={3}
  cellSize={cellSize}
  fileLabels={true}
  pieces={boardPieces}
  highlights={issueHighlights}
  onSquareClick={onBoardSquareClick}
  onPieceDown={onBoardPieceDown}
/>

{#if drag.mode === 'dragging'}
  <div
    class="drag-ghost"
    style="left:{drag.x}px; top:{drag.y}px;"
  >
    <PieceIcon svg={artFor(ruleset, drag.source.kind === 'palette' ? drag.source.pieceId : (pieceAt(drag.source.fromCell) ?? 'king'))} size={cellSize} />
  </div>
{/if}

<p class="hint">
  Castling partners (rook-tier near king): files
  {#if castlingFiles.size}
    {[...castlingFiles].map((f) => 'abcdefgh'[f]).join(', ')}
  {:else}
    none
  {/if}
</p>

{#if issues.length}
  <ul class="issues">
    {#each issues as issue}
      <li class={issue.severity}>{issue.message}{#if issue.squares.length} — squares: {issue.squares.filter((s) => s < 24).map((s) => `${'abcdefgh'[s % 8]}${Math.floor(s / 8) + 1}`).join(', ')}{/if}</li>
    {/each}
  </ul>
{/if}

<div class="toolbar">
  <button onclick={loadVanilla}>Load vanilla</button>
  <button onclick={clearBoard}>Clear board</button>
</div>

<div class="setup-io">
  <label>
    Setup string
    <input bind:value={setupTextDraft} />
  </label>
  <button onclick={onPasteSetup}>Load from text</button>
</div>

<div class="save-row">
  <input placeholder="Profile name" bind:value={saveName} />
  <button disabled={hasErrors(issues)} onclick={save}>Save profile</button>
</div>

<style>
  .palette-wrap { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
  .tier-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .tier-label { width: 50px; font-size: 12px; opacity: 0.7; text-transform: capitalize; }
  .palette-piece {
    background: #2d2d33; border: 1px solid #444; border-radius: 6px; padding: 2px 6px; cursor: pointer;
    display: flex; align-items: center; gap: 4px; color: #eee;
  }
  .palette-piece.selected { border-color: #6ab0f3; box-shadow: 0 0 0 2px #6ab0f3; }
  .piece-label { font-size: 11px; opacity: 0.85; }
  .selection-preview { display: flex; align-items: center; gap: 6px; margin: 6px 0; font-size: 13px; opacity: 0.9; }
  .budget-bar-wrap { margin: 6px 0; }
  .budget { font-weight: bold; margin: 0 0 4px; }
  .budget.over { color: #e05; }
  .budget-bar { height: 10px; background: #333; border-radius: 5px; overflow: hidden; max-width: 320px; }
  .budget-fill { height: 100%; background: #6ab0f3; transition: width 0.15s; }
  .budget-fill.over { background: #e05; }
  .issues { list-style: none; padding: 0; }
  .issues li.error { color: #e55; }
  .issues li.warning { color: #e9a93c; }
  .toolbar { display: flex; gap: 6px; margin: 8px 0; }
  .setup-io, .save-row { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
  .setup-io input, .save-row input { flex: 1; min-width: 160px; }
  .drag-ghost { position: fixed; pointer-events: none; transform: translate(-50%, -50%); opacity: 0.85; z-index: 50; }
</style>
