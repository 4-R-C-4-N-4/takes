<script lang="ts">
  import { getRuleset, CURRENT_RULESET_VERSION } from '@takes/library';
  import { createGame, type Game, type Move } from '@takes/engine';
  import Board from './Board.svelte';
  import { artFor } from '../lib/pieceArt.js';
  import { sandboxRuleset, restoreInfinity } from '../lib/candidates.js';
  import { OnlineGameController, type OnlineSnapshot, type Intent } from '../net/online-game.js';
  import { loadToken } from '../net/client.js';
  import { wsUrl } from '../net/url.js';
  import { onDestroy } from 'svelte';

  export let gameParam: string | undefined = undefined;

  const isOnline = gameParam?.startsWith('online-') ?? false;
  let ruleset = getRuleset(CURRENT_RULESET_VERSION)!;

  // ---------- Hotseat (local) mode ----------
  let whiteSetup = `${CURRENT_RULESET_VERSION}:RNBQKBNR/PPPPPPPP/8`;
  let blackSetup = `${CURRENT_RULESET_VERSION}:RNBQKBNR/PPPPPPPP/8`;
  if (!isOnline && gameParam === 'hotseat') {
    try {
      const raw = sessionStorage.getItem('takes.hotseat');
      if (raw) {
        const parsed = JSON.parse(raw);
        whiteSetup = parsed.white;
        blackSetup = parsed.black;
        // Candidate test drive: a sandbox ruleset carrying one unpublished catalog piece.
        if (parsed.candidate) ruleset = sandboxRuleset(ruleset, restoreInfinity([parsed.candidate])[0]!);
      }
    } catch { /* fall back to vanilla */ }
  }

  let game: Game | null = isOnline ? null : createGame(ruleset, whiteSetup, blackSetup);
  let revealed = isOnline ? false : false;
  let selectedSq: number | null = null;
  let lastMove: Move | null = null;
  let promoChoice: { from: number; to: number; targets: string[] } | null = null;
  let flipped = false;

  // ---------- Online mode ----------
  let online: OnlineSnapshot | null = null;
  let ctrl: OnlineGameController | null = null;
  let myColor: 'w' | 'b' | null = null;
  let renderTick = 0;

  function startOnline(): void {
    ctrl = new OnlineGameController({ url: wsUrl() });
    const unsub = ctrl.subscribe((s) => {
      online = s;
      myColor = s.color;
      if (s.game) { game = s.game; }
      if (s.lastMove) lastMove = s.lastMove;
      renderTick++;
      if (s.phase === 'playing' || s.phase === 'over') revealed = true;
      if (s.code && gameParam === 'online-new') {
        // Swap the temp slug for the real invite code without remounting (no hashchange fired).
        history.replaceState(null, '', `#/game/online-${s.code}`);
      }
    });
    onDestroy(unsub);

    const rest = gameParam!.slice('online-'.length);
    let intent: Intent;
    if (rest === 'new') {
      const raw = sessionStorage.getItem('takes.online.pending');
      sessionStorage.removeItem('takes.online.pending');
      const pending = raw ? JSON.parse(raw) : null;
      intent = { kind: 'create', opts: pending.opts, setup: pending.setup };
    } else {
      const code = rest;
      const token = loadToken(code);
      if (token) {
        intent = { kind: 'resume', code };
      } else {
        const raw = sessionStorage.getItem(`takes.online.pending.${code}`);
        sessionStorage.removeItem(`takes.online.pending.${code}`);
        const pending = raw ? JSON.parse(raw) : null;
        intent = pending ? { kind: 'join', code, setup: pending.setup } : { kind: 'resume', code };
      }
    }
    ctrl.start(intent);
  }

  if (isOnline) startOnline();
  onDestroy(() => ctrl?.close());

  function inviteLink(): string {
    return online?.code ? `${location.origin}${location.pathname}#/join/${online.code}` : '';
  }

  function copyInvite(): void {
    navigator.clipboard?.writeText(inviteLink()).catch(() => {});
  }

  // Debug/test helper: ?moves=e2e4,e7e5,... applies a scripted UCI sequence after reveal (hotseat only).
  function applyScriptedMoves(): void {
    if (isOnline || !game) return;
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

  const revealTimer = !isOnline ? setTimeout(() => { revealed = true; applyScriptedMoves(); }, 400) : undefined;
  onDestroy(() => clearTimeout(revealTimer));

  function pieceColorAt(sq: number): 'w' | 'b' | null {
    if (!game) return null;
    const b = game.board();
    return b[sq] ? b[sq]!.color : null;
  }

  function boardPieces(game: Game | null): Map<number, { svg: string; color: 'w' | 'b' }> {
    const map = new Map<number, { svg: string; color: 'w' | 'b' }>();
    if (!game) return map;
    const board = game.board();
    for (let sq = 0; sq < 64; sq++) {
      const bp = board[sq];
      if (bp) map.set(sq, { svg: artFor(ruleset, bp.pieceId), color: bp.color });
    }
    return map;
  }

  function legalDestsFrom(sq: number): Move[] {
    return game ? game.legalMoves().filter((m) => m.from === sq) : [];
  }

  function highlights(game: Game | null, selectedSq: number | null, lastMove: Move | null): Map<number, string> {
    const map = new Map<number, string>();
    if (!game) return map;
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
    if (promoChoice || !game) return;
    if (isOnline && game.sideToMove() !== myColor) return; // not our turn, no local preview moves
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
    if (isOnline && ctrl) {
      // Authoritative: send to server, UI updates only once move_made comes back.
      const uci = m.promo ? `${sq(m.from)}${sq(m.to)}${m.promo}` : `${sq(m.from)}${sq(m.to)}`;
      ctrl.move(uci);
      return;
    }
    game!.make(m);
    lastMove = m;
    game = game;
  }

  function sq(s: number): string { return `${'abcdefgh'[s % 8]}${Math.floor(s / 8) + 1}`; }

  function choosePromo(target: string): void {
    if (!promoChoice) return;
    const m = legalDestsFrom(promoChoice.from).find((mv) => mv.to === promoChoice!.to && mv.promo === target);
    if (m) playMove(m);
    promoChoice = null;
  }

  function resign(): void {
    if (isOnline && ctrl) { ctrl.resign(); return; }
    alert(`${game!.sideToMove() === 'w' ? 'White' : 'Black'} resigns.`);
  }

  function offerDraw(): void { ctrl?.offerDraw(); }
  function acceptDraw(): void { ctrl?.acceptDraw(); }

  $: status = game?.status();
</script>

<h1>Game</h1>

{#if isOnline && online && online.phase !== 'playing' && online.phase !== 'over'}
  <div class="waiting">
    <h2>Waiting for opponent</h2>
    {#if online.code}
      <p>Invite link: <code>{inviteLink()}</code> <button on:click={copyInvite}>Copy</button></p>
      <p>Code: <strong>{online.code}</strong></p>
    {/if}
    <p>Your color: {online.color === 'w' ? 'White' : online.color === 'b' ? 'Black' : '…'}</p>
    <p>{online.opponentReady ? 'Opponent is ready.' : 'Opponent not ready yet.'}</p>
    {#if online.setupIssues}
      <p class="issues">Setup rejected: {online.setupIssues.map((i) => i.message).join('; ')}</p>
    {/if}
    {#if online.error}<p class="issues">{online.error}</p>{/if}
  </div>
{:else if !revealed}
  <p class="reveal">Revealing setups…</p>
{:else if game}
  <div class="board-wrap">
    {#key renderTick}
      <Board ranks={8} cellSize={44} flipped={isOnline ? myColor === 'b' : flipped} pieces={boardPieces(game)} highlights={highlights(game, selectedSq, lastMove)} onSquareClick={onSquareClick} />
    {/key}
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

  {#if isOnline && online?.drawOfferBy}
    <p class="notice">
      {online.drawOfferBy === myColor ? 'You offered a draw.' : 'Opponent offered a draw.'}
      {#if online.drawOfferBy !== myColor}<button on:click={acceptDraw}>Accept draw</button>{/if}
    </p>
  {/if}

  {#if isOnline && online && !online.opponentConnected}
    <p class="notice">Opponent disconnected{online.forfeitInMs ? ` — forfeits in ${Math.ceil(online.forfeitInMs / 1000)}s` : ''}.</p>
  {/if}

  {#if status && status.result !== '*'}
    <p class="result-banner">Result: {status.result} ({status.reason ?? 'unknown'})</p>
  {:else if online?.result}
    <p class="result-banner">Result: {online.result.result} ({online.result.reason})</p>
  {/if}

  <div class="controls">
    {#if !isOnline}<button on:click={() => (flipped = !flipped)}>Flip board</button>{/if}
    <button on:click={resign}>Resign</button>
    {#if isOnline}<button on:click={offerDraw}>Offer draw</button>{:else}<button disabled title="Draw offers require the online server">Offer draw</button>{/if}
  </div>

  <p>Moves (UCI): {game.ply()}</p>
{/if}

<style>
  .reveal { font-style: italic; }
  .board-wrap { max-width: 480px; }
  .promo-picker { display: flex; gap: 6px; margin: 8px 0; }
  .result-banner { font-weight: bold; font-size: 1.2em; }
  .controls { display: flex; gap: 6px; margin: 8px 0; }
  .waiting { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
  .issues { color: #e66; }
  .notice { color: #cc8; }
</style>
