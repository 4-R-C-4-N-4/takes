<script lang="ts">
  import { onMount } from 'svelte';
  import { parseHash, routeHref, type Route } from './lib/router.js';
  import Library from './components/Library.svelte';
  // Candidates carries ~800 KB of screening data: load it only when the tab is opened.
  const loadCandidates = () => import('./components/Candidates.svelte');
  import Builder from './components/Builder.svelte';
  import Profiles from './components/Profiles.svelte';
  import Lobby from './components/Lobby.svelte';
  import Join from './components/Join.svelte';
  import Game from './components/Game.svelte';
  import { seedIfEmpty } from './lib/profiles.js';

  seedIfEmpty();
  let route: Route = parseHash(location.hash);

  onMount(() => {
    const onHash = () => (route = parseHash(location.hash));
    window.addEventListener('hashchange', onHash);
    if (!location.hash) location.hash = routeHref('library');
    return () => window.removeEventListener('hashchange', onHash);
  });
</script>

<nav>
  <a href={routeHref('library')} class:active={route.screen === 'library'}>Library</a>
  <a href={routeHref('candidates')} class:active={route.screen === 'candidates'}>Candidates</a>
  <a href={routeHref('builder')} class:active={route.screen === 'builder'}>Builder</a>
  <a href={routeHref('profiles')} class:active={route.screen === 'profiles'}>Profiles</a>
  <a href={routeHref('lobby')} class:active={route.screen === 'lobby'}>Lobby</a>
</nav>

<main>
  {#if route.screen === 'library'}
    <Library />
  {:else if route.screen === 'candidates'}
    {#await loadCandidates()}<p>Loading candidates…</p>{:then m}<m.default />{/await}
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
  nav { display: flex; gap: 4px; padding: 8px; background: #26262b; flex-wrap: wrap; }
  nav a { color: #ccc; text-decoration: none; padding: 8px 12px; border-radius: 6px; font-size: 14px; }
  nav a.active { background: #3a3a44; color: #fff; }
  main { padding: 12px; max-width: 900px; margin: 0 auto; }
</style>
