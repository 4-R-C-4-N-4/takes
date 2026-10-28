import type { Color } from '@takes/library';

/** The Lobby's "You play" choice is the player's colour; the in-browser CPU takes the other side. */
export function cpuColorFor(playerSide: Color): Color {
  return playerSide === 'w' ? 'b' : 'w';
}
