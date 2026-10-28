# Takes

Chess with armies you design. Each player secretly builds a three-rank setup from a points budget,
choosing from a roster of data-defined pieces, then both setups are revealed and the game is played
under normal chess rules: a piece always captures by landing on the square it takes.

Play it in the browser on the tiny-games shelf: https://4-r-c-4-n-4.github.io/tiny-games/takes/

## Pieces are labelled by how they move

The roster (ruleset `2026.3`) is the five classics plus 20 pieces chosen from a screened catalog of
56,211 movement patterns. Pieces are named by Betza movement shorthand first: `B3N` slides like a
bishop up to three squares and also jumps like a knight. Nicknames such as *Scarab* are secondary.
Above the pawn tier every piece is left/right and front/back symmetric, so its threats look the same
whichever way it faces (docs/DECISIONS.md, D19).

## Repository

| Path | What |
| --- | --- |
| `packages/library` | Piece definitions and immutable, versioned rulesets |
| `packages/engine` | Rules engine (move generation, castling, promotion, game end), perft-tested |
| `packages/validator` | Setup and piece validation |
| `packages/art` | Piece art (hand-traced set and the procedural fallback) |
| `packages/protocol` | Online wire protocol |
| `apps/web` | Svelte 5 app: play vs CPU, hotseat, online, army builder, piece library |
| `apps/server` | Optional Node server: online rooms over WebSocket, Fairy-Stockfish bots |
| `tools/` | Betza/Fairy-Stockfish exporter, perft parity, piece catalog and scenario screening |
| `docs/` | Spec, decisions (`DECISIONS.md`), production plan, catalog results, art sheets |

## Develop

Node 22 and pnpm 9.

```sh
pnpm install
pnpm check            # TypeScript + svelte-check
pnpm test             # vitest; Fairy-Stockfish parity tests run when the binary is present
pnpm serve            # build the web app and serve it with the Node server on :8787
```

Fairy-Stockfish (GPL-3.0) is never bundled. The optional server and research tools run it as a
separate binary (`FSF_PATH` or `~/programs/Fairy-Stockfish/src/stockfish`).

## License

Apache-2.0. See `LICENSE`.
