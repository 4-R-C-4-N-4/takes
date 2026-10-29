<script lang="ts">
  import { getRuleset, CURRENT_RULESET_VERSION } from '@takes/library';
  import { createGame, type Game, type Move } from '@takes/engine';
  import Board from './Board.svelte';
  import PieceIcon from './PieceIcon.svelte';
  import { artFor } from '../lib/pieceArt.js';
  import { sandboxRuleset, restoreInfinity } from '../lib/candidates.js';
  import { localRuleset } from '../lib/localRuleset.js';
  import { chooseMoveAtLevel, pieceValues, type SparringLevel } from '../lib/sparring.js';
  import { OnlineGameController, type OnlineSnapshot, type Intent } from '../net/online-game.js';
  import { loadToken } from '../net/client.js';
  import { wsUrl } from '../net/url.js';
  import {
    createHostSession, createGuestSession, resumeP2PSession, buildResumeSnapshot, hasStoredP2PSession,
    type P2PHandle, type P2PStatus,
  } from '../net/p2p-session.js';
  import { onDestroy } from 'svelte';
  import { routeHref } from '../lib/router.js';
  import { inspectMarks, INSPECT_KING } from '../lib/inspect.js';
  import { pieceLabel } from '../lib/pieceLabel.js';

  export let gameParam: string | undefined = undefined;

  const isServerOnline = gameParam?.startsWith('online-') ?? false;
  const isP2P = gameParam?.startsWith('p2p-') ?? false;
  const isOnline = isServerOnline || isP2P;
  let ruleset = getRuleset(CURRENT_RULESET_VERSION)!;

  // ---------- Hotseat (local) mode ----------
  /** Local sparring CPU (in-browser Takes engine search), if this local game has one. */
  let cpuColor: 'w' | 'b' | null = null;
  let cpuLevel: SparringLevel = 'easy';
  let cpuThinking = false;
  let cpuArmyName = '';
  let inspectedSq: number | null = null;
  let resultDismissed = false;
  let whiteSetup = `${CURRENT_RULESET_VERSION}:RNBQKBNR/PPPPPPPP/8`;
  let blackSetup = `${CURRENT_RULESET_VERSION}:RNBQKBNR/PPPPPPPP/8`;
  if (!isOnline && gameParam === 'hotseat') {
    try {
      const raw = sessionStorage.getItem('takes.hotseat');
      if (raw) {
        const parsed = JSON.parse(raw);
        // Armies saved before a ruleset bump still play under their own version.
        ruleset = localRuleset(parsed.white, parsed.black);
        whiteSetup = parsed.white;
        blackSetup = parsed.black;
        // Candidate test drive: a sandbox ruleset carrying one unpublished catalog piece.
        if (parsed.candidate) ruleset = sandboxRuleset(ruleset, restoreInfinity([parsed.candidate])[0]!);
        if (typeof parsed.cpuArmyName === 'string') cpuArmyName = parsed.cpuArmyName;
        if (parsed.cpu === 'w' || parsed.cpu === 'b') cpuColor = parsed.cpu;
        if (parsed.cpuLevel === 'easy' || parsed.cpuLevel === 'medium' || parsed.cpuLevel === 'hard') cpuLevel = parsed.cpuLevel;
      }
    } catch (e) {
      // Unreadable or incompatible session: fall back to a vanilla game instead of a blank screen.
      console.warn('local game fallback:', e);
      ruleset = getRuleset(CURRENT_RULESET_VERSION)!;
      whiteSetup = blackSetup = `${CURRENT_RULESET_VERSION}:RNBQKBNR/PPPPPPPP/8`;
      cpuColor = null;
    }
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
  let p2pStatus: P2PStatus | null = null;
  let p2pHandle: P2PHandle | null = null;
  let showLeaveOption = false;
  let leaveTimer: ReturnType<typeof setTimeout> | undefined;
  /** startP2P() is async, so it can't call onDestroy() directly (Svelte requires that during
   *  synchronous component init) — it stashes cleanup functions here instead, run from the
   *  single top-level onDestroy() below. */
  let p2pDisposed = false;
  const p2pCleanups: Array<() => void> = [];

  function startOnline(): void {
    ctrl = new OnlineGameController({ url: wsUrl() });
    const unsub = ctrl.subscribe((s) => {
      online = s;
      myColor = s.color;
      if (s.game) { game = s.game; }
      if (s.lastMove && game && history.length < game.ply()) { lastMove = s.lastMove; recordMove(s.lastMove, game.sideToMove() === 'w' ? 'b' : 'w'); }
      if (s.moves) history = [...s.moves];
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

  /** P2P (static build): the invite code never touches a server — the transport is a
   *  HostSession/GuestSession loopback over a Trystero WebRTC link, joined here. */
  async function startP2P(): Promise<void> {
    const code = gameParam!.slice('p2p-'.length);
    const pendingKey = `takes.p2p.pending.${code}`;
    let handle: P2PHandle | null = null;
    let intent: Intent;
    try {
      const pendingRaw = sessionStorage.getItem(pendingKey);
      if (pendingRaw) {
        sessionStorage.removeItem(pendingKey);
        const pending = JSON.parse(pendingRaw) as { kind: 'host' | 'guest'; setup: string };
        if (pending.kind === 'host') {
          handle = await createHostSession({ code, ruleset: CURRENT_RULESET_VERSION, setup: pending.setup, forfeitMs: Infinity });
          intent = { kind: 'p2p', code, color: 'w', ruleset: CURRENT_RULESET_VERSION, setup: pending.setup };
        } else {
          handle = await createGuestSession({ code, ruleset: CURRENT_RULESET_VERSION, setup: pending.setup });
          intent = { kind: 'p2p', code, color: 'b', ruleset: CURRENT_RULESET_VERSION, setup: pending.setup };
        }
      } else if (hasStoredP2PSession(code)) {
        handle = await resumeP2PSession({ code, ruleset: CURRENT_RULESET_VERSION });
        const snap = buildResumeSnapshot(code, CURRENT_RULESET_VERSION);
        if (!handle || !snap) {
          handle?.close();
          if (p2pDisposed) return;
          online = blankOnlineSnapshot('Could not resume this game in this browser.');
          return;
        }
        intent = {
          kind: 'p2p', code, color: snap.color, ruleset: CURRENT_RULESET_VERSION, setup: snap.mySetup ?? '',
          resumeSnapshot: { moves: snap.moves, mySetup: snap.mySetup, opponentReady: snap.opponentReady, game: snap.game, result: snap.result as OnlineSnapshot['result'], phase: snap.phase },
        };
      } else {
        online = blankOnlineSnapshot('This invite link is no longer valid in this browser — ask your opponent for a new one.');
        return;
      }
    } catch {
      handle?.close();
      if (p2pDisposed) return;
      online = blankOnlineSnapshot('Could not connect to the relay network. Check your connection and try again.');
      return;
    }
    if (p2pDisposed) { handle.close(); return; }
    p2pHandle = handle;
    p2pCleanups.push(() => handle.close());
    const unsubStatus = handle.onStatus((s) => {
      p2pStatus = s;
      if (s === 'peer-left') {
        clearTimeout(leaveTimer);
        leaveTimer = setTimeout(() => { showLeaveOption = true; }, 120_000);
      } else if (s === 'connected') {
        showLeaveOption = false;
        clearTimeout(leaveTimer);
      }
    });
    p2pCleanups.push(unsubStatus, () => clearTimeout(leaveTimer));

    ctrl = new OnlineGameController(handle.transport);
    const unsub = ctrl.subscribe((s) => {
      online = s;
      myColor = s.color;
      if (s.game) { game = s.game; }
      if (s.lastMove && game && history.length < game.ply()) { lastMove = s.lastMove; recordMove(s.lastMove, game.sideToMove() === 'w' ? 'b' : 'w'); }
      if (s.moves) history = [...s.moves];
      renderTick++;
      if (s.phase === 'playing' || s.phase === 'over') revealed = true;
    });
    p2pCleanups.push(unsub);
    ctrl.start(intent);
  }

  function blankOnlineSnapshot(error: string): OnlineSnapshot {
    return {
      phase: 'over', code: null, color: null, ruleset: '', bot: null, mySetup: null,
      opponentReady: false, setupIssues: null, game: null, lastMove: null, result: null,
      drawOfferBy: null, opponentConnected: true, forfeitInMs: null, error,
    };
  }

  function leaveGame(): void {
    try { sessionStorage.setItem(`takes.p2p.abandoned.${gameParam}`, '1'); } catch { /* ignore */ }
    location.hash = routeHref('lobby');
  }

  function p2pStatusMessage(status: P2PStatus | null): string | null {
    switch (status) {
      case 'connecting': return 'Connecting to relays…';
      case 'could-not-connect': return "Couldn't connect to your opponent directly — some networks block this. Try a different network or device.";
      case 'peer-left': return 'Opponent disconnected.';
      default: return null;
    }
  }

  if (isP2P) void startP2P().catch(() => {
    p2pCleanups.splice(0).reverse().forEach(fn => fn());
    if (!p2pDisposed) online = blankOnlineSnapshot('Could not initialize online play. Please reload.');
  });
  else if (isServerOnline) startOnline();
  onDestroy(() => { p2pDisposed = true; ctrl?.close(); p2pCleanups.reverse().forEach((fn) => fn()); });

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

  function highlights(game: Game | null, selectedSq: number | null, lastMove: Move | null, inspectedSq: number | null): Map<number, string> {
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
    if (inspectedSq !== null) {
      for (const [sq, mark] of inspectMarks(ruleset, game.board(), inspectedSq)) map.set(sq, mark);
      map.set(inspectedSq, 'select');
    }
    return map;
  }

  function onSquareClick(sq: number): void {
    if (promoChoice || !game) return;
    inspectedSq = null;
    const canAct = !effectiveResult && (!isOnline || game.sideToMove() === myColor)
      && (cpuColor === null || (game.sideToMove() !== cpuColor && !cpuThinking));
    const candidates = canAct && selectedSq !== null ? legalDestsFrom(selectedSq).filter(m => m.to === sq) : [];
    if (candidates.length === 0) {
      selectedSq = null;
      if (pieceColorAt(sq)) {
        if (canAct && pieceColorAt(sq) === game.sideToMove()) selectedSq = sq;
        else inspectedSq = sq;
      }
      return;
    }
    if (candidates.length > 1 && candidates[0]!.promo) {
      promoChoice = { from: candidates[0]!.from, to: sq, targets: candidates.map((m) => m.promo!) };
      selectedSq = null;
      return;
    }
    playMove(candidates[0]!);
    selectedSq = null;
  }

  function recordMove(m: Move, mover: 'w' | 'b'): void {
    inspectedSq = null;
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

  function playerLabel(color: 'w' | 'b'): string {
    if (isOnline) return myColor === color ? 'You' : 'Opponent';
    if (cpuColor === color) return `CPU · ${levelLabel[cpuLevel]}${cpuArmyName ? ` · ${cpuArmyName}` : ''}`;
    if (cpuColor !== null) return 'You';
    return '';
  }

  function capturedIcons(ids: string[]): { svg: string; id: string; title: string }[] {
    return ids.map((id) => ({ svg: artFor(ruleset, id), id, title: titleFor(id) }));
  }

  function pieceById(id: string) {
    return id === 'king' ? null : ruleset.pieces[id];
  }

  function titleFor(id: string): string {
    const p = pieceById(id);
    if (!p) return id;
    const label = pieceLabel(p);
    return label.secondary ? `${label.primary} · ${label.secondary}` : label.primary;
  }

  $: status = game?.status();
  $: effectiveResult = isOnline && online?.result ? online.result : resigned ? { result: resigned === 'w' ? '0-1' : '1-0', reason: `${resigned === 'w' ? 'White' : 'Black'} resigned` } : status && status.result !== '*' ? status : null;
  /** Visual top/bottom of the board, independent of whose rail row is listed where. */
  $: boardFlipped = isOnline ? myColor === 'b' : flipped;
  $: topColor = (boardFlipped ? 'w' : 'b') as 'w' | 'b';
  $: bottomColor = (boardFlipped ? 'b' : 'w') as 'w' | 'b';
</script>

<svelte:window onclick={(event) => {
  if (!(event.target instanceof Element) || !event.target.closest('[data-board-root], [data-testid="piece-inspector"]')) inspectedSq = null;
}} />

<div class="page game-page">
  {#if isOnline && !online}
    <p class="muted reveal">Connecting to relays…</p>
  {:else if isOnline && online && online.phase !== 'playing' && online.phase !== 'over'}
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
      {#if isP2P && p2pStatusMessage(p2pStatus)}<p class="chip {p2pStatus === 'could-not-connect' ? 'bad' : 'warn'}">{p2pStatusMessage(p2pStatus)}</p>{/if}
      {#if isP2P}<p class="muted sm">Online play finds your opponent through public relays; moves go directly between your browsers.</p>{/if}
      {#if online.error}<p class="chip bad">{online.error}</p>{/if}
    </div>
  {:else if isOnline && online?.error && !game}
    <p class="chip bad" role="alert">{online.error}</p>
  {:else if !revealed}
    <p class="muted reveal">Revealing setups…</p>
  {:else if game}
    {#if isOnline && online?.error}
      <div class="panel banner bad">
        <p class="chip bad">{online.error}</p>
        {#if online.error.includes('version')}<p class="muted sm">Both players should reload the page.</p>{/if}
      </div>
    {/if}
    {#if isP2P && p2pStatus === 'peer-left'}
      <div class="panel banner warn">
        <p class="chip warn">Opponent disconnected.</p>
        {#if showLeaveOption}<button class="btn sm ghost" onclick={leaveGame}>Leave game</button>{/if}
      </div>
    {/if}
    <div class="game-grid">
      <div class="board-col">
        <div class="player-bar top" class:tomove={game.sideToMove() === topColor && !effectiveResult}>
          <span class="dot" aria-hidden="true"></span>
          <span class="who">{playerLabel(topColor)}</span>
          <span class="eyebrow side">{topColor === 'w' ? 'White' : 'Black'}</span>
          <span class="num diff" class:neg={materialDiff(topColor) < 0} class:pos={materialDiff(topColor) > 0}>{materialDiff(topColor) > 0 ? `+${materialDiff(topColor)}` : ''}</span>
          <div class="tray" aria-label="Pieces {topColor === 'w' ? 'White' : 'Black'} has captured">
            {#each capturedIcons(captured[topColor === 'w' ? 'b' : 'w']) as p, i (i)}<span title={p.title}><PieceIcon svg={p.svg} color={topColor === 'w' ? 'b' : 'w'} size={18} /></span>{/each}
          </div>
        </div>

        <div class="board-wrap">
          {#key renderTick}
            <Board ranks={8} cellSize={90} coordinates flipped={boardFlipped} pieces={boardPieces(game)} highlights={highlights(game, selectedSq, lastMove, inspectedSq)} onSquareClick={onSquareClick} />
          {/key}
          {#if promoChoice}
            <div class="promo-popover panel" role="dialog" aria-label="Choose promotion piece">
              <p class="eyebrow">Promote to</p>
              <div class="row">
                {#each promoChoice.targets as t}
                  {@const tl = titleFor(t)}
                  {@const label = pieceLabel(pieceById(t) ?? ruleset.pieces[t]!)}
                  <button class="btn promo-btn" onclick={() => choosePromo(t)} aria-label="Promote to {tl}" title={tl}>
                    <PieceIcon svg={artFor(ruleset, t)} color={game.sideToMove()} size={44} />
                    <span class="promo-label mono">{label.primary}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <div class="player-bar bottom" class:tomove={game.sideToMove() === bottomColor && !effectiveResult}>
          <span class="dot" aria-hidden="true"></span>
          <span class="who">{playerLabel(bottomColor)}</span>
          <span class="eyebrow side">{bottomColor === 'w' ? 'White' : 'Black'}</span>
          <span class="num diff" class:neg={materialDiff(bottomColor) < 0} class:pos={materialDiff(bottomColor) > 0}>{materialDiff(bottomColor) > 0 ? `+${materialDiff(bottomColor)}` : ''}</span>
          <div class="tray" aria-label="Pieces {bottomColor === 'w' ? 'White' : 'Black'} has captured">
            {#each capturedIcons(captured[bottomColor === 'w' ? 'b' : 'w']) as p, i (i)}<span title={p.title}><PieceIcon svg={p.svg} color={bottomColor === 'w' ? 'b' : 'w'} size={18} /></span>{/each}
          </div>
        </div>

        <div class="panel moves moves-strip">
          <p class="eyebrow">Moves <span class="num">({game.ply()})</span></p>
          <ol class="movelist movelist-strip mono">
            {#each movePairs(history) as pair (pair.n)}
              <li class:current={pair.n === movePairs(history).length}><span class="num mn">{pair.n}.</span><span class="mv">{pair.w}</span><span class="mv">{pair.b ?? ''}</span></li>
            {/each}
          </ol>
        </div>

        <div class="row board-actions">
          {#if !isOnline}
            <button class="btn sm icon-btn" onclick={() => (flipped = !flipped)} aria-label="Flip board" title="Flip board">⇅</button>
          {/if}
          {#if resignConfirm}
            <span class="chip warn">Really resign?</span>
            <button class="btn sm danger" onclick={resign}>Confirm resign</button>
            <button class="btn sm ghost" onclick={() => (resignConfirm = false)}>Cancel</button>
          {:else}
            <button class="btn sm ghost danger" onclick={resign} disabled={!!effectiveResult}>Resign</button>
          {/if}
          {#if isOnline}
            <button class="btn sm ghost" onclick={offerDraw} disabled={!!effectiveResult}>Offer draw</button>
          {/if}
        </div>
      </div>

      <aside class="rail stack">
        {#if inspectedSq !== null && game.board()[inspectedSq]}
          {@const bp = game.board()[inspectedSq]!}
          {@const label = pieceLabel(bp.pieceId === 'king' ? INSPECT_KING : ruleset.pieces[bp.pieceId]!)}
          <div class="panel inspect-panel" data-testid="piece-inspector" aria-live="polite">
            <div class="row"><strong class:mono={label.primaryIsNotation}>{label.primary}</strong><button class="btn sm ghost" onclick={() => inspectedSq = null} aria-label="Clear piece inspection">Close</button></div>
            {#if label.secondary}<p class="muted">{label.secondary}</p>{/if}
            <p class="muted">● Can move · ◯ Can capture</p>
          </div>
        {/if}
        <div class="panel players">
          <div class="player" class:tomove={game.sideToMove() === 'b' && !effectiveResult}>
            <span class="dot" aria-hidden="true"></span>
            <span class="eyebrow">Black</span>
            <span class="who">{playerLabel('b')}</span>
            <span class="num diff" class:neg={materialDiff('b') < 0} class:pos={materialDiff('b') > 0}>{materialDiff('b') > 0 ? `+${materialDiff('b')}` : materialDiff('b') || ''}</span>
          </div>
          <div class="tray" aria-label="Pieces Black has captured">
            {#each capturedIcons(captured.w) as p, i (i)}<span title={p.title}><PieceIcon svg={p.svg} color="w" size={20} /></span>{/each}
          </div>
          <div class="divider"></div>
          <div class="tray" aria-label="Pieces White has captured">
            {#each capturedIcons(captured.b) as p, i (i)}<span title={p.title}><PieceIcon svg={p.svg} color="b" size={20} /></span>{/each}
          </div>
          <div class="player" class:tomove={game.sideToMove() === 'w' && !effectiveResult}>
            <span class="dot" aria-hidden="true"></span>
            <span class="eyebrow">White</span>
            <span class="who">{playerLabel('w')}</span>
            <span class="num diff" class:neg={materialDiff('w') < 0} class:pos={materialDiff('w') > 0}>{materialDiff('w') > 0 ? `+${materialDiff('w')}` : materialDiff('w') || ''}</span>
          </div>
        </div>

        <p class="status-line" data-testid="to-move">
          {#if effectiveResult}
            <span class="chip">Game over</span>
          {:else}
            <span class="chip {game.inCheck() ? 'bad' : 'accent'}">To move: {game.sideToMove() === 'w' ? 'White' : 'Black'}{game.inCheck() ? ' — in check' : ''}</span>
            <span class="status-sub"> · {isOnline ? `online: you play ${myColor === 'w' ? 'White' : 'Black'}` : cpuColor !== null ? `CPU plays ${cpuColor === 'w' ? 'White' : 'Black'}` : 'hotseat: you play both sides'}</span>
          {/if}
          {#if cpuThinking}<span class="chip warn">CPU thinking…</span>{/if}
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
            {#each movePairs(history) as pair, i (pair.n)}
              <li class:current={i === movePairs(history).length - 1}><span class="num mn">{pair.n}.</span><span class="mv">{pair.w}</span><span class="mv">{pair.b ?? ''}</span></li>
            {/each}
          </ol>
        </div>
      </aside>
    </div>

    {#if effectiveResult && !resultDismissed}
      <div class="result-overlay" role="alertdialog" aria-label="Game over">
        <div class="panel result-dialog">
          <p class="eyebrow">Game over</p>
          <h2>{effectiveResult.result}</h2>
          <p class="muted">{effectiveResult.reason ?? 'unknown'}</p>
          <div class="row">
            <button class="btn ghost" onclick={() => resultDismissed = true}>Inspect board</button>
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

  .game-grid { display: grid; grid-template-columns: max-content 320px; gap: var(--s-5); align-items: start; justify-content: center; }
  .board-col { display: grid; gap: var(--s-3); position: relative; min-width: 0; }
  .board-wrap { position: relative; width: min(100%, calc(100vh - 190px), 720px); margin: 0 auto; }

  .rail { min-width: 0; width: 320px; }
  .panel { padding: var(--s-4); }

  /* Compact bars that sit directly above/below the board; shown on phones only. */
  .player-bar {
    display: none; align-items: center; gap: var(--s-2); padding: var(--s-2) var(--s-1);
  }
  .inspect-panel { overflow-wrap: anywhere; }
  .inspect-panel .row { justify-content: space-between; }
  .player-bar { flex-wrap: wrap; }
  .player-bar .who { font-weight: 650; }
  .player-bar .eyebrow.side { color: var(--text-faint); }
  .player-bar .tray { margin-left: auto; }
  .player-bar.tomove .who { color: var(--accent); }

  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-faint); flex: none; }
  .tomove .dot { background: var(--accent); box-shadow: 0 0 0 3px color-mix(in oklch, var(--accent) 25%, transparent); }

  .players { display: grid; gap: var(--s-2); }
  .player { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); padding: var(--s-1) var(--s-2); border-radius: var(--r-2); }
  .player.tomove { background: color-mix(in oklch, var(--accent) 10%, transparent); }
  .player .eyebrow { flex: none; white-space: nowrap; }
  .player .who { font-weight: 650; flex: 1; }
  .diff { color: var(--text-faint); min-width: 2ch; text-align: right; font-weight: 650; }
  .diff.pos { color: var(--good); }
  .diff.neg { color: var(--text-faint); }
  .tray { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; min-height: 20px; }

  .status-line { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-1) var(--s-2); color: var(--text-muted); font-size: var(--fs-sm); margin: 0; }
  .status-sub { color: var(--text-faint); }

  .moves { max-height: 320px; overflow: auto; }
  .movelist { list-style: none; margin: var(--s-2) 0 0; padding: 0; display: grid; gap: 2px; font-size: var(--fs-sm); }
  .movelist li { display: grid; grid-template-columns: 2.4em 1fr 1fr; gap: var(--s-2); padding: 3px 6px; border-radius: var(--r-1); }
  .movelist li:nth-child(odd) { background: color-mix(in oklch, var(--ink-2) 50%, transparent); }
  .movelist li.current { background: color-mix(in oklch, var(--accent) 16%, transparent); outline: 1px solid color-mix(in oklch, var(--accent) 40%, transparent); }
  .mn { color: var(--text-faint); }
  .mv { color: var(--text); }

  .moves-strip { display: none; }

  .board-actions { padding-top: var(--s-1); justify-content: center; }
  .icon-btn { width: var(--tap); padding: 0; font-size: var(--fs-lg); line-height: 1; }
  .btn.danger.ghost { color: var(--bad); border-color: color-mix(in oklch, var(--bad) 45%, transparent); }
  .btn.danger.ghost:hover { background: color-mix(in oklch, var(--bad) 12%, transparent); }

  .promo-popover {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: 5; padding: var(--s-4); display: grid; gap: var(--s-2);
    width: max-content; max-width: calc(100% - 2 * var(--s-2));
  }
  .promo-popover .row { flex-wrap: wrap; justify-content: center; gap: var(--s-1); }
  .promo-btn {
    display: grid; justify-items: center; gap: 2px; min-width: 64px; min-height: 64px;
    padding: var(--s-1) var(--s-2); font-size: var(--fs-xs);
  }
  .promo-label { max-width: 8ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-muted); }

  .waiting { display: grid; gap: var(--s-3); max-width: 480px; }
  .waiting .input { max-width: 420px; }
  .banner { margin-bottom: var(--s-3); display: flex; align-items: center; gap: var(--s-2); max-width: var(--content-max); }
  .banner.bad { border-color: color-mix(in oklch, var(--bad) 45%, transparent); }

  .result-overlay {
    position: fixed; inset: 0; z-index: 30; display: grid; place-items: center;
    background: oklch(0% 0 0 / 0.55); backdrop-filter: blur(2px);
  }
  .result-dialog { padding: var(--s-5); display: grid; gap: var(--s-2); text-align: center; min-width: 280px; }

  @media (max-width: 900px) {
    .game-grid { grid-template-columns: 1fr; justify-content: stretch; }
    .board-wrap { width: 100%; max-width: 100%; margin: 0; }
    .board-col { gap: var(--s-2); }

    /* Mobile convention: opponent bar above the board, your own bar below. */
    .player-bar { display: flex; }
    .rail .players { display: none; }

    .moves-strip { display: block; }
    .rail .moves { display: none; }

    .movelist-strip { display: flex; gap: var(--s-2); overflow-x: auto; margin-top: var(--s-2); padding-bottom: 2px; -webkit-overflow-scrolling: touch; }
    .movelist-strip li { display: flex; gap: 6px; flex: none; padding: 4px 8px; }
    .movelist-strip .mv { white-space: nowrap; }

    .board-actions { padding-top: var(--s-2); justify-content: space-between; }

    .rail { width: 100%; }
    .status-line { padding: 0 var(--s-1); }
  }
</style>
