<script lang="ts">
  // Review the scenario-screen results: browse, preview moves/attacks, test-drive, and record verdicts.
  import { getRuleset, CURRENT_RULESET_VERSION } from '@takes/library';
  import Board from './Board.svelte';
  import PieceIcon from './PieceIcon.svelte';
  import { pieceSvg, badgeSvg } from '@takes/art';
  import { previewMarks, type PreviewMode } from '../lib/preview.js';
  import { routeHref } from '../lib/router.js';
  import { sqOf } from '../lib/board.js';
  import {
    restoreInfinity, deltaVsNull, loadReviews, saveReview, exportReviews, sandboxSetup,
    type Candidate, type ScreenedData, type Verdict,
  } from '../lib/candidates.js';
  import screenedRaw from '../../../../docs/catalog/screened.json';

  const data = screenedRaw as unknown as ScreenedData;
  const candidates = restoreInfinity(data.candidates);
  const nullScore = data.nullScore;
  const base = getRuleset(CURRENT_RULESET_VERSION)!;

  let reviews = $state(loadReviews());
  let view = $state<'shortlist' | 'all' | 'reviewed'>('shortlist');
  let tier = $state<'any' | Candidate['tier']>('any');
  let family = $state<string>('any');
  let sortBy = $state<'strength' | 'activity' | 'forks'>('strength');
  let selected = $state<Candidate | null>(null);
  let previewFrom = $state(sqOf(3, 3));
  let mode = $state<PreviewMode>('all');
  let exported = $state('');

  const families = [...new Set(candidates.flatMap((c) => c.families))].sort();
  const delta = (c: Candidate) => deltaVsNull(c, nullScore);
  const fmt = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}`;

  const list = $derived.by(() => {
    let l = candidates.filter((c) =>
      (view === 'all' || (view === 'shortlist' ? c.shortlisted : reviews[c.key]?.verdict)) &&
      (tier === 'any' || c.tier === tier) &&
      (family === 'any' || c.families.includes(family)));
    const key = sortBy === 'strength' ? delta : sortBy === 'activity' ? (c: Candidate) => c.metrics.movesPerGame : (c: Candidate) => c.metrics.forksPerGame;
    return [...l].sort((a, b) => key(b) - key(a));
  });

  const highlights = $derived(selected ? (previewMarks(selected.piece, previewFrom, mode) as Map<number, string>) : new Map<number, string>());
  const previewPieces = $derived(selected ? new Map([[previewFrom, { svg: pieceSvg(selected.piece), color: 'w' as const }]]) : new Map());

  function select(c: Candidate) { selected = c; previewFrom = sqOf(3, 3); }
  function setVerdict(v: Verdict) { if (selected) reviews = saveReview(selected.key, { verdict: v }); }
  function setField(field: 'note' | 'name', value: string) { if (selected) reviews = saveReview(selected.key, { [field]: value }); }

  function testDrive(c: Candidate) {
    const version = `${CURRENT_RULESET_VERSION}+candidate`;
    sessionStorage.setItem('takes.hotseat', JSON.stringify({
      white: sandboxSetup(version, c.tier),
      black: `${version}:RNBQKBNR/PPPPPPPP/8`,
      candidate: c,
    }));
    location.hash = routeHref('game', 'hotseat');
  }

  async function doExport() {
    exported = exportReviews(reviews, candidates);
    try { await navigator.clipboard.writeText(exported); } catch { /* shown below for manual copy */ }
  }
  void base;
</script>

<h1>Candidates</h1>
<p class="intro">
  {candidates.length} screened pieces from the catalog. <b>Strength</b> is score minus the slot's null control
  (the replaced piece itself injected as a new piece: {Object.entries(nullScore).map(([t, s]) => `${t} ${s.toFixed(2)}`).join(', ')}).
  Roughly ±0.15 is noise at 40 games, ±0.08 at 160.
</p>

<div class="filters">
  <select bind:value={view} aria-label="View">
    <option value="shortlist">Shortlist</option>
    <option value="all">All screened</option>
    <option value="reviewed">My verdicts</option>
  </select>
  <select bind:value={tier} aria-label="Tier">
    <option value="any">Any tier</option><option value="pawn">Pawn</option><option value="minor">Minor</option><option value="rook">Rook</option><option value="major">Major</option>
  </select>
  <select bind:value={family} aria-label="Family">
    <option value="any">Any family</option>
    {#each families as f}<option value={f}>{f}</option>{/each}
  </select>
  <select bind:value={sortBy} aria-label="Sort">
    <option value="strength">Sort: strength</option><option value="activity">Sort: activity</option><option value="forks">Sort: forks</option>
  </select>
  <button onclick={doExport}>Export verdicts</button>
</div>
{#if exported}<textarea class="export" readonly>{exported}</textarea>{/if}

<div class="layout">
  <ul class="list">
    {#each list.slice(0, 200) as c (c.key)}
      <li>
        <button class="row" class:selected={selected?.key === c.key} onclick={() => select(c)}>
          <PieceIcon svg={pieceSvg(c.piece)} size={36} />
          <span class="betza">{reviews[c.key]?.name ?? c.betza}</span>
          <span class="tier">{c.tier}</span>
          <span class="delta" class:pos={delta(c) > 0.08} class:neg={delta(c) < -0.08}>{fmt(delta(c))}</span>
          {#if reviews[c.key]?.verdict}<span class="verdict {reviews[c.key]?.verdict}">{reviews[c.key]?.verdict}</span>{/if}
        </button>
      </li>
    {/each}
    {#if list.length > 200}<li class="more">showing 200 of {list.length} — narrow the filters</li>{/if}
    {#if list.length === 0}<li class="more">nothing here yet</li>{/if}
  </ul>

  {#if selected}
    {@const m = selected.metrics}
    <section class="detail">
      <h2>{reviews[selected.key]?.name ?? selected.betza} <small>{selected.tier} · replaces {selected.replaced}</small></h2>
      <div class="art">
        <PieceIcon svg={pieceSvg(selected.piece)} size={72} />
        <div class="badge">{@html badgeSvg(selected.piece)}</div>
      </div>
      <div class="modes" role="group" aria-label="Preview">
        <button class:active={mode === 'all'} onclick={() => (mode = 'all')}>Moves + attacks</button>
        <button class:active={mode === 'moves'} onclick={() => (mode = 'moves')}>Moves</button>
        <button class:active={mode === 'captures'} onclick={() => (mode = 'captures')}>Attacks</button>
      </div>
      <Board ranks={8} cellSize={36} pieces={previewPieces} {highlights} onSquareClick={(sq) => (previewFrom = sq)} />
      <p class="legend"><span class="key quiet"></span> move <span class="key capture"></span> capture <span class="key both"></span> either</p>

      <table>
        <tbody>
          <tr><th>Strength vs null</th><td>{fmt(delta(selected))} (score {m.score.toFixed(2)} [{m.scoreCI[0].toFixed(2)}, {m.scoreCI[1].toFixed(2)}], {m.games} games{m.excluded ? `, ${m.excluded} excluded` : ''})</td></tr>
          <tr><th>Moves / captures / checks per game</th><td>{m.movesPerGame.toFixed(1)} / {m.capturesPerGame.toFixed(2)} / {m.checksPerGame.toFixed(2)}</td></tr>
          <tr><th>Forks per game</th><td>{m.forksPerGame.toFixed(2)}</td></tr>
          <tr><th>Survival · final attack</th><td>{(m.survival * 100).toFixed(0)}% · {(m.finalAttack * 100).toFixed(0)}%</td></tr>
          <tr><th>Families</th><td>{selected.families.join(', ')}</td></tr>
          <tr><th>Nearest library piece</th><td>{selected.profile.nearestLibraryId} (distance {selected.profile.nearestLibraryDistance.toFixed(2)})</td></tr>
          <tr><th>Betza</th><td><code>{selected.betza}</code></td></tr>
        </tbody>
      </table>

      <div class="actions">
        <button onclick={() => testDrive(selected!)}>Test drive (hotseat)</button>
        <button class="keep" class:on={reviews[selected.key]?.verdict === 'keep'} onclick={() => setVerdict('keep')}>Keep</button>
        <button class="maybe" class:on={reviews[selected.key]?.verdict === 'maybe'} onclick={() => setVerdict('maybe')}>Maybe</button>
        <button class="reject" class:on={reviews[selected.key]?.verdict === 'reject'} onclick={() => setVerdict('reject')}>Reject</button>
      </div>
      <label>Working name <input value={reviews[selected.key]?.name ?? ''} onchange={(e) => setField('name', (e.currentTarget as HTMLInputElement).value)} placeholder="e.g. Hydra" /></label>
      <label>Notes <textarea value={reviews[selected.key]?.note ?? ''} onchange={(e) => setField('note', (e.currentTarget as HTMLTextAreaElement).value)}></textarea></label>
    </section>
  {:else}
    <p class="hint">Pick a candidate to preview its moves and attacks, test-drive it, and record a verdict.</p>
  {/if}
</div>

<style>
  .intro { font-size: 14px; opacity: 0.85; }
  .filters { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
  .layout { display: grid; grid-template-columns: minmax(240px, 340px) 1fr; gap: 16px; align-items: start; }
  @media (max-width: 760px) { .layout { grid-template-columns: 1fr; } .list { max-height: 40vh; } }
  .list { list-style: none; padding: 0; margin: 0; max-height: 75vh; overflow: auto; }
  .row { display: grid; grid-template-columns: 40px 1fr auto auto auto; gap: 6px; align-items: center; width: 100%;
    background: #2d2d33; color: #eee; border: 1px solid #444; border-radius: 6px; padding: 2px 6px; margin-bottom: 4px; cursor: pointer; text-align: left; }
  .row.selected { border-color: #6ab0f3; }
  .betza { font-family: monospace; font-size: 13px; overflow: hidden; text-overflow: ellipsis; }
  .tier { font-size: 11px; opacity: 0.7; }
  .delta { font-variant-numeric: tabular-nums; }
  .delta.pos { color: #7ddc7d; } .delta.neg { color: #f08080; }
  .verdict { font-size: 11px; border-radius: 4px; padding: 0 4px; }
  .verdict.keep { background: #2e6b2e; } .verdict.maybe { background: #7a6a22; } .verdict.reject { background: #6b2e2e; }
  .more, .hint { opacity: 0.7; font-size: 13px; }
  .detail h2 small { font-size: 13px; opacity: 0.7; font-weight: normal; }
  .art { display: flex; gap: 12px; align-items: center; }
  .badge { width: 120px; height: 120px; --piece-fill: #e9e3d3; --piece-stroke: #1b1b1b; background: #e9e3d3; border-radius: 6px; }
  .badge :global(svg) { width: 100%; height: 100%; }
  .modes { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0; }
  .modes button, .actions button, .filters button { background: #2d2d33; color: #eee; border: 1px solid #444; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
  .modes button.active { border-color: #6ab0f3; box-shadow: 0 0 0 2px #6ab0f3; }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0; }
  .actions .on.keep { background: #2e6b2e; } .actions .on.maybe { background: #7a6a22; } .actions .on.reject { background: #6b2e2e; }
  table { border-collapse: collapse; font-size: 13px; margin-top: 8px; }
  th { text-align: left; padding-right: 12px; opacity: 0.75; font-weight: normal; }
  label { display: block; margin-top: 6px; font-size: 13px; }
  label input, label textarea { display: block; width: 100%; max-width: 420px; }
  .export { width: 100%; height: 120px; font-family: monospace; font-size: 12px; }
  .legend { font-size: 12px; }
  .key { display: inline-block; width: 11px; height: 11px; border-radius: 2px; margin-left: 6px; vertical-align: middle; }
  .key.quiet { background: rgba(70, 150, 230, 0.8); } .key.capture { background: rgba(220, 70, 70, 0.85); } .key.both { background: rgba(160, 90, 220, 0.85); }
</style>
