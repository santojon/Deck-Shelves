import { ALL_CATEGORY_IDS } from "./settingsCategories";

export type LegacyScope = "all" | "shelves" | "smart";

export function categoryIdsForScope(scope: LegacyScope): ReadonlyArray<string> {
  if (scope === "shelves") return ["shelves"];
  if (scope === "smart") return ["smart"];
  return ALL_CATEGORY_IDS;
}
