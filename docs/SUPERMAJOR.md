# Super-major tier and low-cost pieces: analysis (2026-10-28)

Tools:
- `tools/catalog/src/mate.ts` is an exact retrograde analysis of "X (with or without its king) vs a lone king". It is tested against endgame theory: KQ vs K mates in at most 10 moves, KR vs K in at most 16, KB and KN vs K are draws, a lone queen can't mate, and the Amazon can.
- Reports: `pnpm --filter @takes/catalog mate` (roster), `mate --catalog`, plus `node --import tsx scripts/supermajor.ts` and `node --import tsx scripts/lowcost.ts` in `tools/catalog`.

## What the current roster can do against a lone king

| Piece | Name | Cost | With its king: forced win | Longest mate | Alone: forced win | Alone, enemy king in a corner |
| --- | --- | --- | --- | --- | --- | --- |
| RBN | Bane | 15 | 100% | 4 | **100%** | 100% |
| BN | Coroner | 7 | 100% | 17 | 1.4% | **19%** |
| B3N | Scarab | 5 | 100% | 17 | 1.6% | **21%** |
| RN | Hierophant | 8 | 100% | 11 | 0% | 0% |
| RB | Queen | 9 | 100% | 10 | 0% | 0% |
| R | Rook | 5 | 100% | 16 | 0% | 0% |
| R2N, R3N, R2B, R3B3, RA | Seal, Bullseye, Impact, Octopus, Azazel | 5–6 | 100% | 11–17 | 0% | 0% |
| DN, AN | Halo, Jester | 4 | 100% | 31, 35 | 0% | 0% |
| WF | Prince | 3 | 100% | 18 | 0% | 0% |
| N, B, vDN, vWF | Knight, Bishop, Turtle, Dancer | 2–3 | 0% (draw) | – | 0% | 0% |

- **Bane is the only piece that mates entirely on its own, from any position.** That confirms the super-major problem.
- **Ivy's corner observation is right.** Coroner and Scarab can mate alone, but only against a king that is already cornered: about 20% of corner positions and about 1.5% overall. The bishop-plus-knight pattern seals a corner.
- Halo (DN) and Jester (AN) can mate with their king's help, but slowly: up to 31 and 35 moves, close to the 50-move horizon.

## Super-major candidates: compounds that mate alone

Searched: queen, rook and bishop bases at ranges 2–4 and unlimited, combined with every subset of the knight (N), the one-step leaps W and F, and the two-square jumps D and A. Every hit is fully symmetric and captures where it moves. Each listed piece mates alone from **100%** of positions.

| Piece | Reading | Busy-board mobility | Compare |
| --- | --- | --- | --- |
| WFDN | king step + knight + 2-square orthogonal jump (a "Centaur" plus Dabbaba) | 14.8 | ≈ Queen (15.0) |
| R4FN | rook up to 4 + one diagonal step + knight | 16.2 | |
| RFN | rook + one diagonal step + knight (Hierophant + Ferz) | 17.0 | |
| BR2N | bishop + rook up to 2 + knight (Coroner + short rook) | 17.3 | |
| R3B3N | queen up to 3 + knight (Octopus + knight) | 17.9 | |
| BR3N / RB2N | 3- or 2-square-limited Amazons | 18.6 | |
| RBN | Bane (the Amazon) | 20.2 | strongest |

Findings:
- **The knight move is the key ingredient.** Every piece that mates alone has it. A knight's check can't be blocked and comes from a square that no sliding ray covers.
- The Centaur (WFN) can't mate alone; adding the D jump (WFDN) makes it able to.
- Neither the Queen nor the 2026.2 Dragon (queen + D + A jumps) can mate alone.
- There are weaker super-majors than Bane. WFDN mates alone with about the Queen's mobility, and RFN, BR2N and R3B3N sit between the Queen and Bane. A super-major tier could hold 2–4 of these at different prices, so having one is a choice rather than an automatic win.

## Low-cost non-pawn pieces

| Piece | Name | Busy-board mobility | Mates with its king? |
| --- | --- | --- | --- |
| A | Alfil | 2.2 | no |
| D | Dabbaba | 3.0 | no |
| F | Ferz | 3.1 | no |
| W | Wazir | 3.5 | no |
| vWF | Dancer (ours) | 4.8 | no |
| AD | Alibaba | 5.2 | no |
| FA | Ferz + Alfil | 5.3 | no |
| WA | Waffle / Phoenix (was Heron) | 5.7 | no |
| FD | Ferz + Dabbaba (was Toad) | 6.1 | no |
| WD | Wazir + Dabbaba | 6.5 | yes (≤ 29 moves) |
| WF | Commoner (Prince) | 6.6 | yes (≤ 18) |
| FAD | FAD | 8.3 | no |
| WAD | Champion | 8.7 | yes (≤ 26) |
| N | Knight (reference) | 5.2 | no |

**About the Copper General.** In Japanese chess (Chu Shogi) it moves one step to any of the three squares ahead, or straight back (Betza fKbW).
- It is front/back asymmetric, so it breaks D19 above the pawn tier.
- Making it front/back symmetric turns it into vF + vW + fF + bF, which is exactly our **Dancer (vWF)**. The Silver General (F + fW) symmetrises to the same thing. So the Dancer already is the D19-legal Copper/Silver General.
- The asymmetric Copper General itself could still enter as a **pawn-tier** piece. Pawn tier is exempt from D19, and it would promote like Japanese generals do.
