<script lang="ts">
  import { loadProfiles, type StoredProfile } from '../lib/profiles.js';
  import { routeHref } from '../lib/router.js';
  import { BOT_LEVELS, type BotLevel } from '@takes/protocol';
  import { CURRENT_RULESET_VERSION, getRuleset, parseSetup, setupCost, type Color } from '@takes/library';
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

  /** Army chosen for local/invite/bot play — one picker shared across the modes below. */
  let armyId: string = profiles[0]?.id ?? '';

  let joinCode = '';
  let inviteColor: Color | 'random' = 'random';
  let botLevel: BotLevel = 'easy';

  /** In-browser sparring CPU difficulty (easy/medium/hard), independent of the server bot levels. */
  let cpuLevel: SparringLevel = 'easy';
  /** Local game opponent: the in-browser sparring CPU (colour it plays), or empty for hotseat (both sides, human). */
  let localCpu: '' | 'w' | 'b' = 'b';

  function startVsCpu(): void {
    const army = profiles.find((p) => p.id === armyId);
    if (!army) return;
    try {
      sessionStorage.setItem(
        'takes.hotseat',
        JSON.stringify({ white: army.setup, black: army.setup, cpu: localCpu || null, cpuLevel }),
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
</script>

<div class="page">
  <div class="page-head">
    <h1>Play</h1>
    <p>Choose your army, then pick how you want to play.</p>
  </div>

  {#if profiles.length === 0}
    <p class="muted">No profiles yet. Build one in the Builder first.</p>
  {:else}
    <section class="stack panel army-panel">
      <p class="eyebrow">Your army</p>
      <div class="field">
        <label for="army-select">Army</label>
        <select id="army-select" class="select" bind:value={armyId}>
          {#each profiles as p}<option value={p.id}>{p.name}</option>{/each}
        </select>
      </div>
      {#if profiles.find((p) => p.id === armyId)}
        {@const s = summarize(profiles.find((p) => p.id === armyId)!)}
        <div class="row">
          <span class="chip">Cost {s.cost}</span>
          <span class="chip {s.valid ? 'good' : 'bad'}">{s.valid ? 'valid' : 'needs review'}</span>
        </div>
      {/if}
    </section>

    <section class="stack panel mode-panel">
      <h2>Play the computer</h2>
      <p class="muted">In-browser sparring CPU — instant, runs on your device.</p>
      <div class="row">
        <div class="field">
          <label for="cpu-side">You play</label>
          <select id="cpu-side" class="select" bind:value={localCpu} aria-label="Opponent">
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
      <button class="btn primary" onclick={startVsCpu}>Test drive vs CPU</button>
      <div class="divider"></div>
      <p class="muted">Or spar against the server's Fairy-Stockfish bot instead:</p>
      <div class="row">
        <div class="field">
          <label for="bot-level">Server bot level</label>
          <select id="bot-level" class="select" bind:value={botLevel}>
            {#each BOT_LEVELS as lvl}<option value={lvl}>{lvl}</option>{/each}
          </select>
        </div>
        <button class="btn" onclick={playServerBot}>Play server bot</button>
      </div>
    </section>

    <section class="stack panel mode-panel">
      <h2>Invite a friend</h2>
      <p class="muted">Share a link; they join from any device.</p>
      <div class="row">
        <div class="field">
          <label for="invite-color">Your colour</label>
          <select id="invite-color" class="select" bind:value={inviteColor}>
            <option value="random">Random</option>
            <option value="w">White</option>
            <option value="b">Black</option>
          </select>
        </div>
      </div>
      <button class="btn primary" onclick={createInvite}>Create invite link</button>
    </section>

    <section class="stack panel mode-panel">
      <h2>Join with a code</h2>
      <div class="row">
        <input class="input mono" placeholder="Invite code" bind:value={joinCode} aria-label="Invite code" />
        <button class="btn primary" onclick={joinByCode}>Join</button>
      </div>
    </section>

    <section class="stack mode-panel secondary">
      <h3>Hotseat</h3>
      <p class="muted">Play both sides on this device, no CPU.</p>
      <button class="btn ghost" onclick={startHotseat}>Hotseat (play both sides)</button>
    </section>
  {/if}
</div>

<style>
  .army-panel, .mode-panel { padding: var(--s-4); max-width: 560px; }
  .mode-panel.secondary { background: none; border: none; box-shadow: none; padding: 0; }
  .field label { color: var(--text-muted); font-size: var(--fs-sm); }
  .field { display: grid; gap: var(--s-1); }
</style>
