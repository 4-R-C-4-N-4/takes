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

Extensions after the catalog (D18-compliant): cannon, grasshopper, lame leapers, riders.
