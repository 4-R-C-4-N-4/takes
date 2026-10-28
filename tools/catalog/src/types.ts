/** CONTRACT shared by tools/catalog (producer) and tools/scenarios (consumer). See docs/catalog/PLAN.md. */
import type { Piece, Tier } from '@takes/library';

export type Family =
  | 'stepper' | 'slider' | 'leaper' | 'step-leap' | 'slide-leap' | 'split' // move != capture
  | 'forward' | 'pawnlike' | 'sideways';

export interface StaticProfile {
  /** Average quiet+capture destinations over all 64 squares of an empty board (White). */
  mobilityAvg: number;
  mobilityCenter: number;   // average over d4,e4,d5,e5
  mobilityCorner: number;   // average over the four corners
  /** Average number of capture-capable destinations. */
  captureAvg: number;
  colorBound: boolean;
  canRetreat: boolean;      // any move vector with dy < 0
  canSidestep: boolean;     // any move vector with dy === 0
  hasLeap: boolean;
  hasSlide: boolean;
  splitMoveCapture: boolean;
  /** Smallest Jaccard distance of expanded vector set to any piece in the current ruleset (0 = identical). */
  nearestLibraryId: string;
  nearestLibraryDistance: number;
}

export interface CatalogEntry {
  /** Canonical key: sorted expanded White vector set; mirror-canonicalised. */
  key: string;
  /** Generated piece. id = 'c_' + short hash of key; name = Betza; glyph = 'C' placeholder (scenarios assign unique letters). */
  piece: Piece;
  tier: Tier;
  betza: string;
  families: Family[];
  profile: StaticProfile;
}

export interface ScenarioMetrics {
  games: number;
  excluded: number;          // parity/illegal — never scored
  score: number;             // candidate side's points / games
  scoreCI: [number, number]; // nominal bootstrap
  movesPerGame: number;      // candidate moves
  capturesPerGame: number;
  checksPerGame: number;
  forksPerGame: number;      // candidate attacks >=2 enemy pieces worth >=3 or the king after its move
  survival: number;          // fraction of games candidate alive at end
  finalAttack: number;       // fraction of decisive games candidate attacked the mated king's zone in last 6 plies
  avgPlies: number;
  decisive: number;          // fraction non-draw
}

export interface ScreenedEntry extends CatalogEntry { metrics: ScenarioMetrics; replaced: string; stage: 'B' | 'C' }
