# Reviewing the piece campaign

Run the app with `pnpm serve` and open `http://localhost:8787/#/candidates`, or use the Candidates tab.

## Candidates page

- **Views:** *Shortlist* (top 5 per family after 160-game reruns), *All screened* (every candidate from the run), and *My verdicts*.
- **Filters:** tier and family. Sort by strength, activity (moves per game) or forks.
- **Preview board:** *Moves + attacks* / *Moves* / *Attacks*. Tap a square to move the piece.
- **Test drive (hotseat):** plays a game with the candidate in its tier slot against a vanilla army. Minor candidates take the knight squares, rook candidates the rook squares, major candidates the queen square, and pawn candidates d2/e2. This uses a sandbox ruleset; nothing is published.
- **Verdicts:** Keep / Maybe / Reject, plus a working name and notes. These are stored in your browser. *Export verdicts* copies JSON (betza, tier, verdict, name, note). Paste it to the agent to move keepers into the next valuation and art pass.

## Reading the numbers

- **Strength** = score minus the slot's *null control*. The null control is the replaced piece itself, injected as a new custom piece. The engine plays unfamiliar pieces worse, so an exact copy scores about 0.31–0.38, not 0.5.
  - About ±0.15 is noise at 40 games and ±0.08 at 160. Treat smaller gaps as ties.
- **Activity** = candidate moves per game.
- **Forks** = moves after which the candidate attacks two or more enemy pieces worth 3 or more, or the king.
- **Survival** = share of games where the candidate is still on the board at the end.
- **Final attack** = share of decisive games where it attacked the losing king's zone in the last 6 plies.

## Other artefacts

- `docs/catalog/shortlist.png`: contact sheet with art, move badge and strength.
- `docs/catalog/shortlist.md`: per-family tables, null controls and strength-vs-null.
- `docs/catalog/screened.json`: raw data behind the page.
- `docs/catalog/catalog-summary.md`: what was enumerated and how it was verified.

## Known limits of this screen

- Only left/right-symmetric pieces, with at most 100 sampled per family.
- Fast low-node Fairy-Stockfish games: these numbers *screen* pieces; they don't price them.
- Pawn-tier pieces are compared against a pawn, so pawn-tier forward sliders look enormous.
