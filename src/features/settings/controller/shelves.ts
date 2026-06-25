import type { PlatformCollection, PlatformTab } from "../../../runtime/platform";
import type { Settings, Shelf, ShelfFilter, ShelfSource } from "../../../types";
import { addShelfToSettings, deleteShelfFromSettings, moveShelf, normalizeFilter, patchShelfInSettings } from "../../../domain/settings";
import { createDefaultShelf, createDefaultSource, randomShelfId } from "../../../domain/defaults";
import { DEFAULT_SHELF_TEMPLATES } from "../../../domain/templates";
import { writeJsonFile, readJsonFile } from "../../../settingsStore";
import { notify } from "../../../components/notify";
import { trackFeature } from "../../../steam/usageTracking";

export interface ShelvesDeps {
  liveSettings: () => Settings | null;
  persist: (next: Settings) => Promise<boolean>;
  setSelectedId: (id: string | null) => void;
  selectedId: string | null;
  collections: PlatformCollection[];
  tabs: PlatformTab[];
  shelves: Shelf[];
  t: (key: string) => string;
}

export function createShelfActions(deps: ShelvesDeps) {
  const { liveSettings, persist, setSelectedId, collections, tabs, shelves, t } = deps;

  const patchShelfFn = async (id: string, patch: Partial<Shelf>) => {
    const s = liveSettings();
    if (!s) return;
    const shelf = s.shelves.find((sh) => sh.id === id);
    if (!shelf) return;
    const patched = { ...shelf, ...patch };
    if (JSON.stringify(shelf) === JSON.stringify(patched)) return;
    await persist(patchShelfInSettings(s, id, patch));
  };

  return {
    async addShelf(): Promise<Shelf | undefined> {
      const s = liveSettings();
      if (!s) return;
      const shelf: Shelf = { ...createDefaultShelf(collections[0]?.id ?? "", t("new_shelf")), title: t("new_shelf") };
      await persist(addShelfToSettings(s, shelf));
      setSelectedId(shelf.id);
      try { trackFeature("shelf_create"); } catch {}
      return shelf;
    },
    createDraftShelf(): Shelf {
      return { ...createDefaultShelf(collections[0]?.id ?? "", t("new_shelf")), title: t("new_shelf") };
    },
    async commitShelf(shelf: Shelf): Promise<Shelf | undefined> {
      const s = liveSettings();
      if (!s) return;
      await persist(addShelfToSettings(s, shelf));
      setSelectedId(shelf.id);
      try { trackFeature("shelf_create"); } catch {}
      return shelf;
    },
    async exportShelves(destPath: string): Promise<boolean> {
      const s = liveSettings();
      if (!s) return false;
      try { trackFeature("export"); } catch {}
      return writeJsonFile(destPath, JSON.stringify({ state: { shelves: s.shelves } }, null, 2));
    },
    async importShelves(srcPath: string): Promise<boolean> {
      const s = liveSettings();
      if (!s) return false;
      const raw = await readJsonFile(srcPath);
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw);
        const imported = parsed?.state?.shelves ?? parsed?.shelves;
        if (!Array.isArray(imported)) return false;
        await persist({ ...s, shelves: imported });
        if (imported[0]?.id) setSelectedId(imported[0].id);
        try { trackFeature("import"); } catch {}
        return true;
      } catch { return false; }
    },
    async resetShelves() {
      const s = liveSettings();
      if (!s) return;
      await persist({ ...s, shelves: [] });
      setSelectedId(null);
      notify("reset", { body: t("toast_shelves_reset") });
    },
    async createDefaultShelves() {
      const s = liveSettings();
      if (!s) return;
      let next: Settings = { ...s, enabled: true };
      for (const tpl of DEFAULT_SHELF_TEMPLATES) {
        const shelf: Shelf = { ...createDefaultShelf(), title: t(tpl.titleKey), source: tpl.source };
        next = addShelfToSettings(next, shelf);
      }
      await persist(next);
      setSelectedId(next.shelves[0]?.id ?? null);
    },
    async addShelfWith(title: string, source: ShelfSource): Promise<Shelf | undefined> {
      const s = liveSettings();
      if (!s) return;
      const shelf: Shelf = { ...createDefaultShelf(), title, source };
      await persist(addShelfToSettings(s, shelf));
      setSelectedId(shelf.id);
      try { trackFeature("shelf_create"); } catch {}
      return shelf;
    },
    patchShelf: patchShelfFn,
    async duplicateShelf(id: string) {
      const s = liveSettings();
      if (!s) return;
      const sourceShelf = s.shelves.find((item) => item.id === id);
      if (!sourceShelf) return;
      const duplicate: Shelf = JSON.parse(JSON.stringify(sourceShelf));
      duplicate.id = randomShelfId();
      duplicate.title = `${sourceShelf.title} ${t("copy_suffix")}`.trim();
      await persist(addShelfToSettings(s, duplicate, id));
      setSelectedId(duplicate.id);
      try { trackFeature("shelf_create"); } catch {}
    },
    async removeShelf(id: string) {
      const s = liveSettings();
      if (!s) return;
      const next = deleteShelfFromSettings(s, id);
      await persist(next);
      try { trackFeature("shelf_delete"); } catch {}
      // selectedId is captured per-render so the caller passes the
      // current value through `deps`. Snapshot semantics preserved.
      if (deps.selectedId === id) setSelectedId(next.shelves[0]?.id ?? null);
    },
    async moveShelf(id: string, dir: -1 | 1) {
      const s = liveSettings();
      if (!s) return;
      await persist(moveShelf(s, id, dir));
    },
    async reorderShelfIds(ids: string[]) {
      const s = liveSettings();
      if (!s) return;
      const byId = new Map(s.shelves.map((sh) => [sh.id, sh] as const));
      const reordered = ids.map((id) => byId.get(id)).filter(Boolean) as Shelf[];
      if (reordered.length !== s.shelves.length) return;
      await persist({ ...s, shelves: reordered });
    },
    async toggleShelfHidden(id: string) {
      const shelf = shelves.find((item) => item.id === id);
      if (!shelf) return;
      await patchShelfFn(id, { hidden: !shelf.hidden });
    },
    async patchFilter(id: string, patch: Partial<ShelfFilter>) {
      const shelf = shelves.find((item) => item.id === id);
      if (!shelf || shelf.source.type !== "filter") return;
      await patchShelfFn(id, { source: { type: "filter", filter: { ...normalizeFilter(shelf.source), ...patch } } });
    },
    async setSourceType(id: string, type: "collection" | "tab" | "filter") {
      if (type === "collection") {
        const first = collections[0];
        await patchShelfFn(id, { source: createDefaultSource("collection", first?.id ?? "") });
        return;
      }
      if (type === "tab") {
        const firstTab = tabs[0] ?? { id: "favorites", name: t("tabs_favorites") };
        await patchShelfFn(id, { source: { type: "tab", tab: firstTab.id } });
        return;
      }
      await patchShelfFn(id, { source: createDefaultSource("filter") });
    },
  };
}
