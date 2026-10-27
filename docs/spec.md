# Takes — Game Spec v0.1

Oct 27, 2026 · @Ivy Darling

## Overview

Takes is chess with a blind, player-built opening and an expandable piece library. Each player secretly configures their half of the board, then is matched against another player or a bot setup.

Design pillars:

- **Chess at the core.** King, check, checkmate, stalemate, castling and en passant behave as in chess. Check is the heart of the game and is not modified.
- **Pieces are data.** Every non-king piece is a composition of a small set of movement primitives, so new pieces can be designed, validated and valued without new rules.
- **Values are measured, not declared.** Point values come from engine self-play and drive the setup budget.

## Core rules

All rules not stated otherwise are standard FIDE chess rules.

- **King:** exactly one per side, standard king movement. It is a fixed engine piece, not part of the piece library.
- **Check and legality:** a square is attacked if any enemy piece has a capture component that reaches it. A move is legal only if it does not leave the mover's king attacked. Checkmate and stalemate are standard.
- **Capture by replacement:** a piece captures only by moving onto the enemy piece's square. No shooting, capture by withdrawal or capture by approach.
- **En passant:** the one exception to replacement capture, kept as in vanilla chess. Only the vanilla pawn has the two-square first move, so only the vanilla pawn may capture or be captured en passant, immediately after that advance. Generalizing en passant is deferred.
- **Every library piece must have at least one capture component**, so every piece can give check.

**Curated library.** Every piece is designed and named by the game designer. Players choose from the library; they never create pieces.

**Orientation.** Black's moves are White's flipped vertically. Files are never mirrored, so left and right always mean the a-side and h-side of the board.

**Draws.** Checkmate, stalemate, threefold repetition and agreement. There is no fifty-move rule in v1.

**King cost.** The king costs 0 and sits outside the point pool.

## Board and setup

The board is 8×8. Each player builds on their own three ranks (White ranks 1–3, Black ranks 6–8), leaving ranks 4–5 empty at the start.

All setup validation happens in the opening builder, at build time. A saved profile is always legal to play, and the server only re-checks it against the current ruleset.

Build-time checks:

- Exactly one king, placed on the player's rank 1.
- Total cost within the point pool.
- No pawn-tier piece on the last rank.
- **King safety:** the king must not be attackable by any library piece placed on any square of the enemy zone, assuming ranks 4–5 are empty and using only the player's own pieces as blockers. This needs only the player's setup and the library, never the opponent's setup.

Other pieces may start under attack. Move-1 captures are part of the blind-setup gamble.

**Library constraint:** leap components have |dy| ≤ 2, so no leaper can jump from the enemy zone into yours across the two empty ranks. The knight fits. Leaps must also clear at least one square and have range 1; single-square steps are written as slide with range 1.

## Piece schema

A piece is a name, a tier and a list of movement components. Each component is a base vector expanded by symmetry, with a range, a path type and a mode.

```ts
type Dir = 'f' | 'b' | 'l' | 'r' | 'fl' | 'fr' | 'bl' | 'br'; // relative to owner

interface Component {
  vec: [number, number];       // base step, e.g. [1,2]
  sym: 'all' | Dir[];          // expand sign/swap variants, then filter
  range: number;               // 1 = step/leap, Infinity = slide
  path: 'leap' | 'slide';      // slide = blocked by any piece in between
  mode: 'move' | 'capture' | 'both';
  cond?: 'rank2';              // only from relative rank 2, unmoved
}

interface Piece {
  id: string;
  name: string;
  glyph: string;
  tier: 'pawn' | 'minor' | 'rook' | 'major';
  components: Component[];
  value?: number;              // measured via self-play
}
```

| Field | Meaning |
| --- | --- |
| `vec` | Base displacement (dx, dy). Any vector, so leapers like the knight \[1,2\] fit. |
| `sym` | `all` generates every sign and axis-swap variant. A direction list keeps only those directions, relative to the owner. |
| `range` | Max repetitions of the vector. 1 = single step or leap, Infinity = slider. |
| `path` | `leap` ignores intermediate squares. Must jump over at least one square (max of abs(dx), abs(dy) ≥ 2) and has range 1 in v1. Leap riders are deferred. `slide` stops at the first occupied square. |
| `mode` | `move` = non-capturing only, `capture` = capturing only, `both` = either. |
| `cond` | `rank2` = only available to an unmoved piece starting on its relative rank 2. A pawn placed on rank 1 or 3 never double-steps. Reserved for the vanilla pawn in v1. |

## Tiers

Tier is declared by the designer and checked two ways: a structural rule that grants or forbids mechanics, and a value band that flags balance problems. A value outside the band is a warning to rebalance, never a rule change.

| Tier | Value band | Structural rule | Mechanics granted |
| --- | --- | --- | --- |
| Pawn | \~1 | Every component strictly forward (dy ≥ 1). Must have a destination from every square below the last rank. | Promotion. En passant (vanilla pawn only). |
| Minor | \~3 | None | None |
| Rook | \~5 | Has a horizontal slide covering both directions, any mode. Measured value must fall in the rook band (band TBD) | Castling |
| Major | \~9 | None | None |

**Pawn-tier validator.** On an empty board, from every square below the last rank, the piece must have at least one on-board destination. This rejects pieces the board geometry could strand.

| Design | Result |
| --- | --- |
| Vanilla pawn (\[0,1\] forward) | Pass |
| Forward-left + forward-right diagonal | Pass |
| Forward-left only | Fail: stuck on the a-file |
| \[0,2\] only | Fail: stuck on rank 7 |

Being blocked by other pieces is normal pawn play and is allowed.

## Promotion and castling

### Promotion

A pawn-tier piece promotes on reaching the last rank, and only there. Promotion is mandatory. Target pieces are an open question (see below).

### Castling

The king may castle with a rook-tier piece on the same rank when all of the following hold:

1. Neither the king nor the partner has moved. A promoted piece counts as moved.
2. The partner is the closest rook-tier piece to the king on that side of rank 1. A king can never castle past another piece.
3. Destinations follow Chess960: kingside, the king ends on g and the partner on f. Queenside, the king ends on c and the partner on d.
4. Every square either piece crosses or lands on is empty, ignoring the two castling pieces.
5. The king is not in check and does not cross or land on an attacked square. The partner's path may be attacked.

Castling happens on the player's rank 1 only, never along a file. Fixed destination files make it work for any blind setup, with no separation requirement.

## Reference library

The classic pieces expressed in the schema, plus candidate new pieces. Candidate tiers and values are unconfirmed until measured.

### Classic pieces

| Piece | Tier | Components | Betza | Value |
| --- | --- | --- | --- | --- |
| Pawn | Pawn | \[0,1\] f, 1, slide, move · \[0,1\] f, 2, slide, move, rank2 · \[1,1\] fl/fr, 1, slide, capture | mfWifmnDcfF | 1 |
| Knight | Minor | \[1,2\] all, 1, leap, both | N | 3 |
| Bishop | Minor | \[1,1\] all, ∞, slide, both | B | 3 |
| Rook | Rook | \[1,0\] all, ∞, slide, both | R | 5 |
| Queen | Major | Rook + Bishop components | Q | 9 |

### Candidate new pieces

| Piece | Candidate tier | Components | Betza | Notes |
| --- | --- | --- | --- | --- |
| Wraith | Minor or rook | \[1,0\] all, ∞, slide, move · \[1,1\] all, ∞, slide, capture | mRcB | Moves as a rook, captures as a bishop. Castling-eligible if declared rook tier and its measured value lands in the rook band. |
| Lancer | Minor | \[0,1\] f, ∞, slide, both · \[0,1\] b, 1, slide, both | fRbW | Forward-only rook with a one-step retreat. |
| Berolina | Pawn | \[1,1\] fl/fr, 1, slide, move · \[0,1\] f, 1, slide, capture | mfFcfW | Inverted pawn. Passes the validator. Not en passant eligible. |
| Warden | Rook | \[1,0\] l/r, ∞, slide, both · \[0,1\] f/b, 1, slide, both | sRvW | Horizontal slider with vertical steps. Castling-eligible. |

## Valuation

Piece values are measured with engine self-play, not estimated from mobility. Raw mobility misleads: on an empty 8×8 board the knight averages about 5.25 moves and the bishop about 8.75, yet both are worth about 3. Range, color-binding and forward-only movement all distort the relationship.

Pipeline:

1. **Export** each piece's components to a Betza string.
2. **Load** the piece into Fairy-Stockfish as a custom piece in a variant config.
3. **Match** positions where one side swaps a known piece (or pawns) for the test piece, over many games from varied setups.
4. **Fit** the value from win/draw/loss rates against the known reference values.
5. **Validate** the result against the declared tier's band and flag outliers.

The same engine doubles as the opponent for bot setups.

## Future improvements

- **Color preview in the builder:** a white/black toggle to see a setup from both sides.
- **Color-tagged openings:** mark a profile as a white opening, black opening or both, and request a color when matching.
- **Generalized en passant** for pawn-tier pieces beyond the vanilla pawn.
- **Leap riders** (multi-hop leapers such as the nightrider).
- **Engine independence:** replace Fairy-Stockfish if its rules coverage or GPL-3.0 license becomes a constraint.

## Open questions

- [ ] Setup budget: total point cap, and a max count per piece?
- [ ] Promotion targets: vanilla Q/R/B/N, any library piece, or only pieces in your own setup?
- [ ] Rook value band: what measured range qualifies a piece for rook tier and castling?
- [ ] First-move edge: does Black need a budget bonus to offset White moving first into a blind position?
- [ ] Endless games: with no fifty-move rule, is a hard move cap or a generalized pawn-tier fifty-move rule needed?
- [ ] Time controls: default clock for invite games?

