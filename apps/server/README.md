# @takes/server

Authoritative WebSocket game server for Takes invite-link multiplayer [impl.md "Server"; M4].
HTTP + WS on one port (default `8787`), WS path `/ws`.

## Run

```
pnpm --filter @takes/server start
```

Env vars:
- `PORT` (default 8787)
- `DB_PATH` (default `./takes.db`; `:memory:` for ephemeral/tests)
- `FORFEIT_MS` (default 120000) — disconnect forfeit timeout [impl.md, 120s default]
- `WEB_DIST` — optional path to `apps/web/dist` to serve statically
- `FSF_PATH` — Fairy-Stockfish binary override (default `~/programs/Fairy-Stockfish/src/stockfish`)
- `TAKES_DEBUG` — if set, logs internal errors to stderr (never sent to clients)

## Room lifecycle

Implements the message flow in `packages/protocol`: `create_room` / `join_room` / `resume`,
`submit_setup` (validated per-room-ruleset, color-specific), hidden-until-ready setups,
`game_start`, move validation via `@takes/engine`, `resign` / `offer_draw` / `accept_draw`,
reconnect via session token, and disconnect forfeit after `FORFEIT_MS`.

## Persistence

`better-sqlite3`, tables `rooms`, `seats` (token **hashes** only, sha256), `moves`, `results`.
On restart, in-progress rooms are reloaded by replaying their move log through a fresh
`@takes/engine` game (see `RoomManager.reloadFromDb`).

## Bots (D12)

Per DECISIONS D12, the bot is native Fairy-Stockfish running on the server, behind a
`BotEngine` interface (`src/bot/fsf-bot.ts`). The Takes engine remains sole authority for game
end; every bot move is validated with `game.parseUci` before being applied, with a deterministic
legal-move fallback on rejection (logged as a parity bug via `RoomManager.rejectedBotMoves`).

**Bot rooms:** `create_room` accepts a `bot?: 'easy'|'medium'|'hard'` field (protocol field, no
hack suffix). The human gets the opposite color from any requested `color`, and the bot's seat
uses a shipped profile from `bots/profiles.json`.

Difficulty maps to Fairy-Stockfish `Skill Level` + `movetime`:
- easy: Skill 0, 100ms
- medium: Skill 8, 300ms
- hard: Skill 20, 1000ms

If the Fairy-Stockfish binary is not found, bot room creation fails with a clear `error` message
rather than silently falling back.
