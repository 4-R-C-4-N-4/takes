<script lang="ts">
  import { loadProfiles, type StoredProfile } from '../lib/profiles.js';
  import { routeHref } from '../lib/router.js';
  import { BOT_LEVELS, type BotLevel } from '@takes/protocol';
  import type { Color } from '@takes/library';

  const profiles: StoredProfile[] = loadProfiles();
  let whiteId: string = profiles[0]?.id ?? '';
  let blackId: string = profiles[1]?.id ?? profiles[0]?.id ?? '';
  let joinCode = '';
  let inviteColor: Color | 'random' = 'random';
  let inviteProfileId: string = profiles[0]?.id ?? '';
  let botLevel: BotLevel = 'easy';
  let botProfileId: string = profiles[0]?.id ?? '';

  function startHotseat(): void {
    const white = profiles.find((p) => p.id === whiteId);
    const black = profiles.find((p) => p.id === blackId);
    if (!white || !black) return;
    try {
      sessionStorage.setItem('takes.hotseat', JSON.stringify({ white: white.setup, black: black.setup }));
    } catch { /* ignore */ }
    location.hash = routeHref('game', 'hotseat');
  }

  function createInvite(): void {
    const profile = profiles.find((p) => p.id === inviteProfileId);
    if (!profile) return;
    const opts = { ruleset: '2026.1', ...(inviteColor === 'random' ? {} : { color: inviteColor }) };
    try {
      sessionStorage.setItem('takes.online.pending', JSON.stringify({ kind: 'create', opts, setup: profile.setup }));
    } catch { /* ignore */ }
    location.hash = routeHref('game', 'online-new');
  }

  function playBot(): void {
    const profile = profiles.find((p) => p.id === botProfileId);
    if (!profile) return;
    try {
      sessionStorage.setItem('takes.online.pending', JSON.stringify({ kind: 'create', opts: { ruleset: '2026.1', bot: botLevel }, setup: profile.setup }));
    } catch { /* ignore */ }
    location.hash = routeHref('game', 'online-new');
  }

  function joinByCode(): void {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    location.hash = routeHref('join', code);
  }
</script>

<h1>Lobby</h1>

{#if profiles.length === 0}
  <p>No profiles yet. Build one in the Builder first.</p>
{:else}
  <section>
    <h2>Hotseat</h2>
    <label>White <select bind:value={whiteId}>{#each profiles as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
    <label>Black <select bind:value={blackId}>{#each profiles as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
    <button on:click={startHotseat}>Start hotseat game</button>
  </section>

  <section>
    <h2>Create invite</h2>
    <label>Profile <select bind:value={inviteProfileId}>{#each profiles as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
    <label>Color
      <select bind:value={inviteColor}>
        <option value="random">Random</option>
        <option value="w">White</option>
        <option value="b">Black</option>
      </select>
    </label>
    <button on:click={createInvite}>Create invite link</button>
  </section>

  <section>
    <h2>Join by code</h2>
    <div class="join-row">
      <input placeholder="Invite code" bind:value={joinCode} />
      <button on:click={joinByCode}>Join</button>
    </div>
  </section>

  <section>
    <h2>Play bot</h2>
    <label>Profile <select bind:value={botProfileId}>{#each profiles as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
    <label>Level
      <select bind:value={botLevel}>
        {#each BOT_LEVELS as lvl}<option value={lvl}>{lvl}</option>{/each}
      </select>
    </label>
    <button on:click={playBot}>Play bot</button>
  </section>
{/if}

<style>
  section { margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .join-row { display: flex; gap: 6px; }
</style>
