<script lang="ts">
  import { getRuleset, CURRENT_RULESET_VERSION, parseSetup, serializeSetup, setupCost, type Setup } from '@takes/library';
  import { onDestroy } from 'svelte';
  import { KING_ID } from '@takes/library';
  import { validateProfile, hasErrors, type Issue } from '@takes/validator';
  import Board from './Board.svelte';
  import PieceIcon from './PieceIcon.svelte';
  import { artFor, tierOrder, badgeFor } from '../lib/pieceArt.js';
  import { computeCastlingHints } from '../lib/castling.js';
  import { loadProfiles, addProfile, type StoredProfile } from '../lib/profiles.js';
  import { routeHref } from '../lib/router.js';
  import { idle, startDrag, moveDrag, tapSelect, consumeSelection, afterTapPlacement, cancel, type DragState, type DragSource } from '../lib/drag.js';
  import { pieceLabel, type PieceLabel } from '../lib/pieceLabel.js';
  import { KING_PIECE } from '../lib/king.js';

  let { profileId = undefined }: { profileId?: string | undefined } = $props();

  const ruleset = getRuleset(CURRENT_RULESET_VERSION)!;
  const VANILLA_SETUP = `${CURRENT_RULESET_VERSION}:RNBQKBNR/PPPPPPPP/8`;

  function emptySetup(): Setup {
    return { version: CURRENT_RULESET_VERSION, ranks: [Array(8).fill(null), Array(8).fill(null), Array(8).fill(null)] };
  }

  let setup = $state<Setup>(emptySetup());
  let drag = $state<DragState>(idle());
  let saveName = $state('');
  let hoverIssue = $state<Issue | null>(null);
  let showSetupIo = $state(false);

  $effect(() => {
    const existing = loadProfiles().find((p: StoredProfile) => p.id === profileId);
    setup = emptySetup();
    saveName = existing?.name ?? '';
    drag = idle();
    if (existing) {
      try { setup = parseSetup(existing.setup); } catch { /* keep empty */ }
    } else {
      try {
        const draft = sessionStorage.getItem('takes.builder.draft');
        sessionStorage.removeItem('takes.builder.draft');
        if (draft) setup = parseSetup(draft);
      } catch { /* keep empty */ }
    }
  });

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
    if (hoverIssue) {
      for (const sq of hoverIssue.squares) if (sq < 24) map.set(sq, hoverIssue.severity);
    }
    return map;
  });

  const selectedPaletteId = $derived(drag.mode === 'selected' && drag.source.kind === 'palette' ? drag.source.pieceId : null);
  const selectedBoardCell = $derived(drag.mode === 'selected' && drag.source.kind === 'board' ? drag.source.fromCell : null);
  const selectedPreviewSvg = $derived.by(() => {
    const id = selectedPaletteId ?? (selectedBoardCell !== null ? setup.ranks[Math.floor(selectedBoardCell / 8)]![selectedBoardCell % 8] : null);
    return id ? badgeFor(ruleset, id) : null;
  });
  const selectedPreviewLabel = $derived.by((): PieceLabel | null => {
    const id = selectedPaletteId ?? (selectedBoardCell !== null ? setup.ranks[Math.floor(selectedBoardCell / 8)]![selectedBoardCell % 8] : null);
    if (!id) return null;
    if (id === KING_ID) return pieceLabel(KING_PIECE);
    const piece = ruleset.pieces[id];
    return piece ? pieceLabel(piece) : null;
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
      drag = afterTapPlacement(source);
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

  let pendingPointer: { source: DragSource; x: number; y: number; id: number } | null = null;

  function cleanupPointer(): void {
    pendingPointer = null;
    window.removeEventListener('pointermove', onGlobalPointerMove);
    window.removeEventListener('pointerup', onGlobalPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
  }

  function onGlobalPointerMove(ev: PointerEvent): void {
    if (!pendingPointer || ev.pointerId !== pendingPointer.id) return;
    if (drag.mode !== 'dragging' && Math.hypot(ev.clientX - pendingPointer.x, ev.clientY - pendingPointer.y) >= 6) {
      drag = startDrag(pendingPointer.source, ev.clientX, ev.clientY);
    }
    if (drag.mode === 'dragging') drag = moveDrag(drag, ev.clientX, ev.clientY);
  }

  function onGlobalPointerUp(ev: PointerEvent): void {
    if (!pendingPointer || ev.pointerId !== pendingPointer.id) return;
    if (drag.mode === 'dragging') {
      const { sq, onBoard } = squareUnderPoint(ev.clientX, ev.clientY);
      applySource(drag.source, onBoard ? sq : null);
      drag = idle();
      // Consume the compatibility click following a drag, preserving ordinary taps.
      const suppress = (event: MouseEvent) => { event.preventDefault(); event.stopPropagation(); };
      window.addEventListener('click', suppress, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', suppress, true), 0);
    }
    cleanupPointer();
  }

  function onPointerCancel(): void {
    drag = idle();
    cleanupPointer();
  }

  onDestroy(cleanupPointer);

  function startPointerDrag(source: DragSource, ev: PointerEvent): void {
    if (!ev.isPrimary || ev.button !== 0) return;
    cleanupPointer();
    pendingPointer = { source, x: ev.clientX, y: ev.clientY, id: ev.pointerId };
    // Touch's implicit capture otherwise hides the drop target from the click path.
    const target = ev.target as Element;
    if (target.hasPointerCapture(ev.pointerId)) target.releasePointerCapture(ev.pointerId);
    window.addEventListener('pointermove', onGlobalPointerMove);
    window.addEventListener('pointerup', onGlobalPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
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
  const isNarrow = $derived(viewportWidth < 960);
  const cellSize = $derived.by(() => {
    const railW = isNarrow ? 0 : 320;
    const sidePad = isNarrow ? 24 : 96;
    const available = Math.min(viewportWidth - railW - sidePad, viewportHeight * 0.72, 640);
    return Math.max(isNarrow ? 44 : 56, Math.floor(available / 8));
  });

  function squareName(sq: number): string {
    return `${'abcdefgh'[sq % 8]}${Math.floor(sq / 8) + 1}`;
  }

  const castlingCaption = $derived.by(() => {
    const names = [...castlingFiles].sort((a, b) => a - b).map((f) => squareName(f));
    if (!names.length) return null;
    if (names.length === 1) return `Castles with ${names[0]}`;
    return `Castles with ${names.join(' and ')}`;
  });
</script>

<div class="page builder-page">
  <div class="page-head">
    <div>
      <h1>Builder</h1>
      <p>Place pieces on the first three ranks. Tap or drag from the palette; drag a piece off the board to remove it.</p>
    </div>
  </div>

  <div class="builder-grid">
    <div class="board-zone panel">
      <div class="board-center">
        <Board
          ranks={3}
          cellSize={cellSize}
          fileLabels={true}
          pieces={boardPieces}
          highlights={issueHighlights}
          onSquareClick={onBoardSquareClick}
          onPieceDown={onBoardPieceDown}
        />
      </div>

      <div class="budget-wrap">
        <div class="row budget-row">
          <p class="budget num" class:over={cost > ruleset.pool}>Cost: {cost} / {ruleset.pool}</p>
          {#if cost > ruleset.pool}<span class="chip bad">over budget</span>{/if}
        </div>
        <div class="budget-bar" role="meter" aria-valuenow={cost} aria-valuemin={0} aria-valuemax={ruleset.pool}>
          <div class="budget-fill" class:over={cost > ruleset.pool} style="width: {Math.min(100, (cost / ruleset.pool) * 100)}%"></div>
        </div>
      </div>

      {#if castlingCaption}
        <p class="hint muted castle-caption">
          <span class="castle-glyph" aria-hidden="true">♜</span>
          {castlingCaption}
        </p>
      {/if}

      {#if issues.length}
        <ul class="issues stack">
          {#each issues as issue}
            <li
              class={issue.severity}
              onmouseenter={() => (hoverIssue = issue)}
              onmouseleave={() => (hoverIssue = null)}
            >
              <span class="chip {issue.severity === 'error' ? 'bad' : 'warn'}">{issue.severity}</span>
              <span class="issue-msg">{issue.message}{#if issue.squares.length} — {issue.squares.filter((s) => s < 24).map(squareName).join(', ')}{/if}</span>
            </li>
          {/each}
        </ul>
      {/if}
      {#if !hasErrors(issues)}
        <p class="hint muted"><span class="chip good">Ready to save</span></p>
      {/if}

      <div class="toolbar row">
        <button class="btn sm" onclick={loadVanilla}>Load vanilla</button>
        <button class="btn sm ghost" onclick={clearBoard}>Clear board</button>
        <button class="btn sm ghost" onclick={() => (showSetupIo = !showSetupIo)} aria-expanded={showSetupIo}>
          Import / Export
        </button>
      </div>

      {#if showSetupIo}
        <div class="setup-io row">
          <input class="input mono" aria-label="Setup string" bind:value={setupTextDraft} />
          <button class="btn sm" onclick={onPasteSetup}>Load from text</button>
        </div>
      {/if}

      <div class="divider"></div>

      <div class="save-row row">
        <input class="input" placeholder="Profile name" bind:value={saveName} />
        <button class="btn primary" disabled={hasErrors(issues)} onclick={save}>Save profile</button>
      </div>
    </div>

    <aside class="palette-rail panel">
      {#if selectedPreviewSvg && selectedPreviewLabel}
        <div class="selection-preview">
          <PieceIcon svg={selectedPreviewSvg} size={40} />
          <div class="selection-text">
            <span class="eyebrow">Selected</span>
            <p class:mono={selectedPreviewLabel.primaryIsNotation}>{selectedPreviewLabel.primary}</p>
            {#if selectedPreviewLabel.secondary}<p class="nickname">{selectedPreviewLabel.secondary}</p>{/if}
          </div>
        </div>
        <div class="divider"></div>
      {/if}

      {#each tierOrder() as tier (tier)}
        <div class="tier-group">
          <span class="eyebrow">{tier}</span>
          <div class="tier-pieces">
            {#each Object.values(ruleset.pieces).filter((p) => p.tier === tier) as p (p.id)}
              {@const label = pieceLabel(p)}
              <button
                class="palette-piece"
                class:selected={selectedPaletteId === p.id}
                onclick={() => selectPalette(p.id)}
                onpointerdown={(ev) => onPalettePointerDown(p.id, ev)}
                title="{label.primary} ({ruleset.costs[p.id]} pts)"
              >
                <PieceIcon svg={artFor(ruleset, p.id)} size={28} />
                <span class="piece-label-group">
                  <span class="piece-label" class:mono={label.primaryIsNotation}>{label.primary}</span>
                  {#if label.secondary}<span class="piece-nickname">{label.secondary}</span>{/if}
                </span>
                <span class="piece-cost num">{ruleset.costs[p.id]}</span>
              </button>
            {/each}
          </div>
        </div>
      {/each}
      <div class="tier-group">
        <span class="eyebrow">king</span>
        <div class="tier-pieces">
          <button
            class="palette-piece"
            class:selected={selectedPaletteId === KING_ID}
            onclick={() => selectPalette(KING_ID)}
            onpointerdown={(ev) => onPalettePointerDown(KING_ID, ev)}
            title="King (0 pts)"
          >
            <PieceIcon svg={artFor(ruleset, 'king')} size={28} />
            <span class="piece-label">King</span>
            <span class="piece-cost num">0</span>
          </button>
        </div>
      </div>
    </aside>
  </div>
</div>

{#if drag.mode === 'dragging'}
  <div
    class="drag-ghost"
    style="left:{drag.x}px; top:{drag.y}px;"
  >
    <PieceIcon svg={artFor(ruleset, drag.source.kind === 'palette' ? drag.source.pieceId : (pieceAt(drag.source.fromCell) ?? 'king'))} size={cellSize} />
  </div>
{/if}

<style>
  .builder-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: var(--s-5); align-items: start; }
  .board-zone { padding: var(--s-5); display: grid; gap: var(--s-4); min-width: 0; }
  .board-center { display: flex; justify-content: center; min-width: 0; }

  .budget-wrap { display: grid; gap: var(--s-2); }
  .budget-row { justify-content: space-between; }
  .budget { font: 600 var(--fs-md)/1 var(--font-ui); margin: 0; }
  .budget.over { color: var(--bad); }
  .budget-bar { height: 8px; background: var(--ink-2); border-radius: var(--r-pill); overflow: hidden; }
  .budget-fill { height: 100%; background: var(--accent); border-radius: var(--r-pill); transition: width var(--t-med) var(--ease); }
  .budget-fill.over { background: var(--bad); }

  .hint { font-size: var(--fs-sm); margin: 0; }
  .castle-caption { display: flex; align-items: center; gap: var(--s-2); }
  .castle-glyph { color: var(--accent); font-size: var(--fs-md); line-height: 1; }

  .issues { list-style: none; padding: 0; margin: 0; }
  .issues li { display: flex; align-items: center; gap: var(--s-2); font-size: var(--fs-sm); padding: var(--s-1) 0; cursor: default; }
  .issue-msg { color: var(--text-muted); }
  .issues li.error .issue-msg { color: var(--text); }

  .divider { border-top: 1px solid var(--line); margin: 0; }
  .toolbar { flex-wrap: wrap; align-items: center; }
  .setup-io { flex-wrap: nowrap; }
  .setup-io input { flex: 1; min-width: 0; }
  .save-row { flex-wrap: nowrap; align-items: center; }
  .save-row input { flex: 1; min-width: 0; }

  .palette-rail { padding: var(--s-4); display: grid; gap: var(--s-4); align-content: start; position: sticky; top: 72px; max-height: calc(100vh - 96px); overflow-y: auto; }
  .selection-preview { display: flex; align-items: center; gap: var(--s-3); min-width: 0; }
  .selection-text { min-width: 0; }
  .selection-text p { margin: 2px 0 0; font: 600 var(--fs-md)/1.2 var(--font-ui); overflow-wrap: anywhere; }
  .selection-text p.mono { font-family: var(--font-mono); }
  .selection-text p.nickname { margin-top: 1px; font: 500 var(--fs-xs)/1.2 var(--font-ui); color: var(--text-muted); }

  .tier-group { display: grid; gap: var(--s-2); }
  .tier-pieces { display: grid; gap: var(--s-1); }
  .palette-piece {
    display: flex; align-items: center; gap: var(--s-2);
    width: 100%; min-height: var(--tap); padding: var(--s-1) var(--s-2);
    background: var(--ink-2); border: 1px solid var(--line); border-radius: var(--r-2);
    color: var(--text); cursor: pointer; touch-action: none;
    transition: background var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease);
  }
  .palette-piece:hover { background: var(--ink-3); }
  .palette-piece.selected { border-color: var(--accent); background: var(--accent-soft); box-shadow: 0 0 0 1px var(--accent) inset; }
  .piece-label-group { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0; }
  .piece-label { text-align: left; font: 500 var(--fs-sm)/1.2 var(--font-ui); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .piece-label.mono { font-family: var(--font-mono); font-size: var(--fs-xs); letter-spacing: 0.01em; }
  .piece-nickname { text-align: left; font-size: var(--fs-xxs, 11px); color: var(--text-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .piece-cost { font-size: var(--fs-xs); color: var(--text-faint); }

  .drag-ghost { position: fixed; pointer-events: none; transform: translate(-50%, -50%); opacity: 0.85; z-index: 50; }

  @media (max-width: 960px) {
    .builder-grid { grid-template-columns: 1fr; }
    .palette-rail { position: static; max-height: none; }
    .board-zone { padding: var(--s-3); }
  }
</style>
