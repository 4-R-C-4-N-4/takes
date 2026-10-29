# Pricing backlog (for ruleset 2026.6)

Ivy is compiling a larger set of piece-value updates for 2026.6. Collected feedback so far:

- **Coroner (BN), 7:** feels a little weak for its cost (Ivy, 2026-10-28).
- **The band between the minors (Knight/Bishop 3), Rook (5) and Queen (9)** is a new, loosely priced area that needs tuning overall. Affected 2026.5 pieces and current costs:
  - Minor: Dancer vWF 2, Prince WF 3, Turtle vDN 3, Jester AN 4, Halo DN 4, Scarab B3N 5, Seal R2N 5, Octopus R3B3 5, Impact R2B 5, Bullseye R3N 6.
  - Rook: Azazel RA 6.
  - Major: Coroner BN 7, Hierophant RN 8, Bane RBN 15 (raised from 12 in 2026.4).
- Already settled: the pawn tier ladder (2026.5, D22). Strict downgrades cost less, and none reach Bishop price.

Inputs available when 2026.6 is assembled:
- Four-way screen results (`docs/catalog/fourway/screened.json`): strength vs the replaced piece. These are screening numbers, not prices.
- The self-play valuation harness (`docs/valuation/`). It needs per-piece runs of hundreds to thousands of games, with knight and bishop as controls, before its numbers are trusted.

Reference point: AlphaZero's self-play values for classical chess (Tomašev et al., "Assessing Game
Balance with AlphaZero", 2020): pawn 1, knight 3.05, bishop 3.33, rook 5.63, queen 9.5. Its method
(fitting win rate against material imbalance over self-play games) carries over to Takes. Its
numbers don't, because values depend on context: which pieces are on the board, our own-set promotion
(a pawn is worth more when its army has stronger targets), and blind setups. Measure Takes values in
Takes armies.

Publishing: a new version (`packages/library/rulesets/2026.6.config.json`). Saved armies still legal under it move over automatically; any that no longer fit are flagged with the reason and open in the Builder for fixing.
