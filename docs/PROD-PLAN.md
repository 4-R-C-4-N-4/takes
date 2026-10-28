# Takes production plan and verification

Target: https://4-r-c-4-n-4.github.io/takes/

## Deployment decisions

- Takes stays in its own public repository, `4-R-C-4-N-4/takes`, under Apache-2.0.
- Its own Pages workflow publishes `apps/web/dist-static/`. The main github.io site's Games
  section links to `/takes/` in a new tab, like OpenXOPS. Nothing is housed in tiny-games and
  there is no iframe requirement.
- Peer discovery uses Trystero's default public Nostr relays. Moves use an encrypted WebRTC
  data channel. No accounts or application backend are required for the public build.

## Implemented

- Static build: `pnpm --filter @takes/web build:static` produces an approximately 618 kB
  self-contained `index.html` (about 311 kB gzip), with embedded fonts and piece SVGs.
  The Lab and native Fairy-Stockfish server bot are excluded. A help page and third-party
  licence notices ship alongside the app.
- Offline modes: in-browser CPU Easy/Medium/Hard, hotseat, Builder, Armies and Library.
  These make no external requests; relays are contacted only after online opt-in.
- `@takes/room`: pure state machine, reused by the optional Node server and browser host.
- Online: host creates a code/link, guest joins with their army. The first release fixes
  host=White, guest=Black. Both sides commit before either reveals its army. Reveals are
  checked against commitments and the setup validator. Guest independently checks every move
  and position hash. Wrong protocol/ruleset peers cannot proceed past the handshake.
- Resume: localStorage saves setups/commitments/moves/results. Host reconstructs by replay;
  guest requires the host's replay to extend its own history. Reloading either browser was
  exercised on a real data channel. No mid-game FEN-only resume.
- Status/disconnect UI, draw offer/accept, resignation and result display.
- Help: `apps/web/public/how-to-play.html`, linked from Play; source copy in `docs/HOW-TO-PLAY.md`.

## Independent verification (2026-10-28)

- `pnpm check`: zero errors or warnings.
- `pnpm test`: 455 tests pass, including native Fairy-Stockfish parity when installed.
- `verify-static.cjs`: desktop 1280×800 and phone 390×844, served under `/takes/`; CPU replies,
  hotseat, Builder, Library, no overflow/page errors/external HTTP or WebSocket traffic.
- `verify-p2p.cjs`: two separate Chromium contexts; real public Nostr signalling and native
  WebRTC, not an in-memory test double. Creates/joins using the actual invite link, plays
  four plies, compares both boards, reloads guest then host, asserts a connected RTC, then
  resigns and verifies the same result on both sides. Passes after hardening fixes.
- Independent code review found and fixed two important defects: guests had verified host
  commitment consistency but not army legality, and mismatched hellos had reported an error
  without actually gating later actions. Both now have regression tests.

## Honest limitations

- The real-browser test used two contexts on one machine. Cellular-vs-Wi-Fi and different
  physical devices remain unverified; do not infer cross-NAT reliability from that test.
- STUN only, no TURN fallback. Some networks cannot connect directly; public relays can be
  unavailable. There is no justified fixed percentage of failures for this application yet.
- Peer play is casual, not server-adjudicated/rated chess. Commitments stop adaptive setup
  changes, not every kind of cheating or host refusal/disconnection. A disconnect is not proof
  of a result. Invite codes are shared capabilities, not accounts.
- Sessions are local, not cloud-saved. Clearing browser storage can lose a game.
- WebRTC exposes connection metadata and can reveal a player's public IP to the opponent.

## Launch gates

1. Final integrated build + static/P2P browser checks + normal-server browser regressions.
2. Review repository history for accidental credentials before making it public.
3. Enable repository Pages, deploy, verify the real HTTPS URL and help/notices files.
4. Add the new-tab Takes card to the main site's `SITE_GAMES`, deploy and verify it.
5. Repeat the browser smoke against the live URL; report remaining cross-network checks.
