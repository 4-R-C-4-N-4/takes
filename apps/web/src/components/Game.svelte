<script lang="ts">
  import { getRuleset, CURRENT_RULESET_VERSION } from '@takes/library';
  import { createGame, type Game, type Move } from '@takes/engine';
  import Board from './Board.svelte';
  import { artFor } from '../lib/pieceArt.js';
  import { squareName } from '../lib/board.js';

  export let gameParam: string | undefined = undefined;

  const ruleset = getRuleset(CURRENT_RULESET_VERSION)!;

  let whiteSetup = '2026.1:RNBQKBNR/PPPPPPPP/8';
  let blackSetup = '2026.1:RNBQKBNR/PPPPPPPP/8';
  if (gameParam === 'hotseat') {
    try {
      const raw = sessionStorage.getItem('takes.hotseat');
      if (raw) {
        const parsed = JSON.parse(raw);
        whiteSetup = parsed.white;
        blackSetup = parsed.black;
      }
    } catch { /* fall back to vanilla */ }
  }

  let game: Game = createGame(ruleset, whiteSetup, blackSetup);
  let revealed = false;
  let selectedSq: number | null = null;
  let lastMove: Move | null = null;
  let promoChoice: { from: number; to: number; targets: string[] } | null = null;
  let flipped = false;

  // Debug/test helper: ?moves=e2e4,e7e5,... applies a scripted UCI sequence after reveal.
  function applyScriptedMoves(): void {
    const qIdx = location.hash.indexOf('?');
    const params = new URLSearchParams(qIdx >= 0 ? location.hash.slice(qIdx + 1) : location.search);
    const moves = params.get('moves');
    if (!moves) return;
    for (const uci of moves.split(',').filter(Boolean)) {
      const m = game.parseUci(uci);
      if (!m) { console.warn(`scripted move rejected: ${uci}`); break; }
      game.make(m);
      lastMove = m;
    }
    game = game; // trigger reactivity
  }

  setTimeout(() => { revealed = true; applyScriptedMoves(); }, 400);

  function pieceColorAt(sq: number): 'w' | 'b' | null {
    const b = game.board();
    return b[sq] ? b[sq]!.color : null;
  }

  function boardPieces(): Map<number, { svg: string; color: 'w' | 'b' }> {
    const map = new Map<number, { svg: string; color: 'w' | 'b' }>();
    const board = game.board();
    for (let sq = 0; sq < 64; sq++) {
      const bp = board[sq];
      if (bp) map.set(sq, { svg: artFor(ruleset, bp.pieceId), color: bp.color });
    }
    return map;
  }

  function legalDestsFrom(sq: number): Move[] {
    return game.legalMoves().filter((m) => m.from === sq);
  }

  function highlights(): Map<number, string> {
    const map = new Map<number, string>();
    if (lastMove) { map.set(lastMove.from, 'lastmove'); map.set(lastMove.to, 'lastmove'); }
    if (selectedSq !== null) {
      map.set(selectedSq, 'select');
      for (const m of legalDestsFrom(selectedSq)) map.set(m.to, m.captured ? 'capture' : 'quiet');
    }
    if (game.inCheck()) {
      const board = game.board();
      for (let sq = 0; sq < 64; sq++) if (board[sq]?.pieceId === 'king' && board[sq]!.color === game.sideToMove()) map.set(sq, 'check');
    }
    return map;
  }

  function onSquareClick(sq: number): void {
    if (promoChoice) return;
    if (selectedSq === null) {
      if (pieceColorAt(sq) === game.sideToMove()) selectedSq = sq;
      return;
    }
    const candidates = legalDestsFrom(selectedSq).filter((m) => m.to === sq);
    if (candidates.length === 0) {
      selectedSq = pieceColorAt(sq) === game.sideToMove() ? sq : null;
      return;
    }
    if (candidates.length > 1 && candidates[0]!.promo) {
      promoChoice = { from: selectedSq, to: sq, targets: candidates.map((m) => m.promo!) };
      selectedSq = null;
      return;
    }
    playMove(candidates[0]!);
    selectedSq = null;
  }

  function playMove(m: Move): void {
    game.make(m);
    lastMove = m;
    game = game;
  }

  function choosePromo(target: string): void {
    if (!promoChoice) return;
    const m = legalDestsFrom(promoChoice.from).find((mv) => mv.to === promoChoice!.to && mv.promo === target);
    if (m) playMove(m);
    promoChoice = null;
  }

  function resign(): void {
    alert(`${game.sideToMove() === 'w' ? 'White' : 'Black'} resigns.`);
  }

  $: status = game.status();
  $: moveList = game.ply() ? Array.from({ length: game.ply() }, (_, i) => i) : [];
</script>

<h1>Game</h1>

{#if !revealed}
  <p class="reveal">Revealing setups…</p>
{:else}
  <div class="board-wrap">
    <Board ranks={8} cellSize={44} {flipped} pieces={boardPieces()} highlights={highlights()} onSquareClick={onSquareClick} />
  </div>

  {#if promoChoice}
    <div class="promo-picker">
      <p>Promote to:</p>
      {#each promoChoice.targets as t}
        <button on:click={() => choosePromo(t)}>{t}</button>
      {/each}
    </div>
  {/if}

  <p>To move: {game.sideToMove() === 'w' ? 'White' : 'Black'}{game.inCheck() ? ' — in check' : ''}</p>

  {#if status.result !== '*'}
    <p class="result-banner">Result: {status.result} ({status.reason ?? 'unknown'})</p>
  {/if}

  <div class="controls">
    <button on:click={() => (flipped = !flipped)}>Flip board</button>
    <button on:click={resign}>Resign</button>
    <button disabled title="Draw offers require the online server">Offer draw</button>
  </div>

  <p>Moves (UCI): {Array.from({ length: game.ply() }).length}</p>
{/if}

<style>
  .reveal { font-style: italic; }
  .board-wrap { max-width: 480px; }
  .promo-picker { display: flex; gap: 6px; margin: 8px 0; }
  .result-banner { font-weight: bold; font-size: 1.2em; }
  .controls { display: flex; gap: 6px; margin: 8px 0; }
</style>
