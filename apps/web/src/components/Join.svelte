<script lang="ts">
  import { loadProfiles, type StoredProfile } from '../lib/profiles.js';
  import { routeHref } from '../lib/router.js';

  export let code: string | undefined = undefined;

  const profiles: StoredProfile[] = loadProfiles();
  let profileId: string = profiles[0]?.id ?? '';

  function join(): void {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile || !code) return;
    try {
      sessionStorage.setItem(`takes.online.pending.${code}`, JSON.stringify({ kind: 'join', code, setup: profile.setup }));
    } catch { /* ignore */ }
    location.hash = routeHref('game', `online-${code}`);
  }
</script>

<h1>Join game {code}</h1>

{#if profiles.length === 0}
  <p>No profiles yet. Build one in the Builder first.</p>
{:else}
  <label>Profile <select bind:value={profileId}>{#each profiles as p}<option value={p.id}>{p.name}</option>{/each}</select></label>
  <button on:click={join}>Join with this profile</button>
{/if}
