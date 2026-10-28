/** Hand-written stand-in for the real catalog producer (tools/catalog, built in parallel).
 * Small, representative CatalogEntry fixtures covering stepper/leaper/slide-leap/split/forward/weak
 * families so tools/scenarios can be developed and tested before loadCatalog() exists. */
import type { Piece } from '@takes/library';
import type { CatalogEntry, Family, StaticProfile } from '@takes/catalog';

function profile(over: Partial<StaticProfile> = {}): StaticProfile {
  return {
    mobilityAvg: 4, mobilityCenter: 4, mobilityCorner: 2, captureAvg: 4,
    colorBound: false, canRetreat: false, canSidestep: true, hasLeap: false, hasSlide: true,
    splitMoveCapture: false, nearestLibraryId: 'rook', nearestLibraryDistance: 0.5,
    ...over,
  };
}

function entry(piece: Piece, families: Family[], betza: string, over: Partial<StaticProfile> = {}): CatalogEntry {
  return { key: `fixture:${piece.id}`, piece, tier: piece.tier, betza, families, profile: profile(over) };
}

const wazir: Piece = {
  id: 'f_wazir', name: 'Wazir', glyph: 'C', tier: 'pawn',
  components: [{ vec: [0, 1], sym: 'all', range: 1, path: 'slide', mode: 'both' }],
};

const ferz: Piece = {
  id: 'f_ferz', name: 'Ferz', glyph: 'C', tier: 'pawn',
  components: [{ vec: [1, 1], sym: 'all', range: 1, path: 'slide', mode: 'both' }],
};

const commoner: Piece = {
  id: 'f_commoner', name: 'Commoner', glyph: 'C', tier: 'minor',
  components: [
    { vec: [0, 1], sym: 'all', range: 1, path: 'slide', mode: 'both' },
    { vec: [1, 1], sym: 'all', range: 1, path: 'slide', mode: 'both' },
  ],
};

const archbishop: Piece = {
  id: 'f_archbishop', name: 'Archbishop', glyph: 'C', tier: 'major',
  components: [
    { vec: [1, 1], sym: 'all', range: Infinity, path: 'slide', mode: 'both' },
    { vec: [1, 2], sym: 'all', range: 1, path: 'leap', mode: 'both' },
  ],
};

const splitMover: Piece = {
  id: 'f_mNcB', name: 'Bishop-Knight split', glyph: 'C', tier: 'minor',
  components: [
    { vec: [1, 2], sym: 'all', range: 1, path: 'leap', mode: 'move' },
    { vec: [1, 1], sym: 'all', range: Infinity, path: 'slide', mode: 'capture' },
  ],
};

const toad: Piece = {
  id: 'f_toad', name: 'Toad', glyph: 'C', tier: 'minor',
  components: [
    { vec: [2, 0], sym: 'all', range: 1, path: 'leap', mode: 'both' },
    { vec: [1, 1], sym: 'all', range: 1, path: 'slide', mode: 'both' },
  ],
};

const heron: Piece = {
  id: 'f_heron', name: 'Heron', glyph: 'C', tier: 'minor',
  components: [
    { vec: [2, 2], sym: 'all', range: 1, path: 'leap', mode: 'both' },
    { vec: [0, 1], sym: 'all', range: 1, path: 'slide', mode: 'both' },
  ],
};

/** Forward-only rook: slides forward and sideways, never backward. */
const forwardRook: Piece = {
  id: 'f_fR', name: 'Forward Rook', glyph: 'C', tier: 'rook',
  components: [{ vec: [0, 1], sym: ['f', 'l', 'r'], range: Infinity, path: 'slide', mode: 'both' }],
};

/** Weak piece: moves like a wazir but captures like a ferz (split move/capture, low power). */
const weakSplit: Piece = {
  id: 'f_mWcF', name: 'Weak Split', glyph: 'C', tier: 'pawn',
  components: [
    { vec: [0, 1], sym: 'all', range: 1, path: 'slide', mode: 'move' },
    { vec: [1, 1], sym: 'all', range: 1, path: 'slide', mode: 'capture' },
  ],
};

export const FIXTURE_CATALOG: CatalogEntry[] = [
  entry(wazir, ['stepper'], 'W', { hasLeap: false, mobilityAvg: 2, captureAvg: 2 }),
  entry(ferz, ['stepper', 'pawnlike'], 'F', { colorBound: true, mobilityAvg: 2, captureAvg: 2 }),
  entry(commoner, ['stepper'], 'WF', { mobilityAvg: 4, captureAvg: 4 }),
  entry(archbishop, ['slide-leap'], 'BN', { hasLeap: true, mobilityAvg: 10, captureAvg: 10 }),
  entry(splitMover, ['split', 'step-leap'], 'mNcB', { splitMoveCapture: true, hasLeap: true, mobilityAvg: 6 }),
  entry(toad, ['step-leap'], 'DF', { hasLeap: true, mobilityAvg: 6 }),
  entry(heron, ['step-leap'], 'AW', { hasLeap: true, mobilityAvg: 6 }),
  entry(forwardRook, ['forward', 'slider'], 'fRlr', { canRetreat: false, mobilityAvg: 7 }),
  entry(weakSplit, ['split', 'pawnlike'], 'mWcF', { splitMoveCapture: true, mobilityAvg: 2, captureAvg: 2 }),
];
