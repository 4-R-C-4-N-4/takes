<script lang="ts">
  import { loadProfiles, type StoredProfile } from '../lib/profiles.js';
  import { routeHref } from '../lib/router.js';

  const profiles: StoredProfile[] = loadProfiles();
  let whiteId: string = profiles[0]?.id ?? '';
  let blackId: string = profiles[1]?.id ?? profiles[0]?.id ?? '';
  let joinCode = '';

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
    alert('Online play needs the server (apps/server), not available in this preview.');
  }

  function joinByCode(): void {
    alert(`Would join room ${joinCode} once the server is running.`);
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
    <h2>Online</h2>
    <button on:click={createInvite}>Create invite link</button>
    <div class="join-row">
      <input placeholder="Invite code" bind:value={joinCode} />
      <button on:click={joinByCode}>Join by code</button>
    </div>
    <button disabled title="Coming soon: bots need a bot flag in the protocol">Play bot (coming soon)</button>
  </section>
{/if}

<style>
  section { margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .join-row { display: flex; gap: 6px; }
</style>
