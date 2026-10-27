# Takes polish verification — 2026-10-27

Status: implementation fixes and static checks complete; real browser verification **blocked by sandbox socket restrictions**. No screenshots were produced. Do not treat the browser scenarios below as passed.

Preserved the existing UI, rank labels (rank 3 above rank 1), and legal rank-3 pawns. Changes are confined to `apps/web/**` and this directory; no commits or pushes.

## Fixes and audit

- Builder now waits for 6 px of pointer movement before dragging, preserving click/tap selection. Completed drags consume their compatibility click. Pointer cancellation/unmount clean up listeners; palette touch gestures use the shared Pointer Events path.
- Builder reacts to profile ID changes, loads the selected setup/name, and resets when navigating to a new builder. This removes the captured `profileId` warning.
- Profiles transfers pasted setup strings through session storage instead of discarding them. Profile rows and the paste controls wrap on narrow screens.
- Game passes game/selection/last-move dependencies explicitly to board render helpers. Compiler inspection confirmed the previous board-pieces getter was wrapped in `$.untrack(boardPieces)` with no tracked dependency; the new getter tracks `game`. See `reactivity-output.txt`. The reveal timeout is cleared on unmount.
- Seed profiles load before child screens initialize, so directly opening Profiles or Lobby on first visit sees them.
- Audited Library: its preview derived value already tracks selected piece/origin through compiled reactive reads; no rewrite needed. Profiles list mutations already assign refreshed arrays.

## Checks and evidence

- `pnpm check`: exit 0, **0 errors, 0 warnings** (`check-output.txt`).
- `pnpm --filter @takes/web build`: exit 0, 149 modules transformed (`build-output.txt`). Vite reports its existing default Svelte configuration notice.
- `pnpm test`: reaches `RUN v5.0.5` and stalls without reporting tests. The initial combined command was interrupted; a threads/single-worker attempt also stalled. A final exact-command retry was limited to 60 seconds and exited 124 (`test-output.txt`). No test pass claim.
- `node --check docs/screens/polish/verify.cjs` and `git diff --check`: pass.
- Requested `PORT=43187 DB_PATH=$TMPDIR/takes-polish-43187.db pnpm serve`: build succeeds, then tsx fails with `listen EPERM` on its IPC socket (`server-output.txt`). Bypassing the tsx CLI via Node's loader also fails with `listen EPERM 0.0.0.0:43187`.
- No browser tools were exposed. Local Playwright was found at `/home/ivy/.hermes/hermes-agent/venv/lib/python3.11/site-packages/playwright/driver/package`.
- Installed Chrome `/home/ivy/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome` fails with `setsockopt: Operation not permitted` and SIGTRAP (`browser-output.txt`). Chromium Headless Shell independently fails with `shutdown: Operation not permitted` (`headless-shell-output.txt`). Both fail before opening a page, including with `--no-sandbox`.

## Browser follow-up

`verify.cjs` is a syntax-checked **unexecuted** Playwright verification script. Run from the repository root in an environment permitting browser/server sockets, with the server running separately:

```sh
PORT=43187 DB_PATH=$TMPDIR/takes-polish-43187.db pnpm serve
```

In another terminal:

```sh
PLAYWRIGHT_MODULE=/home/ivy/.hermes/hermes-agent/venv/lib/python3.11/site-packages/playwright/driver/package \
CHROME_BIN=/home/ivy/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome \
node docs/screens/polish/verify.cjs
```

The script checks desktop 1280×800 and phone 390×844, native taps on phone, pointer drags from palette to board / board to board / off-board, live cost/issues, legal rank-3 pawn, valid save/reopen, profile-ID navigation, setup import, Library preview updates, four hotseat plies and board flip, page errors, and horizontal overflow. Drags use mouse Pointer Events on both viewport sizes; physical touch dragging remains a manual check. It writes builder-invalid, builder-valid, and hotseat PNGs for each viewport. Confirm the script passes before claiming these scenarios verified.

All launched server/browser attempts exited; no owned server or browser remains. Test runners were terminated on timeout/interruption.
