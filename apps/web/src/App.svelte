<script lang="ts">
  import { onMount } from 'svelte';
  import { parseHash, routeHref, type Route } from './lib/router.js';
  import { isStatic } from './lib/target.js';
  import Library from './components/Library.svelte';
  // Candidates carries ~800 KB of screening data: load it only when the tab is opened,
  // and never in the static build (isStatic is a build-time constant, so this whole
  // dynamic import is dead code there and the Candidates chunk is dropped entirely).
  const loadCandidates = () => (isStatic ? Promise.reject(new Error('unavailable')) : import('./components/Candidates.svelte'));
  import Builder from './components/Builder.svelte';
  import Profiles from './components/Profiles.svelte';
  import Lobby from './components/Lobby.svelte';
  import Join from './components/Join.svelte';
  import Game from './components/Game.svelte';
  import { seedIfEmpty, autoUpgradeProfiles } from './lib/profiles.js';

  seedIfEmpty();
  // Saved armies still legal under a newly published ruleset move to it without any prompt.
  autoUpgradeProfiles();
  const NAV: Array<{ screen: Route['screen']; label: string; icon: string }> = [
    { screen: 'lobby', label: 'Play', icon: 'M8 5v14l11-7z' },
    { screen: 'builder', label: 'Builder', icon: 'M4 20h16M4 4h16v12H4zM4 10h16M10 4v12' },
    { screen: 'profiles', label: 'Armies', icon: 'M6 4h12v16l-6-4-6 4z' },
    { screen: 'library', label: 'Library', icon: 'M5 4h4v16H5zM10 4h4v16h-4zM15.5 4.5l3.8 1-3.9 14.6-3.8-1z' },
    // The Lab (Candidates) is a dev/research tool, not shipped in the static build.
    ...(isStatic ? [] : [{ screen: 'candidates', label: 'Lab', icon: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3M7.5 14h9' } as const]),
  ];
  let route: Route = parseHash(location.hash);

  onMount(() => {
    const onHash = () => (route = parseHash(location.hash));
    window.addEventListener('hashchange', onHash);
    if (!location.hash) location.hash = routeHref('lobby');
    return () => window.removeEventListener('hashchange', onHash);
  });
</script>

<header class="topbar">
  <a class="wordmark" href={routeHref('lobby')} aria-label="Takes — home">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M6 20l1.5-9h9L18 20M8.5 11 7 4l5 3 5-3-1.5 7" /></svg>
    <span>Takes</span>
  </a>
  <nav class="tabs" aria-label="Main">
    {#each NAV as item (item.screen)}
      <a href={routeHref(item.screen)} class:active={route.screen === item.screen || (item.screen === 'lobby' && (route.screen === 'game' || route.screen === 'join'))} aria-current={route.screen === item.screen ? 'page' : undefined}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={item.icon} /></svg>
        <span>{item.label}</span>
      </a>
    {/each}
  </nav>
</header>

<main class:wide={route.screen === 'candidates' || route.screen === 'game' || route.screen === 'builder'}>
  {#if route.screen === 'library'}
    <Library />
  {:else if route.screen === 'candidates'}
    {#await loadCandidates()}<p class="muted">Loading candidates…</p>{:then m}<m.default />{/await}
  {:else if route.screen === 'builder'}
    <Builder profileId={route.param} />
  {:else if route.screen === 'profiles'}
    <Profiles />
  {:else if route.screen === 'lobby'}
    <Lobby />
  {:else if route.screen === 'join'}
    {#key route.param}
      <Join code={route.param} />
    {/key}
  {:else if route.screen === 'game'}
    {#key route.param}
      <Game gameParam={route.param} />
    {/key}
  {/if}
</main>

<style>
  .topbar {
    position: sticky; top: 0; z-index: 20;
    display: flex; align-items: center; gap: var(--s-5);
    height: 56px; padding: 0 max(var(--s-4), calc((100vw - var(--content-max)) / 2));
    background: color-mix(in oklch, var(--ink-0) 88%, transparent);
    backdrop-filter: saturate(1.2) blur(10px);
    border-bottom: 1px solid var(--line);
  }
  .wordmark { display: inline-flex; align-items: center; gap: var(--s-2); text-decoration: none; color: var(--text); }
  .wordmark svg { width: 22px; height: 22px; fill: none; stroke: var(--accent); stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; }
  .wordmark span { font: 600 1.35rem/1 var(--font-display); letter-spacing: -0.02em; font-variation-settings: 'opsz' 72; }
  .tabs { display: flex; gap: 2px; }
  .tabs a {
    display: inline-flex; align-items: center; gap: var(--s-2);
    height: 34px; padding: 0 var(--s-3); border-radius: var(--r-2);
    color: var(--text-muted); text-decoration: none; font: 600 var(--fs-sm)/1 var(--font-ui);
    transition: color var(--t-fast) var(--ease), background var(--t-fast) var(--ease);
  }
  .tabs a:hover { color: var(--text); background: var(--ink-2); }
  .tabs a.active { color: var(--text); background: var(--ink-2); box-shadow: inset 0 -2px 0 var(--accent); }
  .tabs svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  main { width: 100%; max-width: 920px; margin: 0 auto; padding: var(--s-6) var(--s-4) var(--s-7); }
  main.wide { max-width: var(--content-max); }

  /* Phones: wordmark on top, tabs become a bottom bar. */
  @media (max-width: 720px) {
    .topbar { height: 52px; }
    .tabs {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
      justify-content: space-around; gap: 0;
      padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
      background: color-mix(in oklch, var(--ink-1) 94%, transparent);
      backdrop-filter: blur(10px); border-top: 1px solid var(--line);
    }
    .tabs a { flex-direction: column; gap: 3px; height: auto; min-width: 56px; padding: 6px 4px; font-size: 11px; }
    .tabs a.active { box-shadow: none; background: transparent; color: var(--accent-strong); }
    .tabs svg { width: 22px; height: 22px; }
    main { padding: var(--s-5) var(--s-3) calc(84px + env(safe-area-inset-bottom)); }
  }
</style>
