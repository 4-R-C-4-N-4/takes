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
  import { artFor } from '../lib/pieceArt.js';
  import PieceIcon from './PieceIcon.svelte';

  const ruleset = getRuleset(CURRENT_RULESET_VERSION)!;
  let profiles: StoredProfile[] = $state(loadProfiles());

  function refresh(next: StoredProfile[]): void { profiles = next; }

  function costOf(p: StoredProfile): number | null {
    try { return setupCost(parseSetup(p.setup), ruleset); } catch { return null; }
  }

  function isValid(p: StoredProfile): boolean {
    try { return !hasErrors(validateProfile(p.setup, ruleset, { color: 'w' })); } catch { return false; }
  }

  function thumbPieces(p: StoredProfile): Array<{ sq: number; svg: string }> {
    try {
      const setup = parseSetup(p.setup);
      const out: Array<{ sq: number; svg: string }> = [];
      for (let r = 0; r < 3; r++) {
        for (let f = 0; f < 8; f++) {
          const id = setup.ranks[r]?.[f];
          if (id) out.push({ sq: r * 8 + f, svg: artFor(ruleset, id) });
        }
      }
      return out;
    } catch { return []; }
  }

  function rename(p: StoredProfile): void {
    const name = prompt('New name', p.name);
    if (name) refresh(renameProfile(p.id, name));
  }

  function copy(p: StoredProfile): void {
    navigator.clipboard?.writeText(p.setup).catch(() => {});
  }

  function remove(p: StoredProfile): void {
    if (confirm(`Delete "${p.name}"? This cannot be undone.`)) refresh(deleteProfile(p.id));
  }

  let pasteText = $state('');
  function pasteNew(): void {
    try {
      parseSetup(pasteText); // validates it parses
    } catch (e) {
      alert(`Could not parse setup: ${(e as Error).message}`);
      return;
    }
    try { sessionStorage.setItem('takes.builder.draft', pasteText); } catch {
      alert('Could not transfer the setup. Paste it into the builder directly.');
      return;
    }
    location.hash = routeHref('builder');
  }
</script>

<div class="page">
  <div class="page-head">
    <div>
      <h1>Armies</h1>
      <p>Setups you've built. Edit, duplicate or bring in a setup string.</p>
    </div>
    <a class="btn primary" href={routeHref('builder')}>New army</a>
  </div>

  {#if profiles.length === 0}
    <div class="panel empty">
      <p class="muted">No armies yet. Build one, or paste a setup string below.</p>
      <a class="btn primary" href={routeHref('builder')}>New army</a>
    </div>
  {:else}
    <ul class="army-list stack">
      {#each profiles as p (p.id)}
        {@const valid = isValid(p)}
        {@const needsReview = profileNeedsReview(p)}
        <li class="panel army-row">
          <svg class="thumb" viewBox="0 0 80 30" aria-hidden="true">
            {#each Array(24) as _, sq}
              {@const f = sq % 8}
              {@const r = Math.floor(sq / 8)}
              <rect x={f * 10} y={(2 - r) * 10} width="10" height="10" class={(f + r) % 2 === 0 ? 'lt' : 'dk'} />
            {/each}
            {#each thumbPieces(p) as piece (piece.sq)}
              {@const f = piece.sq % 8}
              {@const r = Math.floor(piece.sq / 8)}
              <foreignObject x={f * 10} y={(2 - r) * 10} width="10" height="10">
                <PieceIcon svg={piece.svg} size={10} />
              </foreignObject>
            {/each}
          </svg>
          <div class="army-info">
            <div class="row">
              <strong class="army-name">{p.name}</strong>
              <span class="chip accent">{costOf(p) ?? '?'} pts</span>
              <span class="chip {valid ? 'good' : 'bad'}">{valid ? 'valid' : 'invalid'}</span>
              {#if needsReview}<span class="chip warn">needs review</span>{/if}
            </div>
            <code class="mono faint setup-str">{p.setup}</code>
          </div>
          <div class="army-actions row">
            <a class="btn sm" href={routeHref('builder', p.id)}>Edit</a>
            <button class="btn sm ghost action-extra" onclick={() => refresh(duplicateProfile(p.id))}>Duplicate</button>
            <button class="btn sm ghost action-extra" onclick={() => rename(p)}>Rename</button>
            <button class="btn sm ghost action-extra" onclick={() => copy(p)}>Copy string</button>
            <button class="btn sm danger ghost action-extra" onclick={() => remove(p)}>Delete</button>
            <details class="overflow-menu">
              <summary class="btn sm ghost overflow-toggle" aria-label="More actions for {p.name}">⋯</summary>
              <div class="overflow-panel">
                <button class="menu-item" onclick={() => refresh(duplicateProfile(p.id))}>Duplicate</button>
                <button class="menu-item" onclick={() => rename(p)}>Rename</button>
                <button class="menu-item" onclick={() => copy(p)}>Copy string</button>
                <button class="menu-item danger" onclick={() => remove(p)}>Delete</button>
              </div>
            </details>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="panel stack import-panel">
    <h3>Import from string</h3>
    <div class="row">
      <input class="input mono" placeholder="Paste a setup string to check it" bind:value={pasteText} />
      <button class="btn" onclick={pasteNew}>Open in builder</button>
    </div>
  </div>
</div>

<style>
  .empty { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--s-4); padding: var(--s-5); }
  .army-list { list-style: none; padding: 0; margin: 0; }
  .army-row {
    display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: var(--s-4);
    padding: var(--s-3) var(--s-4);
  }
  .thumb { width: 80px; height: 30px; flex-shrink: 0; border-radius: var(--r-1); overflow: hidden; }
  .thumb .lt { fill: var(--sq-light); }
  .thumb .dk { fill: var(--sq-dark); }
  .army-info { display: grid; gap: 4px; min-width: 0; }
  .army-name { font: 600 var(--fs-md)/1.2 var(--font-ui); }
  .setup-str { display: block; font-size: var(--fs-xs); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .army-actions { flex-wrap: nowrap; justify-content: flex-end; position: relative; }
  .overflow-menu { display: none; position: relative; }
  .overflow-toggle { padding: 0 var(--s-2); font-weight: 700; }
  .overflow-toggle::-webkit-details-marker { display: none; }
  .overflow-panel {
    position: absolute; right: 0; top: calc(100% + 4px); z-index: 5; display: grid; min-width: 160px;
    background: var(--ink-2); border: 1px solid var(--line); border-radius: var(--r-2); box-shadow: var(--shadow-2);
    overflow: hidden;
  }
  .menu-item {
    appearance: none; background: transparent; border: 0; color: var(--text); text-align: left; cursor: pointer;
    padding: var(--s-2) var(--s-3); font: 500 var(--fs-sm)/1.2 var(--font-ui); min-height: var(--tap);
  }
  .menu-item:hover { background: var(--ink-3); }
  .menu-item.danger { color: var(--bad); }
  @media (max-width: 720px) {
    .army-row { grid-template-columns: auto 1fr; }
    .army-actions { grid-column: 1 / -1; justify-content: flex-start; }
    .action-extra { display: none; }
    .overflow-menu { display: block; }
    /* On phones the actions sit at the row's left edge, so a right-anchored panel opened off-screen. */
    .overflow-panel { left: 0; right: auto; max-width: calc(100vw - 2 * var(--s-4)); }
  }
  .import-panel { padding: var(--s-4); }
  .import-panel .row { flex-wrap: nowrap; }
  .import-panel input { flex: 1; }
</style>
