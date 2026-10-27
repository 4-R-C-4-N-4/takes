# Verification screenshots

Captured in a real browser (two independent sessions, `p1` and `p2`) against the server built with
`pnpm --filter @takes/web build && WEB_DIST=.../apps/web/dist pnpm --filter @takes/server start`.

1. `01-lobby-invite-waiting.png` — P1 created an invite as White; waiting screen shows the invite
   link, code, and "Opponent not ready yet." (P2's setup is not visible yet — only revealed to P1
   once both are ready, per `stateFor`/`game_start`.)
2. `02-p2-join-game-started.png` — P2 opened `/#/join/<code>`, submitted a profile, and the game
   started immediately for both sides.
3. `03-foolsmate-checkmate-p2.png` / `04-foolsmate-checkmate-p1.png` — scripted fool's mate
   (`f2f3 e7e5 g2g4 d8h4`) played via real square clicks on both boards; both clients show
   `Result: 0-1 (checkmate)`.
4. `05-p2-resume-after-reload.png` — P2's tab was reloaded mid-game (after move 3); the position
   was rebuilt from the server's `resume`/`state` reply, replaying moves client-side.
5. `06-foolsmate-checkmate.png` — final mated position with the king highlighted in check.
6. `07-bot-game-in-progress.png` — a human vs. `easy` bot game (random color draw put the human on
   Black); Fairy-Stockfish replied automatically after each human move.

## Bugs found and fixed during verification

- `Board.svelte`: the highlight overlay `<rect>` had no `pointer-events: none`, so it sat on top of
  the clickable square and silently absorbed clicks whenever a square was highlighted (select/quiet/
  capture/lastmove) — this broke *all* real click-to-move interaction, not just online play.
- `Board.svelte`: piece `<div>`s (inside `foreignObject`) only had a `pointerdown` handler, not
  `click`, so clicking directly on a piece (the common case) never reached the square's `click`
  handler and `onSquareClick` was never called for occupied squares.
- `Game.svelte` (online mode): reassigning the shared `Game` engine instance after `move_made` did
  not reliably re-render `<Board>`'s `pieces`/`highlights` props even though text-only reactive
  expressions updated; wrapped `<Board>` in `{#key renderTick}` (incremented on every online state
  change) to force a redraw.
- `package.json`/server: `WEB_DIST` is read relative to the **server package's** cwd
  (`apps/server`), not the repo root, when run via `pnpm --filter @takes/server start`; the root
  `serve` script now passes `$PWD/apps/web/dist` (absolute) instead of a path relative to root.
