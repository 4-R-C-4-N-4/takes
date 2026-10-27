# Takes — v1 Implementation Guide

Oct 27, 2026 · @Ivy Darling

Build guide for a coding agent. The Takes Game Spec is the source of truth for rules; this guide covers how to build them.

## Scope and agent rules

v1 is a browser game: build a setup profile from a point pool, then play it against a friend via invite link or against a bot.

**In scope:** rules engine, piece library, build-time validator, opening builder, local profiles, invite-link multiplayer with an authoritative server, in-browser bots, valuation tooling.

**Out of scope for v1:** matchmaking queue, accounts, ratings, clocks beyond a simple optional timer, spectators, mobile apps.

Rules for the implementing agent:

1. The Takes Game Spec defines the rules. Do not invent or "fix" rules. If the spec is ambiguous or contradicts this guide, stop and ask, listing the options.
2. The engine is pure, deterministic TypeScript with no I/O, no randomness and no UI imports. Client and server run the same engine code.
3. Every rule ships with tests. Rules bugs are the main project risk.
4. Pieces are data. Never special-case a library piece in code, except the king (engine-fixed) and the vanilla pawn (en passant).

## Stack and repo layout

A pnpm TypeScript monorepo. The engine package is shared by web, server and tools.

| Layer | Choice |
| --- | --- |
| Language | TypeScript, strict mode |
| Monorepo | pnpm workspaces |
| Web | Vite + Svelte, custom SVG board |
| Server | Node 22 (or Bun), `ws` WebSockets, SQLite via `better-sqlite3` |
| Bots | Fairy-Stockfish WASM (`ffish.js` / `fairy-stockfish.wasm`) in a Web Worker |
| Tests | Vitest, `fast-check` for property tests |
| Hosting | Single Hetzner box, Cloudflare in front for TLS and static assets |

```
takes/
  packages/
    engine/      # board, movegen, legality, game state, setup strings
    library/     # piece JSON, rulesets, schema types
    validator/   # build-time profile checks (depends on engine)
    protocol/    # shared client/server message types
    art/         # procedural piece SVGs, move-diagram badges
  apps/
    web/         # builder, profiles, lobby, game, bot worker
    server/      # rooms, invite flow, persistence
  tools/
    betza/       # component -> Betza exporter, variants.ini generator
    perft/       # perft runner and parity checks vs Fairy-Stockfish
    valuation/   # self-play value measurement harness
```

## Engine

### Board and state

- Squares are indices 0–63 (a1 = 0, h8 = 63). File = i % 8, rank = i >> 3.
- `GameState`: piece array (64 slots of `{pieceId, color, hasMoved}` or null), side to move, castling rights per side as the starting squares of eligible partners, en passant target square, halfmove clock, fullmove number, position-hash history for repetition.
- Use make/unmake with an undo stack for performance. Zobrist hashing keyed by (pieceId, color, square).

### Orientation

Components are written from the owner's point of view, with forward = +y. For Black, flip the vertical axis: (dx, dy) → (dx, −dy). Files are never mirrored, so left and right always refer to the a-side and h-side of the board, matching how chess mirrors the armies.

### Expanding components

1. If `sym` is `all`, generate (±dx, ±dy) and (±dy, ±dx), then dedupe.
2. If `sym` is a direction list, generate as for `all`, then keep vectors whose label is in the list. Labels: `f` dy>0, dx=0 · `b` dy<0, dx=0 · `l` dx<0, dy=0 · `r` dx>0, dy=0 · `fl` dy>0, dx<0 · `fr` dy>0, dx>0 · `bl` dy<0, dx<0 · `br` dy<0, dx>0.
3. Precompute expanded vector lists per piece per color once at library load.

### Move generation

For each expanded vector, step 1..`range` times from the origin:

- Off board: stop.
- `slide`: if the square is occupied, it ends the ray. Emit a capture there if it holds an enemy and mode allows capture.
- `leap` with range 1: only the destination matters. Leap vectors must clear at least one square (max(abs(dx), abs(dy)) ≥ 2); single-square steps are slides with range 1.
- Empty square: emit a quiet move if mode allows move.
- `cond: 'rank2'`: skip unless the piece is unmoved and on its relative rank 2. Only the vanilla pawn (id pawn) may carry this condition in v1. The two-step is blocked if the intermediate square is occupied (it is a slide).

### Attacks and legality

- `isAttacked(sq, byColor)`: true if any `byColor` piece has a capture-capable vector reaching `sq` under the rules above. Build a reverse lookup per piece for speed later; a forward scan over enemy pieces is fine for v1.
- A pseudo-legal move is legal if, after making it, the mover's king is not attacked.
- The king is engine-fixed: standard one-step king, `both` mode.

### Special moves

- **En passant:** only pieces with id `pawn`. Set the target square after a `pawn` two-step. Capture removes the passed pawn. Legality check as normal (watch the discovered-check-along-rank case).
- **Castling:** rank 1 only. The partner is the closest rook-tier piece to the king on that side of rank 1, and unmoved. The king can never castle past another piece. Chess960 destinations: king to g1 and partner to f1, or king to c1 and partner to d1 (mirrored for Black on rank 8). All squares crossed or landed on by either piece must be empty except the two castling pieces. The king may not be in check, cross an attacked square, or land on one. Encode as a king move to the partner's square in UCI to match Fairy-Stockfish 960 conventions.
- **Promotion:** a pawn-tier piece reaching the last rank must promote. Targets come from the ruleset's `promotionTargets` list (default `queen`, `rook`, `bishop`, `knight`). A promoted piece has `hasMoved = true`.

### Game end

Checkmate, stalemate, threefold repetition, resignation, agreed draw, timeout. There is no fifty-move rule in v1 (see decisions). Insufficient material: v1 detects only king vs king. The repetition hash must include side to move, castling rights and the en passant square.

## Library, ruleset and setup string

### Piece files

One JSON file per piece in `packages/library/pieces/`, matching the spec's `Piece` schema. Infinity is written as `null` in JSON and mapped on load.

```json
{
  "id": "warden",
  "name": "Warden",
  "glyph": "W",
  "tier": "rook",
  "components": [
    { "vec": [1, 0], "sym": ["l", "r"], "range": null, "path": "slide", "mode": "both" },
    { "vec": [0, 1], "sym": ["f", "b"], "range": 1, "path": "slide", "mode": "both" }
  ]
}
```

The engine generates moves from components and deduplicates identical moves (the pawn's 1-step appears in both its components).

### Ruleset

A ruleset pins costs and options so saved profiles stay valid. Rulesets are immutable once published; changes ship as a new version.

```json
{
  "version": "2026.1",
  "pieces": { "pawn": 1, "knight": 3, "bishop": 3, "rook": 5, "queen": 9, "warden": 5 },
  "pool": 39,
  "maxCount": { "queen": 1 },
  "promotionTargets": ["queen", "rook", "bishop", "knight"]
}
```

Pool size and per-piece caps are placeholders until decided. Pieces not listed in a ruleset are not available in it.

### Setup string

Encodes one player's three ranks, from that player's point of view.

- Ranks listed from rank 1 to rank 3, separated by `/`.
- Each rank lists files a to h. Digits 1–8 are runs of empty squares.
- Classic pieces use one letter: `K Q R B N P`. Library pieces use `{id}`.
- Prefixed with the ruleset version.

Example, the vanilla chess setup: `2026.1:RNBQKBNR/PPPPPPPP/8`

Example with library pieces: `2026.1:R1BQKB{warden}1/PPPPPPPP/2N2N2`

Black's string uses the same format, with its rank 1 placed on rank 8 and files unchanged (a1 → a8). The same string therefore produces mirror-image armies for either color, as in vanilla chess. The example above totals 39 points.

## Validator

Two validators share `packages/validator`: one for pieces (run when the library loads and in CI) and one for profiles (run live in the builder and again on the server).

### Piece validation

| Check | Rule |
| --- | --- |
| Has capture | At least one component with mode `capture` or `both` |
| Leap cap | Every `leap` component has abs(dy) ≤ 2, range 1, and max(abs(dx), abs(dy)) ≥ 2 |
| Pawn tier: forward | Every expanded vector has dy ≥ 1 |
| Pawn tier: never stranded | From every square on ranks 1–7, at least one on-board destination on an empty board |
| Rook tier: castling | Has a `slide` component with infinite range covering both `l` and `r`, any mode. Measured value must be in the rook band (band TBD) |
| Value band | If a measured value exists, warn when outside the tier band |

Only the vanilla pawn may use the `rank2` condition. Reject any other piece that does.

### Profile validation

Returns a list of `{code, message, squares}` so the builder can highlight problem squares. Empty list = valid.

1. Setup string parses, and the ruleset version exists.
2. Every piece is in the ruleset.
3. Exactly one king, on rank 1.
4. Total cost ≤ pool, and per-piece caps respected.
5. No pawn-tier piece on rank 8 (cannot occur in a 3-rank zone, but keep the check).
6. King safety (below).

### King-safety algorithm

```
for each square s in the enemy zone (ranks 6–8):
  for each piece P in the ruleset:
    board = player's setup + P (enemy color) on s, ranks 4–5 empty
    if P's capture vectors from s reach the player's king:
      report { code: 'KING_EXPOSED', piece: P, from: s, line }
```

This is at most 24 squares × the ruleset's piece count, so it is fast enough to run on every drag. Group the results by line (file, diagonal, leap) so the builder can say, for example, "Your king is open on the e-file" instead of listing every attacker.

## Server

The server is authoritative: it holds setups until both are submitted, validates every move with the shared engine, and is the only source of game state.

### Room lifecycle

1. Host creates a room and receives an invite code (8 characters, unambiguous alphabet) plus a session token.
2. Guest opens the invite link and joins, receiving their own session token. Colors are assigned randomly unless the host picked one.
3. Each player submits a profile. The server validates it against the room's ruleset and stores it, revealing nothing to the opponent except "ready."
4. When both are ready, the server sends both setups to both players in one message, and play begins with White to move.
5. Moves are validated and broadcast. The game ends per the engine's game-end rules or by resignation, draw agreement or abandonment.

Session tokens live in the client's localStorage and allow reconnecting to the same seat. A player disconnected for more than 120 seconds forfeits (configurable).

### Messages

JSON over WebSocket, typed in `packages/protocol`.

| Direction | Type | Payload |
| --- | --- | --- |
| C→S | `create_room` | `ruleset`, optional `color` |
| S→C | `room_created` | `code`, `token`, `color` |
| C→S | `join_room` | `code` |
| S→C | `joined` | `token`, `color`, `ruleset` |
| C→S | `submit_setup` | `setup` (setup string) |
| S→C | `setup_rejected` | validator issue list |
| S→C | `opponent_ready` | none |
| S→C | `game_start` | both setups, starting FEN-equivalent |
| C→S | `move` | `uci`, `ply` |
| S→C | `move_made` | `uci`, `ply`, new state hash |
| S→C | `move_rejected` | `reason` |
| C→S | `resign`, `offer_draw`, `accept_draw` | none |
| S→C | `game_over` | `result`, `reason` |
| C→S | `resume` | `token` |
| S→C | `state` | full game state for reconnects |

Every message that changes state carries the `ply` it expects; the server rejects stale ones.

### Persistence

SQLite tables: `rooms` (code, ruleset, status, created\_at), `seats` (room, color, token\_hash, setup), `moves` (room, ply, uci, at), `results` (room, result, reason). Store token hashes, not tokens. Finished games are kept for replay and future rating backfill.

## Web app

Five screens. The board is a custom SVG component reused by the builder, game and library preview. Piece glyphs come from library data, so new pieces need no UI code.

| Screen | Purpose | Key behavior |
| --- | --- | --- |
| Library | Browse pieces | Tier grouping, cost, tap a piece to show its moves (quiet vs capture in different colors) from a chosen square on an empty board |
| Builder | Build a profile | Palette by tier, 3-rank half-board, live budget bar, live validator issues highlighted on squares, castling hints, save |
| Profiles | Manage profiles | List with cost and validity, rename, duplicate, delete, copy/paste setup string, "needs review" badge for old rulesets |
| Lobby | Start a game | Pick a profile, then create invite link, join by code, or play a bot |
| Game | Play | Reveal animation at start, move highlighting from the engine, last move, check indicator, promotion picker, resign and draw buttons |

### Builder interactions

- Drag and drop with Pointer Events, so mouse and touch share one code path.
- Tap-to-select then tap-to-place as a fallback for small screens.
- Drag a placed piece off the board to remove it.
- Re-run profile validation on every change; it is cheap.
- Save is disabled while any issue exists.

### Profile storage

v1 stores profiles in localStorage (wrap reads and writes in try/catch) with export and import via setup string. Server-side profiles arrive with accounts after v1.

Not in v1: a white/black preview toggle in the builder, and color-tagged openings (see the spec's future improvements).

## Piece art

Piece art follows a visual grammar: a piece's silhouette encodes its tier and movement, so players can read a new piece before checking its move chart. All pieces, classics included, share one custom style. Do not use third-party chess piece sets.

### Visual grammar

| Element | Source | Encoding |
| --- | --- | --- |
| Base | Tier | Pawn: small, round · Minor: medium · Rook: squat, wide · Major: tall |
| Body | Move components | Orthogonal: square, crenellated · Diagonal: slashed, mitred · Leap: wings or animal head · Forward-only: pointed top |
| Crest | Capture components | Same motifs as the body. Omitted when capture equals move. |

Example: the Wraith (moves as a rook, captures as a bishop) has a crenellated body with a mitred crest.

### Asset rules

- SVG on a fixed square canvas (viewBox 0 0 100 100).
- One fill plus one outline, colored through CSS variables (`--piece-fill`, `--piece-stroke`), so a single file serves both colors and every theme.
- Designed for phone size first: bold silhouettes, minimal interior detail. Check every piece at 40 px.

### Pipeline

1. **Procedural (v1):** `packages/art` generates a piece SVG from its tier and components by composing base, body and crest parts. Every library piece gets art the moment it is defined.
2. **Hand-made override:** if `packages/library/pieces/{id}/art.svg` exists, use it; otherwise fall back to the procedural version. Classics and hero pieces get hand-made art first, drawn to this grammar.

### Move-diagram badge

A generated mini grid shown in the library, builder palette and on long-press in game. Quiet moves and captures use different marks; sliders show arrows to the edge. Built entirely from components, so it needs no art.

The parts library and style guide for illustrators will be written once the procedural parts exist.

## Bots and Fairy-Stockfish

Fairy-Stockfish plays bot games in the browser and powers perft parity and valuation in tools. The Takes engine stays the rules authority; Fairy-Stockfish is an opponent and a cross-check.

**Licensing.** Fairy-Stockfish and `ffish.js` are GPL-3.0. Shipping them in the web bundle counts as distribution, so the client's license must be compatible. Running Fairy-Stockfish unmodified on the server and serving bot moves over the socket avoids that. Keep the bot behind an interface so the engine can be swapped later.

### Betza exporter (`tools/betza`)

Convert each piece's components to a Betza string: atom from the vector (W \[1,0\], F \[1,1\], N \[1,2\], D \[2,0\], A \[2,2\]), doubled for infinite range sliders (or `R`, `B`, `Q` shorthands), direction prefixes from `sym`, `m`/`c` from mode, `i` for `rank2`. Round-trip test: export, then compare the move sets generated by both engines from every square on an empty board.

### Variant config

Generate a `variants.ini` entry per ruleset: one `customPieceN` per library piece, castling with rook-tier partners in Chess960 mode, promotion targets, and en passant for the vanilla pawn only. Verify every option name against current Fairy-Stockfish documentation before relying on it, and record any rule it cannot express. The number of custom piece slots is limited, so check that limit against the library size.

Per game, pass the combined starting position as a FEN with Chess960 castling enabled.

### Bot runtime

- Run Fairy-Stockfish WASM in a Web Worker so the UI stays responsive.
- Difficulty levels map to search depth or move time plus Fairy-Stockfish skill level.
- Validate every bot move with the Takes engine before applying it. A rejected bot move is a parity bug: log it with the FEN.
- Bot setups are ordinary profiles shipped with the app, tagged by difficulty.

## Testing

Perft is the primary correctness test: count all legal move sequences to depth N and compare with known values or a second engine.

### Layer 1: vanilla chess perft

The vanilla setup (`RNBQKBNR/PPPPPPPP/8` for both sides) is a legal Takes position, so the engine must reproduce standard chess perft exactly.

| Position | Depth 1 | Depth 2 | Depth 3 | Depth 4 | Depth 5 |
| --- | --- | --- | --- | --- | --- |
| Standard start | 20 | 400 | 8,902 | 197,281 | 4,865,609 |
| Kiwipete (castling, en passant, promotion) | 48 | 2,039 | 97,862 | 4,085,603 | — |

Also run published Chess960 perft positions to verify castling.

### Layer 2: parity with Fairy-Stockfish

For randomly generated valid profile pairs using library pieces, compare perft to depth 3–4 against Fairy-Stockfish. On mismatch, print a divide (per-move counts) to find the differing move.

### Layer 3: unit and property tests

- Component expansion and orientation for both colors.
- Every validator rule, with one passing and one failing fixture each.
- King-safety: hand-built exposed and shielded setups.
- Property: make then unmake restores the exact state and hash.
- Property: no legal move ever leaves the mover's king attacked.
- Setup string round-trip: parse(serialize(x)) equals x.

### Layer 4: server

- Setups are never sent to the opponent before both are ready.
- Illegal, out-of-turn and stale-ply moves are rejected.
- Reconnect with a token restores the seat and full state.

## Milestones

Build in this order. Each milestone ends when its acceptance criteria pass in CI.

| # | Milestone | Acceptance criteria |
| --- | --- | --- |
| M1 | Engine core | Standard and Kiwipete perft match to depth 5 and 4. Chess960 perft positions pass. Engine also loads arbitrary FEN for testing. |
| M2 | Library and validator | Classic pieces plus the four candidate pieces load. All piece and profile validator fixtures pass. Setup string round-trips. |
| M3 | Local play | Procedural art and move-diagram badges render for every library piece. Builder saves a valid profile. Two profiles play a full hotseat game in the browser, including castling, en passant and promotion. |
| M4 | Invite multiplayer | Two browsers play via invite link. Setups stay hidden until both are ready. Reconnect works. Server rejects illegal moves. |
| M5 | Bots | Betza round-trip passes for every piece. Fairy-Stockfish parity to depth 3 on 100 random profile pairs. Bot games playable at three difficulty levels. |
| M6 | Valuation tooling | Self-play harness outputs a value estimate with confidence interval for a test piece. |

### Decisions needed before or during the build

Ask Ivy rather than choosing:

- Point pool size and per-piece caps (pool 39, only 1 king).
- Promotion targets (placeholder: vanilla Q/R/B/N, but i think this should be only your playing set pieces- ivy).
- Rook value band for castling eligibility.
- Endless-game safeguard, since there is no fifty-move rule.
- Time controls and disconnect forfeit timeout (placeholder: 120 seconds).
- Bot hosting: client-side WASM or server-side, given GPL-3.0.

