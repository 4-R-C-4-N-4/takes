# Piece catalog and scenario screening

Goal: systematically find GOOD pieces before naming or pricing them. Ivy curates the final library. The tools only shortlist.

## Pipeline
1. **Enumerate** (tools/catalog). Generate every piece expressible in the current schema and validator, up to 3 components:
   - unit slides W/F with range 1, 2, 3 or ∞
   - leaps D, N, A with range 1
   - direction subsets per atom
   - mode move/capture/both
2. **Canonicalise and dedupe.** Two pieces are the same if they expand to the same White vector set. Merge left/right mirror pieces into one family. Every survivor must pass `validatePiece`, have a capture, and export to Betza.
3. **Static profile.** Compute mobility on an empty board (average, centre, edge), capture reach, colour binding, forward/backward/sideways capability, leap/slide/step mix, and distance to the nearest existing library piece. Assign the tier heuristically: pawn tier if it passes the pawn rules; rook tier if it is castling-eligible; major if its slide mobility is at least the queen's ×0.75; otherwise minor.
4. **Stage A screen.** Cheap filters: drop near-duplicates of the library and pieces that are strictly dominated on every axis. Keep a stratified sample per family, so the screen never collapses onto queen-like pieces only.
5. **Stage B scenario games** (tools/scenarios). Put the candidate into realistic Takes armies (vanilla-like and random valid profiles), replacing a same-tier piece. Play short Fairy-Stockfish self-play at low node counts, with the Takes engine as referee.
6. **Metrics per candidate:**
   - strength (score vs replaced piece)
   - activity: moves, captures and checks per game by the candidate
   - forks: moves where the candidate attacks two or more enemy pieces worth ≥3 or the king
   - survival
   - involvement in the final attack
   - game length and decisiveness
   - parity events, which must be 0
7. **Stage C.** Run more games for the top N per family, rank them, and produce a contact sheet (badge + art + Betza + metrics) in docs/catalog/shortlist.md and shortlist.png.
8. **Ivy names, picks and prices** the keepers. The valuation harness then measures them properly.

## Extensions after the catalog (D18-compliant): cannon, grasshopper, lame leapers, riders.

## Catalog results (tools/catalog)

Pipeline implemented: enumerate -> canonicalise/dedupe -> validate+Betza -> static
profile/tier/families -> FSF round-trip verification -> `docs/catalog/catalog.json.gz`
+ `docs/catalog/catalog-summary.md`. Regenerate with
`pnpm --filter @takes/catalog run build` (~14s).

- Component options enumerated: 453 single components (W/F slides x 15 dir
  subsets x {1,2,3,∞} ranges x 3 modes; D/A leaps x 15 dir subsets x 3 modes;
  N leap x 3 modes only — directional N subsets are rejected by the Betza
  exporter as oblique-leaper ambiguity, matching `componentToBetza`'s
  documented limitation).
- 1- and 2-component combos are enumerated **exhaustively** (453 + 102,378).
  3-component combos are combinatorially enormous (~15.4M unordered triples)
  and are **not** enumerated exhaustively: we draw a large seeded
  deterministic sample (80,000 by default, `CATALOG_TRIPLE_SAMPLE` env var)
  plus a hand-picked seed list (`seedClassicCombos`, currently the amazon
  R+B+N) guaranteeing specific classics survive the sampling. This is the
  one deliberate, documented scope reduction from "every piece expressible
  up to 3 components" — see "known gaps" below.
- Canonicalisation merges move+capture pairs into `both`, dedupes by the
  expanded White vector-set key, and merges left/right mirror images.
- Two additional Betza-exporter ambiguities were found by FSF round-trip
  testing and are now excluded pre-emptively (not just caught by the sample):
  (1) two components sharing an atom letter concatenate into an unintended
  multi-leg compound (e.g. `W`+`W` -> FSF reads `WW` as a 2-leg leaper, not
  two wazir terms); (2) any piece with 2+ slide components on the same atom
  (any range) has the same adjacency risk once mode/direction prefixes are
  stripped. Both are reported as exporter limitations, not fixed in
  `@takes/betza` (out of this tool's ownership).
- Last production run (80,000 triples, 2,500-case FSF sample): 182,832 raw
  combos -> 126,764 canonical -> 56,079 valid -> 56,079 FSF-verified (0
  mismatches in the sample) -> 56,079 final catalog entries, in 13.8s.
- Known gaps: dragon (rook+bishop+dabbaba+alfil = 4 schema components)
  structurally exceeds the ≤3-component cap and cannot appear in this
  catalog; 3-component space is sampled, not exhaustive, so some valid
  3-component pieces may be absent from any single build (re-running with a
  larger `CATALOG_TRIPLE_SAMPLE` finds more); the same-atom slide exclusion
  is conservative and discards some legitimate pieces (e.g. same-atom,
  different-direction combos) alongside the genuinely ambiguous ones.
