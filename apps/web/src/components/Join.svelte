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

<div class="page">
  <div class="page-head">
    <h1>Join game</h1>
    <p>Code: <strong class="mono">{code}</strong></p>
  </div>

  {#if profiles.length === 0}
    <p class="muted">No profiles yet. Build one in the Builder first.</p>
  {:else}
    <div class="panel join-panel stack">
      <div class="field">
        <label for="join-army">Army</label>
        <select id="join-army" class="select" bind:value={profileId}>
          {#each profiles as p}<option value={p.id}>{p.name}</option>{/each}
        </select>
      </div>
      <button class="btn primary" onclick={join}>Join with this army</button>
    </div>
  {/if}
</div>

<style>
  .join-panel { padding: var(--s-4); max-width: 420px; }
  .field { display: grid; gap: var(--s-1); }
  .field label { color: var(--text-muted); font-size: var(--fs-sm); }
</style>
