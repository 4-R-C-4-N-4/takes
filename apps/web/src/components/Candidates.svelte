<script lang="ts">
  // Review the scenario-screen results: browse, preview moves/attacks, test-drive, and record verdicts.
  import { getRuleset, CURRENT_RULESET_VERSION } from '@takes/library';
  import PieceIcon from './PieceIcon.svelte';
  import { pieceSvg } from '@takes/art';
  import { routeHref } from '../lib/router.js';
  import Inspector from './explore/Inspector.svelte';
  import {
    restoreInfinity, deltaVsNull, loadReviews, saveReview, exportReviews, sandboxSetup,
    type Candidate, type ScreenedData, type Verdict,
  } from '../lib/candidates.js';
  import { passesFullSymmetry } from '../lib/symmetry.js';
  import mainScreenedRaw from '../../../../docs/catalog/screened.json';

  // Optional second data source: a four-way-symmetric screen. `eager: false` means a missing
  // docs/catalog/fourway/screened.json does not break the build — the glob is just empty.
  const fourwayLoaders = import.meta.glob('../../../../docs/catalog/fourway/screened.json') as
    Record<string, () => Promise<{ default: unknown }>>;
  const fourwayLoader = Object.values(fourwayLoaders)[0];

  type Source = 'main' | 'fourway';
  let source = $state<Source>(fourwayLoader ? 'fourway' : 'main');
  let fourwayData = $state<ScreenedData | null>(null);

  $effect(() => {
    if (source === 'fourway' && fourwayLoader && !fourwayData) {
      fourwayLoader().then((m) => { fourwayData = restoreInfinityData(m.default as ScreenedData); });
    }
  });

  function restoreInfinityData(d: ScreenedData): ScreenedData {
    return { ...d, candidates: restoreInfinity(d.candidates) };
  }

  const mainData = restoreInfinityData(mainScreenedRaw as unknown as ScreenedData);

  const data = $derived(source === 'fourway' && fourwayData ? fourwayData : mainData);
  const candidates = $derived(data.candidates);
  const nullScore = $derived(data.nullScore);
  const base = getRuleset(CURRENT_RULESET_VERSION)!;

  let reviews = $state(loadReviews());
  let view = $state<'shortlist' | 'all' | 'reviewed'>('shortlist');
  let tier = $state<'any' | Candidate['tier']>('any');
  let family = $state<string>('any');
  let sortBy = $state<'strength' | 'activity' | 'forks'>('strength');
  let symmetricOnly = $state(true);
  let selected = $state<Candidate | null>(null);
  let exported = $state('');

  const families = $derived([...new Set(candidates.flatMap((c) => c.families))].sort());
  const delta = (c: Candidate) => deltaVsNull(c, nullScore);
  const fmt = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}`;
  const isSymmetric = (c: Candidate) => passesFullSymmetry(c.key, c.tier);

  const list = $derived.by(() => {
    let l = candidates.filter((c) =>
      (view === 'all' || (view === 'shortlist' ? c.shortlisted : reviews[c.key]?.verdict)) &&
      (tier === 'any' || c.tier === tier) &&
      (family === 'any' || c.families.includes(family)) &&
      (!symmetricOnly || isSymmetric(c)));
    const key = sortBy === 'strength' ? delta : sortBy === 'activity' ? (c: Candidate) => c.metrics.movesPerGame : (c: Candidate) => c.metrics.forksPerGame;
    return [...l].sort((a, b) => key(b) - key(a));
  });

  function select(c: Candidate) { selected = c; }
  function setVerdict(v: Verdict) { if (selected) reviews = saveReview(selected.key, { verdict: v }); }
  function setField(field: 'note' | 'name', value: string) { if (selected) reviews = saveReview(selected.key, { [field]: value }); }

  function selectedIndex(): number {
    if (!selected) return -1;
    return list.findIndex((c) => c.key === selected!.key);
  }
  function step(d: number): void {
    if (list.length === 0) return;
    const i = selectedIndex();
    const next = i < 0 ? 0 : Math.max(0, Math.min(list.length - 1, i + d));
    const c = list[next];
    if (c) select(c);
  }

  function onKeydown(ev: KeyboardEvent): void {
    const target = ev.target as HTMLElement;
    if (target.closest('input, textarea, select')) return;
    if (ev.key === 'j' || ev.key === 'ArrowDown') { ev.preventDefault(); step(1); }
    else if (ev.key === 'k') { ev.preventDefault(); step(-1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); step(-1); }
    else if (ev.key === 'K') setVerdict('keep');
    else if (ev.key === 'M') setVerdict('maybe');
    else if (ev.key === 'R') setVerdict('reject');
  }

  function testDrive(c: Candidate, cpu: 'b' | null) {
    const version = `${CURRENT_RULESET_VERSION}+candidate`;
    sessionStorage.setItem('takes.hotseat', JSON.stringify({
      white: sandboxSetup(version, c.tier),
      black: `${version}:RNBQKBNR/PPPPPPPP/8`,
      candidate: c,
      cpu,
    }));
    location.hash = routeHref('game', 'hotseat');
  }

  async function doExport() {
    exported = exportReviews(reviews, candidates);
    try { await navigator.clipboard.writeText(exported); } catch { /* shown below for manual copy */ }
  }
  void base;
</script>

<svelte:window onkeydown={onKeydown} />

<div class="page candidates">
  <div class="page-head">
    <div>
      <h1>Candidates</h1>
      <p class="intro">
        {candidates.length} screened pieces from the catalog. <b>Strength</b> is score minus the slot's null control
        (the replaced piece itself injected as a new piece: {Object.entries(nullScore).map(([t, s]) => `${t} ${s.toFixed(2)}`).join(', ')}).
        Roughly ±0.15 is noise at 40 games, ±0.08 at 160.
      </p>
    </div>
    <button class="btn" onclick={doExport}>Export verdicts</button>
  </div>

  <div class="row filters">
    <select class="select" bind:value={view} aria-label="View">
      <option value="shortlist">Shortlist</option>
      <option value="all">All screened</option>
      <option value="reviewed">My verdicts</option>
    </select>
    <select class="select" bind:value={tier} aria-label="Tier">
      <option value="any">Any tier</option><option value="pawn">Pawn</option><option value="minor">Minor</option><option value="rook">Rook</option><option value="major">Major</option>
    </select>
    <select class="select" bind:value={family} aria-label="Family">
      <option value="any">Any family</option>
      {#each families as f}<option value={f}>{f}</option>{/each}
    </select>
    <select class="select" bind:value={sortBy} aria-label="Sort">
      <option value="strength">Sort: strength</option><option value="activity">Sort: activity</option><option value="forks">Sort: forks</option>
    </select>
    {#if fourwayLoader}
      <select class="select" bind:value={source} aria-label="Data source">
        <option value="fourway">Four-way screen</option>
        <option value="main">Main screen</option>
      </select>
    {/if}
    <label class="symmetry-toggle">
      <input type="checkbox" bind:checked={symmetricOnly} />
      Fully symmetric
    </label>
  </div>
  {#if exported}<textarea class="textarea export mono" readonly>{exported}</textarea><p class="faint">Copied to clipboard (or copy from the box above).</p>{/if}

  <div class="layout">
    <ul class="list">
      {#each list.slice(0, 200) as c (c.key)}
        <li>
          <button class="row" class:selected={selected?.key === c.key} onclick={() => select(c)}>
            <PieceIcon svg={pieceSvg(c.piece)} size={32} />
            <span class="betza mono">{reviews[c.key]?.name ?? c.betza}</span>
            <span class="chip tier-chip">{c.tier}</span>
            <span class="delta-wrap">
              <span class="delta num" class:pos={delta(c) > 0.08} class:neg={delta(c) < -0.08}>{fmt(delta(c))}</span>
              <span class="ci-bar" style="--lo:{((c.metrics.scoreCI[0] - c.metrics.score) * 100 + 50)}%; --hi:{((c.metrics.scoreCI[1] - c.metrics.score) * 100 + 50)}%" aria-hidden="true"></span>
            </span>
            {#if reviews[c.key]?.verdict}<span class="chip verdict {reviews[c.key]?.verdict}">{reviews[c.key]?.verdict}</span>{/if}
            {#if !isSymmetric(c)}<span class="chip asymmetric-chip" title="Fails D19: not front/back symmetric">asymmetric</span>{/if}
          </button>
        </li>
      {/each}
      {#if list.length > 200}<li class="more faint">showing 200 of {list.length} — narrow the filters</li>{/if}
      {#if list.length === 0}<li class="more faint">nothing here yet</li>{/if}
    </ul>

    {#if selected}
      {@const m = selected.metrics}
      {@const review = reviews[selected.key]}
      <section class="panel detail">
        <Inspector piece={selected.piece} art={pieceSvg(selected.piece)} title={review?.name ?? selected.betza} cellSize={36}>
          {#snippet extra()}
            <p class="muted replaces">replaces <span class="mono">{selected!.replaced}</span> · <span class="mono">{selected!.betza}</span></p>

            <dl class="kv metrics">
              <dt>Strength vs null</dt>
              <dd class="num">{fmt(delta(selected!))} (score {m.score.toFixed(2)} [{m.scoreCI[0].toFixed(2)}, {m.scoreCI[1].toFixed(2)}], {m.games} games{m.excluded ? `, ${m.excluded} excluded` : ''})</dd>
              <dt>Moves / captures / checks</dt>
              <dd class="num">{m.movesPerGame.toFixed(1)} / {m.capturesPerGame.toFixed(2)} / {m.checksPerGame.toFixed(2)} per game</dd>
              <dt>Forks per game</dt>
              <dd class="num">{m.forksPerGame.toFixed(2)}</dd>
              <dt>Survival · final attack</dt>
              <dd class="num">{(m.survival * 100).toFixed(0)}% · {(m.finalAttack * 100).toFixed(0)}%</dd>
              <dt>Families</dt>
              <dd>{selected!.families.join(', ')}</dd>
              <dt>Nearest library piece</dt>
              <dd>{selected!.profile.nearestLibraryId} (distance {selected!.profile.nearestLibraryDistance.toFixed(2)})</dd>
            </dl>
            <p class="faint null-note">Null control: a freshly-injected copy of the piece it replaces, screened the same way — the strength baseline above.</p>

            <div class="row actions">
              <button class="btn primary" onclick={() => testDrive(selected!, 'b')}>Test drive vs CPU</button>
              <button class="btn" onclick={() => testDrive(selected!, null)}>Hotseat (play both sides)</button>
            </div>

            <div class="row verdict-row">
              <div class="segmented" role="group" aria-label="Verdict">
                <button aria-pressed={review?.verdict === 'keep'} onclick={() => setVerdict('keep')}>Keep</button>
                <button aria-pressed={review?.verdict === 'maybe'} onclick={() => setVerdict('maybe')}>Maybe</button>
                <button aria-pressed={review?.verdict === 'reject'} onclick={() => setVerdict('reject')}>Reject</button>
              </div>
              <span class="faint shortcuts">K / M / R · J / K or ↑ ↓ to browse</span>
            </div>

            <label class="field">
              <span>Working name</span>
              <input class="input" value={review?.name ?? ''} onchange={(e) => setField('name', (e.currentTarget as HTMLInputElement).value)} placeholder="e.g. Hydra" />
            </label>
            <label class="field">
              <span>Notes</span>
              <textarea class="textarea" value={review?.note ?? ''} onchange={(e) => setField('note', (e.currentTarget as HTMLTextAreaElement).value)}></textarea>
            </label>
          {/snippet}
        </Inspector>
      </section>
    {:else}
      <p class="muted hint">Pick a candidate to preview its moves and attacks, test-drive it, and record a verdict.</p>
    {/if}
  </div>
</div>

<style>
  .candidates { max-width: var(--content-max); margin: 0 auto; }
  .intro { max-width: 70ch; }
  .filters { margin-top: var(--s-2); }
  .filters .select { width: auto; min-width: 140px; }
  .symmetry-toggle { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-sm); color: var(--text-muted); cursor: pointer; }
  .symmetry-toggle input { accent-color: var(--accent); }
  .export { font-size: var(--fs-xs); height: 140px; }
  .layout { display: grid; grid-template-columns: minmax(260px, 360px) 1fr; gap: var(--s-5); align-items: start; min-width: 0; }
  .layout > * { min-width: 0; }
  @media (max-width: 860px) { .layout { grid-template-columns: 1fr; } .list { max-height: 44vh; } }

  .list { list-style: none; padding: 0; margin: 0; max-height: 75vh; overflow: auto; display: grid; gap: var(--s-1); }
  .list button.row {
    display: grid; grid-template-columns: 32px 1fr auto auto auto auto; gap: var(--s-2); align-items: center; width: 100%;
    background: var(--ink-1); color: var(--text); border: 1px solid var(--line); border-radius: var(--r-2);
    padding: var(--s-1) var(--s-2); cursor: pointer; text-align: left;
  }
  .list button.row:hover { background: var(--ink-2); }
  .list button.row.selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
  .betza { font-size: var(--fs-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tier-chip { text-transform: capitalize; }
  .delta-wrap { display: grid; justify-items: end; gap: 2px; min-width: 56px; }
  .delta { font-size: var(--fs-sm); }
  .delta.pos { color: var(--good); } .delta.neg { color: var(--bad); }
  .ci-bar { position: relative; width: 48px; height: 3px; background: var(--ink-3); border-radius: var(--r-pill); }
  .ci-bar::after { content: ''; position: absolute; top: 0; bottom: 0; left: var(--lo); right: calc(100% - var(--hi)); background: var(--text-faint); border-radius: var(--r-pill); }
  .verdict.keep { background: var(--good-soft); color: var(--good); }
  .verdict.maybe { background: var(--warn-soft); color: var(--warn); }
  .verdict.reject { background: var(--bad-soft); color: var(--bad); }
  .asymmetric-chip { background: var(--warn-soft); color: var(--warn); }
  .more { padding: var(--s-2); font-size: var(--fs-sm); }

  .detail { padding: var(--s-5); }
  .replaces { margin-top: calc(var(--s-1) * -1); }
  .metrics { margin-top: var(--s-3); }
  .null-note { max-width: 50ch; }
  .actions { margin-top: var(--s-3); }
  .verdict-row { align-items: center; gap: var(--s-3); margin-top: var(--s-2); }
  .shortcuts { font-family: var(--font-mono); }
  .field { margin-top: var(--s-2); max-width: 420px; }
  .hint { padding: var(--s-5); }
</style>
