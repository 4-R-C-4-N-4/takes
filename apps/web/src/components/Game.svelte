<script lang="ts">
  import { getRuleset, CURRENT_RULESET_VERSION } from '@takes/library';
  import { createGame, type Game, type Move } from '@takes/engine';
  import Board from './Board.svelte';
  import { artFor } from '../lib/pieceArt.js';
  import { sandboxRuleset, restoreInfinity } from '../lib/candidates.js';
  import { chooseMoveAtLevel, pieceValues, type SparringLevel } from '../lib/sparring.js';
  import { OnlineGameController, type OnlineSnapshot, type Intent } from '../net/online-game.js';
  import { loadToken } from '../net/client.js';
  import { wsUrl } from '../net/url.js';
  import { onDestroy } from 'svelte';
  import { routeHref } from '../lib/router.js';

  export let gameParam: string | undefined = undefined;

  const isOnline = gameParam?.startsWith('online-') ?? false;
  let ruleset = getRuleset(CURRENT_RULESET_VERSION)!;

  // ---------- Hotseat (local) mode ----------
  /** Local sparring CPU (in-browser Takes engine search), if this local game has one. */
  let cpuColor: 'w' | 'b' | null = null;
  let cpuLevel: SparringLevel = 'easy';
  let cpuThinking = false;
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
        if (parsed.cpu === 'w' || parsed.cpu === 'b') cpuColor = parsed.cpu;
        if (parsed.cpuLevel === 'easy' || parsed.cpuLevel === 'medium' || parsed.cpuLevel === 'hard') cpuLevel = parsed.cpuLevel;
      }
    } catch { /* fall back to vanilla */ }
  }

  let game: Game | null = isOnline ? null : createGame(ruleset, whiteSetup, blackSetup);
  let revealed = isOnline ? false : false;
  let selectedSq: number | null = null;
  let lastMove: Move | null = null;
  let promoChoice: { from: number; to: number; targets: string[] } | null = null;
  let flipped = false;
  let resignConfirm = false;
  /** Running move history in UCI, for the move list panel. */
  let history: string[] = [];
  /** Material captured per color, as piece ids, for the captured-pieces tray. */
  let captured: { w: string[]; b: string[] } = { w: [], b: [] };

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
      if (s.lastMove) { lastMove = s.lastMove; recordMove(s.lastMove, game ? (game.sideToMove() === 'w' ? 'b' : 'w') : 'w'); }
      renderTick++;
      if (s.phase === 'playing' || s.phase === 'over') revealed = true;
      if (s.code && gameParam === 'online-new') {
        // Swap the temp slug for the real invite code without remounting (no hashchange fired).
        globalThis.history.replaceState(null, '', `#/game/online-${s.code}`);
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

  let copied = false;
  function copyInvite(): void {
    navigator.clipboard?.writeText(inviteLink()).catch(() => {});
    copied = true;
    setTimeout(() => (copied = false), 1400);
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
      recordMove(m, game.sideToMove() === 'w' ? 'b' : 'w');
    }
    game = game; // trigger reactivity
  }

  const revealTimer = !isOnline ? setTimeout(() => { revealed = true; applyScriptedMoves(); maybeCpuMove(); }, 400) : undefined;
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
    if (cpuColor !== null && (game.sideToMove() === cpuColor || cpuThinking)) return; // CPU's turn
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

  function recordMove(m: Move, mover: 'w' | 'b'): void {
    const uci = m.promo ? `${sq(m.from)}${sq(m.to)}${m.promo}` : `${sq(m.from)}${sq(m.to)}`;
    history = [...history, uci];
    if (m.captured) {
      const victim = mover === 'w' ? 'b' : 'w';
      captured = { ...captured, [victim]: [...captured[victim], m.captured] };
    }
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
    recordMove(m, game!.sideToMove() === 'w' ? 'b' : 'w');
    game = game;
    maybeCpuMove();
  }

  function maybeCpuMove(): void {
    if (!game || isOnline || cpuColor === null || cpuThinking) return;
    if (game.sideToMove() !== cpuColor || game.status().result !== '*') return;
    cpuThinking = true;
    // Yield first so the human's move paints before the search blocks the main thread.
    setTimeout(() => {
      const reply = game ? chooseMoveAtLevel(game, cpuLevel) : null;
      cpuThinking = false;
      if (reply) playMove(reply);
    }, 60);
  }

  function sq(s: number): string { return `${'abcdefgh'[s % 8]}${Math.floor(s / 8) + 1}`; }

  function choosePromo(target: string): void {
    if (!promoChoice) return;
    const m = legalDestsFrom(promoChoice.from).find((mv) => mv.to === promoChoice!.to && mv.promo === target);
    if (m) playMove(m);
    promoChoice = null;
  }

  function resign(): void {
    if (!resignConfirm) { resignConfirm = true; return; }
    resignConfirm = false;
    if (isOnline && ctrl) { ctrl.resign(); return; }
    resigned = game!.sideToMove();
  }

  let resigned: 'w' | 'b' | null = null;

  function offerDraw(): void { ctrl?.offerDraw(); }
  function acceptDraw(): void { ctrl?.acceptDraw(); }

  function playAgain(): void { location.hash = routeHref('lobby'); }
  function backToLobby(): void { location.hash = routeHref('lobby'); }

  function movePairs(h: string[]): Array<{ n: number; w: string; b: string | undefined }> {
    const out: Array<{ n: number; w: string; b: string | undefined }> = [];
    for (let i = 0; i < h.length; i += 2) out.push({ n: i / 2 + 1, w: h[i]!, b: h[i + 1] });
    return out;
  }

  function values(): Record<string, number> { return pieceValues(ruleset); }

  function materialDiff(color: 'w' | 'b'): number {
    const v = values();
    const mine = captured[color === 'w' ? 'b' : 'w'].reduce((s, id) => s + (v[id] ?? 0), 0);
    const theirs = captured[color].reduce((s, id) => s + (v[id] ?? 0), 0);
    return mine - theirs;
  }

  const levelLabel: Record<SparringLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

  $: status = game?.status();
  $: effectiveResult = resigned ? { result: resigned === 'w' ? '0-1' : '1-0', reason: `${resigned === 'w' ? 'White' : 'Black'} resigned` } : status && status.result !== '*' ? status : null;
</script>

<div class="page game-page">
  {#if isOnline && online && online.phase !== 'playing' && online.phase !== 'over'}
    <div class="panel waiting">
      <p class="eyebrow">Waiting for opponent</p>
      <h2>Invite sent</h2>
      {#if online.code}
        <div class="field">
          <span>Invite link</span>
          <div class="row">
            <input class="input mono" readonly value={inviteLink()} aria-label="Invite link" />
            <button class="btn sm" onclick={copyInvite}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
        </div>
        <p class="muted">Code: <strong class="mono">{online.code}</strong></p>
      {/if}
      <p class="muted">Your colour: {online.color === 'w' ? 'White' : online.color === 'b' ? 'Black' : '…'}</p>
      <p class="chip {online.opponentReady ? 'good' : 'warn'}">{online.opponentReady ? 'Opponent is ready' : 'Opponent not ready yet'}</p>
      {#if online.setupIssues}
        <p class="chip bad">Setup rejected: {online.setupIssues.map((i) => i.message).join('; ')}</p>
      {/if}
      {#if online.error}<p class="chip bad">{online.error}</p>{/if}
    </div>
  {:else if !revealed}
    <p class="muted reveal">Revealing setups…</p>
  {:else if game}
    <div class="game-grid">
      <div class="board-col">
        <div class="board-wrap">
          {#key renderTick}
            <Board ranks={8} cellSize={64} coordinates flipped={isOnline ? myColor === 'b' : flipped} pieces={boardPieces(game)} highlights={highlights(game, selectedSq, lastMove)} onSquareClick={onSquareClick} />
          {/key}
          {#if promoChoice}
            <div class="promo-popover panel" role="dialog" aria-label="Choose promotion piece">
              <p class="eyebrow">Promote to</p>
              <div class="row">
                {#each promoChoice.targets as t}
                  <button class="btn promo-btn" onclick={() => choosePromo(t)} aria-label="Promote to {t}">
                    <span class="mono">{t}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
        <div class="row board-actions">
          {#if !isOnline}<button class="btn sm" onclick={() => (flipped = !flipped)}>Flip board</button>{/if}
          {#if resignConfirm}
            <span class="chip warn">Really resign?</span>
            <button class="btn sm danger" onclick={resign}>Confirm resign</button>
            <button class="btn sm ghost" onclick={() => (resignConfirm = false)}>Cancel</button>
          {:else}
            <button class="btn sm ghost" onclick={resign} disabled={!!effectiveResult}>Resign</button>
          {/if}
          {#if isOnline}
            <button class="btn sm ghost" onclick={offerDraw} disabled={!!effectiveResult}>Offer draw</button>
          {:else}
            <button class="btn sm ghost" disabled title="Draw offers require the online server">Offer draw</button>
          {/if}
        </div>
      </div>

      <aside class="rail stack">
        <div class="panel players">
          <div class="player" class:tomove={game.sideToMove() === 'b' && !effectiveResult}>
            <span class="eyebrow">Black</span>
            <span class="who">{isOnline ? (myColor === 'b' ? 'You' : 'Opponent') : cpuColor === 'b' ? `CPU · ${levelLabel[cpuLevel]}` : 'Player'}</span>
            <span class="num diff" class:neg={materialDiff('b') < 0} class:pos={materialDiff('b') > 0}>{materialDiff('b') > 0 ? `+${materialDiff('b')}` : materialDiff('b') || ''}</span>
          </div>
          <div class="tray" aria-label="Pieces Black has captured">
            {#each captured.w as id, i (i)}<span class="tray-piece mono">{id.slice(0, 1).toUpperCase()}</span>{/each}
          </div>
          <div class="divider"></div>
          <div class="tray" aria-label="Pieces White has captured">
            {#each captured.b as id, i (i)}<span class="tray-piece mono">{id.slice(0, 1).toUpperCase()}</span>{/each}
          </div>
          <div class="player" class:tomove={game.sideToMove() === 'w' && !effectiveResult}>
            <span class="eyebrow">White</span>
            <span class="who">{isOnline ? (myColor === 'w' ? 'You' : 'Opponent') : cpuColor === 'w' ? `CPU · ${levelLabel[cpuLevel]}` : 'Player'}</span>
            <span class="num diff" class:neg={materialDiff('w') < 0} class:pos={materialDiff('w') > 0}>{materialDiff('w') > 0 ? `+${materialDiff('w')}` : materialDiff('w') || ''}</span>
          </div>
        </div>

        <p class="status-line" data-testid="to-move">
          {#if effectiveResult}
            Game over
          {:else}
            To move: {game.sideToMove() === 'w' ? 'White' : 'Black'}{game.inCheck() ? ' — in check' : ''}{cpuColor !== null ? ` · CPU plays ${cpuColor === 'w' ? 'White' : 'Black'}` : ' · hotseat: you play both sides'}
          {/if}
          {#if cpuThinking}<span class="chip accent">CPU thinking…</span>{/if}
        </p>

        {#if isOnline && online?.drawOfferBy}
          <p class="chip warn">
            {online.drawOfferBy === myColor ? 'You offered a draw.' : 'Opponent offered a draw.'}
            {#if online.drawOfferBy !== myColor}<button class="btn sm" onclick={acceptDraw}>Accept draw</button>{/if}
          </p>
        {/if}

        {#if isOnline && online && !online.opponentConnected}
          <p class="chip warn">Opponent disconnected{online.forfeitInMs ? ` — forfeits in ${Math.ceil(online.forfeitInMs / 1000)}s` : ''}.</p>
        {/if}

        <div class="panel moves">
          <p class="eyebrow">Moves <span class="num">({game.ply()})</span></p>
          <ol class="movelist mono">
            {#each movePairs(history) as pair (pair.n)}
              <li><span class="num mn">{pair.n}.</span><span class="mv">{pair.w}</span><span class="mv">{pair.b ?? ''}</span></li>
            {/each}
          </ol>
        </div>
      </aside>
    </div>

    {#if effectiveResult}
      <div class="result-overlay" role="alertdialog" aria-label="Game over">
        <div class="panel result-dialog">
          <p class="eyebrow">Game over</p>
          <h2>{effectiveResult.result}</h2>
          <p class="muted">{effectiveResult.reason ?? 'unknown'}</p>
          <div class="row">
            <button class="btn primary" onclick={playAgain}>Play again</button>
            <button class="btn ghost" onclick={backToLobby}>Back to lobby</button>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .game-page { max-width: var(--content-max); margin: 0 auto; }
  .reveal { font-style: italic; }

  .game-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: var(--s-5); align-items: start; }
  .board-col { display: grid; gap: var(--s-3); position: relative; min-width: 0; }
  .board-wrap { position: relative; width: 100%; max-width: 640px; }

  .rail { min-width: 0; }
  .panel { padding: var(--s-4); }

  .players { display: grid; gap: var(--s-2); }
  .player { display: flex; align-items: baseline; justify-content: space-between; gap: var(--s-2); padding: var(--s-1) 0; border-radius: var(--r-2); }
  .player.tomove { box-shadow: inset 3px 0 0 var(--accent); padding-left: var(--s-2); }
  .player .who { font-weight: 650; }
  .diff { color: var(--text-faint); min-width: 2ch; text-align: right; }
  .diff.pos { color: var(--good); }
  .diff.neg { color: var(--text-faint); }
  .tray { display: flex; flex-wrap: wrap; gap: 4px; min-height: 20px; }
  .tray-piece { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: var(--r-1); background: var(--ink-2); color: var(--text-muted); font-size: var(--fs-xs); }

  .status-line { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); color: var(--text-muted); font-size: var(--fs-sm); }

  .moves { max-height: 320px; overflow: auto; }
  .movelist { list-style: none; margin: var(--s-2) 0 0; padding: 0; display: grid; gap: 2px; font-size: var(--fs-sm); }
  .movelist li { display: grid; grid-template-columns: 2.4em 1fr 1fr; gap: var(--s-2); padding: 2px 4px; border-radius: var(--r-1); }
  .movelist li:nth-child(odd) { background: color-mix(in oklch, var(--ink-2) 50%, transparent); }
  .mn { color: var(--text-faint); }
  .mv { color: var(--text); }

  .board-actions { padding-top: var(--s-1); }

  .promo-popover {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: 5; padding: var(--s-4); display: grid; gap: var(--s-2);
  }
  .promo-btn { min-width: 48px; min-height: 48px; font-size: var(--fs-lg); }

  .waiting { display: grid; gap: var(--s-3); max-width: 480px; }
  .waiting .input { max-width: 420px; }

  .result-overlay {
    position: fixed; inset: 0; z-index: 30; display: grid; place-items: center;
    background: oklch(0% 0 0 / 0.55); backdrop-filter: blur(2px);
  }
  .result-dialog { padding: var(--s-5); display: grid; gap: var(--s-2); text-align: center; min-width: 280px; }

  @media (max-width: 900px) {
    .game-grid { grid-template-columns: 1fr; }
    .board-wrap { max-width: 100%; margin: 0 auto; }
  }
</style>
