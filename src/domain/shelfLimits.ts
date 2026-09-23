/* Single source of truth for "how many games a shelf can hold" — shared by
   the shelf editors' UI ceiling and the screensaver's pool sizing, which
   previously hardcoded their own separate numbers and drifted apart. */

// Matches `ShelfSchema.limit`'s zod default (src/types.ts) — used where a
// shelf's own `limit` is missing/malformed rather than actually unlimited.
export const DEFAULT_SHELF_LIMIT = 20;

// Per-shelf card-count ceiling offered in the shelf/Smart Shelf editors
// (EditShelfModal.tsx / EditSmartShelfModal.tsx sliders).
export const SHELF_LIMIT_MAX = 50;
