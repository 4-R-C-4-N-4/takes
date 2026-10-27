# Browser verification on integrated main

2026-10-27. The orchestrator ran verify.cjs outside the Codex sandbox, first on the recovery branch, then on integrated main with the redesigned art. The earlier README records the worker's sandbox limitations, not the final verification status.

Actual output on integrated main:

    desktop: tap/place, budget/issues, drag/place/move/remove, save/load/navigation/import, library, four hotseat plies, flip, overflow PASS
    phone: tap/place, budget/issues, drag/place/move/remove, save/load/navigation/import, library, four hotseat plies, flip, overflow PASS

Headless Chrome, Playwright, desktop 1280x800 and phone 390x844. Phone selection uses native taps; drag uses mouse Pointer Events at both sizes, so physical touch drag remains unverified. Checked rank 3 is visually above rank 1, a pawn on rank 3 is valid, live budget/errors, save/edit/import/profile changes, Library highlight changes, four hotseat moves, flip and no horizontal overflow. The six PNGs in this directory were regenerated against integrated main including art-v2.

`pnpm check`: zero errors and zero warnings. `pnpm test`: 181 passed, 19 files, 36.61s. `pnpm serve` successfully builds and starts the app on a temporary database.
