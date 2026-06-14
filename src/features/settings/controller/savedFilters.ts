import type { FilterGroup, SavedFilter, SavedSmartFilter, Settings } from "../../../types";

export interface SavedFilterDeps {
  liveSettings: () => Settings | null;
  persist: (next: Settings) => Promise<boolean>;
}

export function createSavedFilterActions(deps: SavedFilterDeps) {
  const { liveSettings, persist } = deps;
  return {
    async saveFilter(name: string, group: FilterGroup): Promise<SavedFilter | null> {
      const s = liveSettings();
      if (!s) return null;
      const trimmed = (name || "").trim().slice(0, 64);
      if (!trimmed) return null;
      const id = `sf_${Math.random().toString(36).slice(2, 10)}`;
      const entry: SavedFilter = { id, name: trimmed, group };
      const existing = s.savedFilters ?? [];
      await persist({ ...s, savedFilters: [...existing, entry] });
      return entry;
    },
    async deleteSavedFilter(id: string) {
      const s = liveSettings();
      if (!s) return;
      const next = (s.savedFilters ?? []).filter((f) => f.id !== id);
      await persist({ ...s, savedFilters: next });
    },
    async renameSavedFilter(id: string, name: string) {
      const s = liveSettings();
      if (!s) return;
      const trimmed = (name || "").trim().slice(0, 64);
      if (!trimmed) return;
      const next = (s.savedFilters ?? []).map((f) => (f.id === id ? { ...f, name: trimmed } : f));
      await persist({ ...s, savedFilters: next });
    },
    // Mirrors saveFilter / deleteSavedFilter / renameSavedFilter shape so
    // the QAM list and EditSmartShelfModal can manage the saved-smart-
    // filter catalogue with the same vocabulary.
    async saveSmartFilter(name: string, payload: Omit<SavedSmartFilter, "id" | "name">): Promise<SavedSmartFilter | null> {
      const s = liveSettings();
      if (!s) return null;
      const trimmed = (name || "").trim().slice(0, 64);
      if (!trimmed) return null;
      const id = `ssf_${Math.random().toString(36).slice(2, 10)}`;
      const entry: SavedSmartFilter = { id, name: trimmed, ...payload };
      const existing = s.savedSmartFilters ?? [];
      await persist({ ...s, savedSmartFilters: [...existing, entry] });
      return entry;
    },
    async deleteSavedSmartFilter(id: string) {
      const s = liveSettings();
      if (!s) return;
      const next = (s.savedSmartFilters ?? []).filter((f) => f.id !== id);
      await persist({ ...s, savedSmartFilters: next });
    },
    async renameSavedSmartFilter(id: string, name: string) {
      const s = liveSettings();
      if (!s) return;
      const trimmed = (name || "").trim().slice(0, 64);
      if (!trimmed) return;
      const next = (s.savedSmartFilters ?? []).map((f) => (f.id === id ? { ...f, name: trimmed } : f));
      await persist({ ...s, savedSmartFilters: next });
    },
  };
}
