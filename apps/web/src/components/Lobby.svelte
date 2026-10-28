<script lang="ts">
  import { loadProfiles, type StoredProfile } from '../lib/profiles.js';
  import { cpuColorFor } from '../lib/sides.js';
  import { routeHref } from '../lib/router.js';
  import { isStatic } from '../lib/target.js';
  import { generateP2PCode } from '../net/p2p-session.js';
  import { BOT_LEVELS, type BotLevel } from '@takes/protocol';
  import { CURRENT_RULESET_VERSION, getRuleset, parseSetup, setupCost, type Color } from '@takes/library';
  import { createGame } from '@takes/engine';
  import Board from './Board.svelte';
  import { artFor } from '../lib/pieceArt.js';
  import type { SparringLevel } from '../lib/sparring.js';

  const profiles: StoredProfile[] = loadProfiles();
  const ruleset = getRuleset(CURRENT_RULESET_VERSION);

  function summarize(p: StoredProfile): { cost: number; valid: boolean } {
    try {
      const setup = parseSetup(p.setup);
      const cost = ruleset ? setupCost(setup, ruleset) : 0;
      return { cost, valid: true };
    } catch {
      return { cost: 0, valid: false };
    }
  }

  function previewPieces(setup: string): Map<number, { svg: string; color: 'w' | 'b' }> {
    const map = new Map<number, { svg: string; color: 'w' | 'b' }>();
    if (!ruleset) return map;
    try {
      const g = createGame(ruleset, setup, setup);
      const board = g.board();
      for (let sq = 0; sq < 24; sq++) {
        const bp = board[sq];
        if (bp) map.set(sq, { svg: artFor(ruleset, bp.pieceId), color: bp.color });
      }
    } catch { /* invalid setup: show an empty preview */ }
    return map;
  }

  /** Army chosen for local/invite/bot play — one picker shared across the modes below. */
  let armyId: string = profiles[0]?.id ?? '';

  let joinCode = '';
  let inviteColor: Color | 'random' = 'random';
  let botLevel: BotLevel = 'easy';
  let p2pColor: Color = 'w';
  let p2pJoinCode = '';

  /** In-browser sparring CPU difficulty (easy/medium/hard), independent of the server bot levels. */
  let cpuLevel: SparringLevel = 'easy';
  /** The colour the player takes against the in-browser CPU ("You play"); the CPU gets the other. */
  let playerSide: 'w' | 'b' = 'w';

  function startVsCpu(): void {
    const army = profiles.find((p) => p.id === armyId);
    if (!army) return;
    try {
      sessionStorage.setItem(
        'takes.hotseat',
        JSON.stringify({ white: army.setup, black: army.setup, cpu: cpuColorFor(playerSide), cpuLevel }),
      );
    } catch { /* ignore */ }
    location.hash = routeHref('game', 'hotseat');
  }

  function startHotseat(): void {
    const army = profiles.find((p) => p.id === armyId);
    if (!army) return;
    try {
      sessionStorage.setItem('takes.hotseat', JSON.stringify({ white: army.setup, black: army.setup, cpu: null }));
    } catch { /* ignore */ }
    location.hash = routeHref('game', 'hotseat');
  }

  function createInvite(): void {
    const army = profiles.find((p) => p.id === armyId);
    if (!army) return;
    const opts = { ruleset: CURRENT_RULESET_VERSION, ...(inviteColor === 'random' ? {} : { color: inviteColor }) };
    try {
      sessionStorage.setItem('takes.online.pending', JSON.stringify({ kind: 'create', opts, setup: army.setup }));
    } catch { /* ignore */ }
    location.hash = routeHref('game', 'online-new');
  }

  function playServerBot(): void {
    const army = profiles.find((p) => p.id === armyId);
    if (!army) return;
    try {
      sessionStorage.setItem('takes.online.pending', JSON.stringify({ kind: 'create', opts: { ruleset: CURRENT_RULESET_VERSION, bot: botLevel }, setup: army.setup }));
    } catch { /* ignore */ }
    location.hash = routeHref('game', 'online-new');
  }

  function joinByCode(): void {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    location.hash = routeHref('join', code);
  }

  // ---- P2P (static build): create a fresh invite code and jump straight to the game route;
  // Game.svelte does the actual joinTrysteroLink()+HostSession work on mount. ----
  function createP2PGame(): void {
    const army = profiles.find((p) => p.id === armyId);
    if (!army) return;
    const code = generateP2PCode();
    try {
      sessionStorage.setItem(`takes.p2p.pending.${code}`, JSON.stringify({ kind: 'host', setup: army.setup, color: p2pColor }));
    } catch { /* ignore */ }
    location.hash = routeHref('game', `p2p-${code}`);
  }

  function joinP2PByCode(): void {
    const code = p2pJoinCode.trim().toUpperCase();
    if (!code) return;
    location.hash = routeHref('join', code);
  }
</script>

<div class="page lobby-page">
  <div class="page-head stacked">
    <h1>Play</h1>
    <p>Choose your army, then pick how you want to play. <a href="./how-to-play.html" target="_blank" rel="noopener">How to play</a></p>
  </div>

  {#if profiles.length === 0}
    <p class="muted">No profiles yet. Build one in the Builder first.</p>
  {:else}
    <div class="lobby-grid">
      <section class="stack panel army-panel">
        <p class="eyebrow">Your army</p>
        <div class="field">
          <label for="army-select">Army</label>
          <select id="army-select" class="select" bind:value={armyId}>
            {#each profiles as p}<option value={p.id}>{p.name}</option>{/each}
          </select>
        </div>
        {#if profiles.find((p) => p.id === armyId)}
          {@const army = profiles.find((p) => p.id === armyId)!}
          {@const s = summarize(army)}
          <div class="army-preview">
            <Board ranks={3} cellSize={34} pieces={previewPieces(army.setup)} />
          </div>
          <div class="row">
            <span class="chip">Cost {s.cost}</span>
            <span class="chip {s.valid ? 'good' : 'bad'}">{s.valid ? 'valid' : 'needs review'}</span>
          </div>
        {/if}
      </section>

      <div class="stack modes-col">
        <section class="stack panel mode-panel">
          <h2>Play the computer</h2>
          <p class="muted">In-browser sparring CPU — instant, runs on your device.</p>
          <div class="row">
            <div class="field">
              <label for="cpu-side">You play</label>
              <select id="cpu-side" class="select" bind:value={playerSide} aria-label="Opponent">
                <option value="w">White — CPU plays Black</option>
                <option value="b">Black — CPU plays White</option>
              </select>
            </div>
            <div class="field">
              <label for="cpu-level">Difficulty</label>
              <div class="segmented" id="cpu-level">
                {#each (['easy', 'medium', 'hard'] as const) as lvl}
                  <button type="button" aria-pressed={cpuLevel === lvl} onclick={() => (cpuLevel = lvl)}>{lvl[0]!.toUpperCase()}{lvl.slice(1)}</button>
                {/each}
              </div>
            </div>
          </div>
          <button class="btn primary" onclick={startVsCpu}>Play</button>
          {#if !isStatic}
          <div class="divider"></div>
          <div class="server-bot-row">
            <p class="muted sm">Or spar against the server's Fairy-Stockfish bot:</p>
            <div class="row">
              <div class="field">
                <label for="bot-level">Server bot level</label>
                <select id="bot-level" class="select sm" bind:value={botLevel}>
                  {#each BOT_LEVELS as lvl}<option value={lvl}>{lvl}</option>{/each}
                </select>
              </div>
              <button class="btn ghost sm" onclick={playServerBot}>Play server bot</button>
            </div>
          </div>
          {/if}
        </section>

        <div class="row online-row">
          {#if isStatic}
          <section class="stack panel mode-panel compact p2p-panel">
            <h3>Play a friend online</h3>
            <p class="muted sm">Share a link; moves go directly between your browsers.</p>
            <div class="field">
              <label for="p2p-color">Your colour</label>
              <select id="p2p-color" class="select sm" bind:value={p2pColor} disabled>
                <option value="w">White</option>
              </select>
            </div>
            <button class="btn sm" onclick={createP2PGame}>Create game</button>
            <div class="divider"></div>
            <div class="row">
              <input class="input mono sm" placeholder="Invite code" bind:value={p2pJoinCode} aria-label="Invite code" />
              <button class="btn sm" onclick={joinP2PByCode}>Join</button>
            </div>
            <p class="muted xs">Online play finds your opponent through public relays; moves go directly between your browsers.</p>
          </section>
          {:else}
          <section class="stack panel mode-panel compact">
            <h3>Invite a friend</h3>
            <p class="muted sm">Share a link; they join from any device.</p>
            <div class="field">
              <label for="invite-color">Your colour</label>
              <select id="invite-color" class="select sm" bind:value={inviteColor}>
                <option value="random">Random</option>
                <option value="w">White</option>
                <option value="b">Black</option>
              </select>
            </div>
            <button class="btn sm" onclick={createInvite}>Create invite link</button>
          </section>

          <section class="stack panel mode-panel compact">
            <h3>Join with a code</h3>
            <div class="row">
              <input class="input mono sm" placeholder="Invite code" bind:value={joinCode} aria-label="Invite code" />
              <button class="btn sm" onclick={joinByCode}>Join</button>
            </div>
          </section>
          {/if}
        </div>

        <section class="stack mode-panel secondary">
          <h3>Hotseat</h3>
          <p class="muted sm">Play both sides on this device, no CPU.</p>
          <button class="btn ghost sm" onclick={startHotseat}>Hotseat (play both sides)</button>
        </section>
      </div>
    </div>
  {/if}
</div>

<style>
  .lobby-page { max-width: var(--content-max); margin: 0 auto; }
  .page-head.stacked { flex-direction: column; align-items: flex-start; justify-content: flex-start; }
  .page-head.stacked p { margin-top: var(--s-1); }

  .lobby-grid { display: grid; gap: var(--s-4); grid-template-columns: 1fr; max-width: 560px; margin: 0 auto; }

  @media (min-width: 980px) {
    .lobby-grid { grid-template-columns: 340px 1fr; max-width: none; margin: 0; align-items: start; }
  }

  .army-panel, .mode-panel { padding: var(--s-4); }
  .army-preview { display: flex; justify-content: center; padding: var(--s-2) 0; }
  .modes-col { max-width: 560px; }
  .mode-panel.secondary { background: none; border: none; box-shadow: none; padding: 0; }
  .mode-panel.compact { padding: var(--s-3); gap: var(--s-2); }
  .field label { color: var(--text-muted); font-size: var(--fs-sm); }
  .field { display: grid; gap: var(--s-1); }
  .muted.sm { font-size: var(--fs-sm); }
  .select.sm, .input.sm { min-height: 32px; font-size: var(--fs-sm); }

  .server-bot-row { opacity: 0.85; }
  .server-bot-row .field label { font-size: var(--fs-xs); }

  .online-row { align-items: stretch; }
  .online-row .mode-panel.compact { flex: 1 1 0; min-width: 220px; }
  .muted.xs { font-size: var(--fs-xs); color: var(--text-faint); }
</style>
