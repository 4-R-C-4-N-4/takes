# Path to production: Takes on the tiny-games site

Target: `https://4-r-c-4-n-4.github.io/tiny-games/takes/`, listed automatically on the
site's Games section. Fully static hosting, with online games played peer-to-peer and
joined by sharing a lobby code.

## What the site expects (checked against the repos)

- `4-R-C-4-N-4/tiny-games` (public) builds every game in one Pages workflow
  (`.github/workflows/deploy.yml`) into `_site/<slug>/`. Each game provides:
  - `<slug>.html`: a self-contained single file, which the cabinet embeds in an iframe.
  - `index.html`: the fullscreen page.
  - `game.json`: name, rune, tagline and note. It feeds `/tiny-games/games.json`.
- The ARCANA site (`4-R-C-4-N-4.github.io`) renders cabinets from that manifest, so it
  needs no edits.
- The house rule (tiny-games `CONTEXT.md`) is "no backend, nothing phoned home at play time".
  - Single-player and hotseat meet it fully: the CPU already runs in the browser.
  - Online play needs one handshake through public signalling relays. After that, moves
    travel directly between browsers. The game card should say so.

## What changes in Takes

### 1. Static build (about half a day)
- Production Play modes are vs CPU (in-browser Easy/Medium/Hard), hotseat, and online P2P.
  - The server-side Fairy-Stockfish bot stays a dev and research tool. It is GPL, native,
    and needs a server.
- Keep the Lab (Candidates) and its 2 MB of screen data out of the production build,
  behind a build flag.
- Single-file output (`vite-plugin-singlefile` or the tiny-games `bundle-single.mjs`):
  - Inline latin-subset fonts as base64.
  - Target under about 500 kB.
  - The hash router already works under any base path.
- Add `game.json`.
- Prod CI runs the typecheck and tests. The Fairy-Stockfish parity tests skip themselves
  when the binary is absent.

### 2. Peer-to-peer online play (about 2 days)
- **Transport seam.** `net/online-game.ts` talks to a `Transport` interface. It has two
  implementations:
  - WebSocket to the existing server (kept for dev and self-hosting).
  - WebRTC via Trystero (MIT, public Nostr relays, no account).
- **Host-authoritative room.** The room state machine moves out of `apps/server/src/rooms.ts`
  into a pure `RoomCore`, with no sqlite, ws or Fairy-Stockfish. The host's browser runs it.
  - The guest sends the same `ClientMsg`s.
  - The host answers with the same `ServerMsg`s, so the protocol, validator and parser are
    reused unchanged.
  - The guest also replays every move in its own engine and flags any illegal state.
    Cheating then means breaking your own client, not your opponent's.
- **Blind setups need commit-reveal.** Without a neutral server, the host would see the
  guest's army first. So:
  1. Each side sends `SHA-256(setup + salt)`.
  2. Once both commitments arrive, each side reveals its setup.
  3. Each side verifies the other's reveal against its commitment.
- **Lobby code.**
  - The existing 6-character invite code is the room id, namespaced by app id and ruleset
    version.
  - The share link is `…/tiny-games/takes/#/join/CODE`.
  - The code doubles as Trystero's room password, so relays can't read the handshake.
  - Peers on different ruleset versions are refused with a clear message.
- **Reconnect.**
  - Both peers keep setups and the move list in localStorage under the code.
  - Rejoining the room resyncs by replaying the moves. This follows the existing
    "resume by replay, never mid-game FEN" rule.
  - Without a neutral server there is no forfeit timer. Show the opponent as
    disconnected and let a player leave or claim the game after a timeout.
- **Known limit.** Connections use STUN only. Roughly 10–20% of networks (strict corporate
  NAT, some mobile carriers) can't connect without a TURN relay, which needs a host and
  usually money. Detect the failure and say so; add TURN later if it matters.

### 3. Deploy (about half a day)
- Publish into tiny-games (decision below), add the workflow block, and confirm the
  manifest picks it up.
- Verify on the real Pages URL:
  - two browsers;
  - a phone on cellular against desktop wifi;
  - embedded cabinet and fullscreen;
  - reload mid-game on both sides.

### 4. Pre-launch polish (about half a day)
- A short how-to-play page covering the setup zone, the budget, the shorthand
  notation and promotion.
- Card copy and privacy note: online play uses public relays for the handshake only.

Total: about 3½ days of agent work.

## Decisions needed
1. **Source visibility.** `takes` is private; tiny-games is public and builds from source.
   - (a) Move the web app and packages into `tiny-games/takes/` (source becomes public;
     add a licence).
   - (b) Keep `takes` private, and have its CI push the built single file into tiny-games
     with a deploy token.
   - (c) Make `takes` public and serve it from its own Pages path, like OpenXOPS.
2. **Signalling.** Public Nostr relays (zero infrastructure, the default), or a tiny relay
   you host (more reliable, but it is a backend).
