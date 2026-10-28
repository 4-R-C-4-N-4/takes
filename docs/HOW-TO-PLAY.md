# Takes: how to play

Takes is chess with an army you build. Win by checkmating the enemy king. Except for en passant,
a capturing piece always lands on the square it captures.

## Start quickly

Choose **Vanilla** on the Play screen to use the familiar chess army. Select your colour and an
Easy, Medium or Hard in-browser CPU, then press **Play**. **Hotseat** lets two people use one device.
The Library shows each piece's movement and attack squares; tap a different preview square to move
its origin.

## Build an army

- Open **Builder** and fill any of your three starting ranks. The bottom row is your back rank;
  the top row is rank 3. Pieces do not have to copy a standard chess opening.
- Spend at most **39 points**. Unspent points are allowed. Costs are experimental balance choices,
  not measured values; future ruleset versions may adjust them.
- Place exactly one king on the back rank. The Builder rejects exposed kings and shows the other
  setup errors before you save.
- Queen, Coroner (BN), Hierophant (RN) and Bane (RBN) are each limited to one per army.
- Tap a palette piece, then tap board squares to place repeated copies. Tap the palette entry again
  to deselect it. Dragging also works. Save the army with a name; choose it on Play.

## Read movement shorthand

Non-classic pieces use movement notation first and a nickname second. Examples:

| Notation | Movement |
| --- | --- |
| R | Rook: orthogonal slides |
| B | Bishop: diagonal slides |
| N | Knight jump |
| R2 | Orthogonal slides, at most two squares |
| B3N | Diagonal slides up to three squares, plus knight jumps (Scarab) |
| RBN | Rook, bishop and knight movement combined (Bane) |
| W / F | One square orthogonally / diagonally |
| D / A | Jump exactly two squares orthogonally / diagonally, over the adjacent square |
| f / v / s | Forward-only / vertical-only / sideways-only modifier on the following movement |
| fR3fB3 | Up to three squares forward, straight or diagonally (Triton) |

Sliders cannot pass through pieces; jumpers can. Forward is relative to the owner, so Black's
forward direction is toward White. Above pawn tier, all current pieces mirror left/right and
forward/backward. Current non-classic pieces capture with the same movement they use for quiet moves.
The standard pawn keeps its usual quiet/capture distinction.

## Castling and promotion

Castling uses your king and its eligible rook-tier partner, with the king/partner ending on the
usual castled files. Starting partners are fixed at game start. The Builder identifies the partners;
castling still requires the normal clear-path and king-safety conditions.

All pawn-tier pieces promote on reaching the far rank. Promotion choices come from the non-pawn
pieces in **your own starting army**; if none exist the ruleset supplies its fallback (Queen).
Prince (WF) is an ordinary capturable piece with king-like movement, not a second royal king.

## Play a friend online

1. Each player opens Takes in their own browser.
2. The host selects an army and presses **Create game**. In this first version the host is White.
3. Share the invite link privately. The other player opens it, chooses an army, and joins as Black.
   Alternatively, enter the code on Play.
4. Both armies are committed before either is revealed. Once connected, play normally.

Moves are checked by the host and independently replayed by the guest. Each browser saves its own
session locally, so reloading the same game URL in that browser can resume it. Keep the host tab
open during play. Don't open a second copy of the same seat in another tab.

### Privacy and limitations

Public Nostr relays exchange connection details; moves travel over an encrypted WebRTC data channel.
Public STUN services assist connection setup. Relays and your opponent can learn connection metadata;
WebRTC can expose your public IP address to your opponent. The invite code is a shared secret—anyone
with it may try to join. There are no accounts, ratings or trusted server adjudication.

Some networks block direct WebRTC connections. There is no TURN relay fallback yet, so a failed
connection may require another network. Public relays may also be unavailable. Reload/resume is
not cloud storage: clearing site data, using another browser, or losing both copies of a session can
lose the game. A disconnect is not proof of a loss or a win.
