# @takes/validator

Build-time piece and profile validation for Takes (M2). Pure, no I/O.
See `docs/spec.md`, `docs/impl.md` ("Validator") and `docs/DECISIONS.md` for
the rules this package implements.

## API

- `validatePiece(p: Piece): Issue[]` — per-piece rules.
- `validateRuleset(r: Ruleset): Issue[]` — all pieces + cross-piece rules.
- `validateProfile(setup: string, r: Ruleset, opts?: { color }): Issue[]` — full
  profile check; squares are reported in absolute board indices (a1=0..h8=63)
  for `opts.color` (default `'w'`).
- `kingSafety(setup: Setup, r: Ruleset, color?): KingExposure[]` — grouped king
  exposure lines, used internally by `validateProfile` and exported for the
  builder to call directly/incrementally.
- `isCastlingEligible(p: Piece): boolean` — structural rook/castling test [D1].
- `hasErrors(issues: Issue[]): boolean` — `issues.every(i => i.severity !== 'error')` helper.

## Issue codes

Piece validation (`validatePiece`):

| Code | Severity | Rule |
| --- | --- | --- |
| `BAD_VECTOR` | error | component vec is `[0,0]` |
| `BAD_RANGE` | error | range not a positive integer or `Infinity` |
| `BAD_SYM` | error | `sym` is neither `'all'` nor a non-empty direction list |
| `GLYPH` | error | glyph not a single uppercase `A`-`Z`, or is `K` [D5] |
| `HAS_CAPTURE` | error | no component with mode `capture`/`both` |
| `RANK2_RESERVED` | error | `cond: 'rank2'` used by a non-`pawn` id |
| `LEAP_CAP` | error | leap violates `\|dy\|<=2`, range 1, `max(\|dx\|,\|dy\|)>=2` |
| `SLIDE_UNIT` | error | slide vector is not a unit vector (D3; no riders) |
| `PAWN_FORWARD` | error | pawn-tier component with `dy < 1` |
| `PAWN_STRANDED` | error | pawn-tier piece has an on-empty-board square (ranks 1-7) with no move-mode destination [D7] |
| `ROOK_CASTLING` | error | rook-tier piece fails `isCastlingEligible` [D1] |
| `VALUE_BAND` | warning | declared `value` outside its tier's placeholder band |

Ruleset validation (`validateRuleset`) additionally emits:

| Code | Severity | Rule |
| --- | --- | --- |
| `NO_KING_PIECE` | error | ruleset defines a library piece with id `'king'` |
| `GLYPH_UNIQUE` | error | two pieces share a glyph |
| `MISSING_COST` | error | a piece has no entry in `costs` |
| `BAD_MAX_COUNT` | error | `maxCount` references an unknown piece id |
| `BAD_PROMOTION_TARGET` | error | `promotionTargets`/`promotionFallback` references an unknown piece id |

Profile validation (`validateProfile`):

| Code | Severity | Rule |
| --- | --- | --- |
| `PARSE` | error | setup string failed to parse |
| `RULESET_VERSION` | error | setup's ruleset version != the ruleset passed in [D9] |
| `UNKNOWN_PIECE` | error | a placed piece id is not in the ruleset |
| `KING_COUNT` | error | not exactly one king |
| `KING_RANK` | error | king not on rank 1 |
| `OVER_BUDGET` | error | total setup cost exceeds `ruleset.pool` |
| `MAX_COUNT` | error | a piece exceeds its `ruleset.maxCount` cap |
| `PAWN_LAST_RANK` | error | a pawn-tier piece sits on the zone's last rank (unreachable in practice, kept per spec) |
| `KING_EXPOSED` | error | see King safety below |

All issue `squares` are **absolute** board indices (a1=0 .. h8=63) for the
requested color; `KING_EXPOSED` squares are the open line's squares plus the
king's square, and `data.attackers` lists `{ pieceId, from }` for every
ruleset piece that can reach the king along that line.

## King safety

Implements spec.md "King safety" / impl.md "King-safety algorithm": for every
square in the enemy zone (the far 3 ranks) and every ruleset piece (expanded
for the *opposite* color, since an enemy piece's forward points at the
player), place that piece alone on the square against a board containing only
the player's own setup (ranks 4-5 empty). If any capture-capable vector from
that square reaches the king — sliding, blocked only by the player's own
pieces — it's an exposure. Exposures are grouped by line (`file`, `rank`,
`diagonal`, `leap`, `other`) so the builder can say e.g. "Your king is open on
the e-file."

Geometry note: because the enemy zone starts 5 ranks away from a rank-1 king
and the board is 8 wide, a diagonal attack can only ever reach a king whose
file is within 2 of the edge (`file <= 2` or `file >= 5` for the 5-rank-away
boundary) — central kings (d/e-file) cannot be diagonally exposed from the
enemy zone. This is a real consequence of the board geometry, not a bug;
tests pick a near-corner king for the diagonal fixtures.

## Notes / spec ambiguities resolved

- `VALUE_BANDS` are explicitly placeholder numbers (spec.md marks rook band
  "TBD"); only ever produce warnings, never errors (D1).
- `isCastlingEligible` is purely structural (D1): tier is NOT checked here —
  the per-piece `ROOK_CASTLING` rule enforces that *rook-tier* pieces must
  satisfy it; non-rook pieces are simply never consulted as castling partners
  elsewhere (engine's job), so `isCastlingEligible` can return `true` for a
  non-rook piece without this package flagging it.
- "Only the vanilla pawn may use rank2" is enforced piece-locally
  (`RANK2_RESERVED`), independent of tier, matching impl.md's literal wording.
