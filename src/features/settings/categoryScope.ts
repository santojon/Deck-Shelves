/* Maps the legacy "shelves" / "smart" / "all" scope used by the per-area
   Export / Import / Reset modals to the shared SETTINGS_CATEGORIES set
   the unified modal exposes. Centralises the mapping so every entry
   point goes through the same picker / merge / reset code path. */

import { ALL_CATEGORY_IDS } from "./settingsCategories";

export type LegacyScope = "all" | "shelves" | "smart";

export function categoryIdsForScope(scope: LegacyScope): ReadonlyArray<string> {
  if (scope === "shelves") return ["shelves"];
  if (scope === "smart") return ["smart"];
  return ALL_CATEGORY_IDS;
}
