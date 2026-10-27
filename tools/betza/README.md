# @takes/betza

Component → Betza exporter, Fairy-Stockfish `variants.ini` generator, and a minimal FSF perft driver used by tools and tests.

- FSF binary: `$FSF_PATH`, or `~/programs/Fairy-Stockfish/src/stockfish` by default. Build it from source with `make -j build ARCH=x86-64-avx2` in `src/`. If the binary is missing, the FSF tests are skipped.
- The vanilla pawn exports as FSF's built-in `pawn`, because FSF Betza has no `i` modifier. FSF's default `doubleStepRegion` (`*2`/`*7`) matches spec rank2.
- Not supported (they throw `BetzaUnsupported`): directional oblique leapers (N/C/Z with a `sym` subset), riders other than W/F slides (D3), and `cond` on custom pieces.
- Round-trip test (M5): every library piece is checked from every square against FSF, with blocker rings at Chebyshev distance 1–8. Its move set must equal an independent reference movegen.
