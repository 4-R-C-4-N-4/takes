<script lang="ts">
  import { getRuleset, CURRENT_RULESET_VERSION, setupCost, parseSetup } from '@takes/library';
  import { validateProfile, hasErrors } from '@takes/validator';
  import {
    loadProfiles,
    renameProfile,
    duplicateProfile,
    deleteProfile,
    profileNeedsReview,
    type StoredProfile,
  } from '../lib/profiles.js';
  import { routeHref } from '../lib/router.js';

  const ruleset = getRuleset(CURRENT_RULESET_VERSION)!;
  let profiles: StoredProfile[] = loadProfiles();

  function refresh(next: StoredProfile[]): void { profiles = next; }

  function costOf(p: StoredProfile): number | null {
    try { return setupCost(parseSetup(p.setup), ruleset); } catch { return null; }
  }

  function isValid(p: StoredProfile): boolean {
    try { return !hasErrors(validateProfile(p.setup, ruleset, { color: 'w' })); } catch { return false; }
  }

  function rename(p: StoredProfile): void {
    const name = prompt('New name', p.name);
    if (name) refresh(renameProfile(p.id, name));
  }

  function copy(p: StoredProfile): void {
    navigator.clipboard?.writeText(p.setup).catch(() => {});
  }

  let pasteText = '';
  function pasteNew(): void {
    try {
      parseSetup(pasteText); // validates it parses
    } catch (e) {
      alert(`Could not parse setup: ${(e as Error).message}`);
      return;
    }
    location.hash = routeHref('builder');
    // The builder picks up setupText via paste box there; simplest path: store as a draft profile.
    refresh([...profiles]);
  }
</script>

<h1>Profiles</h1>

<ul class="profile-list">
  {#each profiles as p (p.id)}
    <li>
      <div class="row">
        <strong>{p.name}</strong>
        <span class="cost">{costOf(p) ?? '?'} pts</span>
        <span class={isValid(p) ? 'ok' : 'bad'}>{isValid(p) ? 'valid' : 'invalid'}</span>
        {#if profileNeedsReview(p)}<span class="review">needs review</span>{/if}
      </div>
      <div class="actions">
        <a href={routeHref('builder', p.id)}>Edit</a>
        <button on:click={() => rename(p)}>Rename</button>
        <button on:click={() => refresh(duplicateProfile(p.id))}>Duplicate</button>
        <button on:click={() => copy(p)}>Copy setup string</button>
        <button on:click={() => refresh(deleteProfile(p.id))}>Delete</button>
      </div>
      <code class="setup-str">{p.setup}</code>
    </li>
  {/each}
</ul>

<div class="paste-row">
  <input placeholder="Paste a setup string to check it" bind:value={pasteText} />
  <button on:click={pasteNew}>Open in builder</button>
</div>

<style>
  .profile-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .profile-list li { background: #26262b; border-radius: 8px; padding: 8px; }
  .row { display: flex; gap: 8px; align-items: center; }
  .ok { color: #6c6; } .bad { color: #e55; } .review { color: #e9a93c; }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .setup-str { display: block; font-size: 11px; opacity: 0.7; margin-top: 4px; word-break: break-all; }
  .paste-row { display: flex; gap: 6px; margin-top: 12px; }
  .paste-row input { flex: 1; }
</style>
