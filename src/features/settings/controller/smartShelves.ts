import type { Settings, SmartShelf, SmartShelfMode } from "../../../types";
import { createDefaultSmartShelf } from "../../../domain/defaults";
import { writeJsonFile, readJsonFile } from "../../../settingsStore";
import { notify } from "../../../components/notify";

export interface SmartShelfDeps {
  liveSettings: () => Settings | null;
  persist: (next: Settings) => Promise<boolean>;
  t: (key: string) => string;
}

export function createSmartShelfActions(deps: SmartShelfDeps) {
  const { liveSettings, persist, t } = deps;
  return {
    async setSmartShelvesEnabled(enabled: boolean) {
      const s = liveSettings();
      if (!s || s.smartShelvesEnabled === enabled) return;
      await persist({ ...s, smartShelvesEnabled: enabled });
    },
    async setSmartShelvesAtBottom(atBottom: boolean) {
      const s = liveSettings();
      if (!s || s.smartShelvesAtBottom === atBottom) return;
      await persist({ ...s, smartShelvesAtBottom: atBottom });
    },
    async reorderSmartShelfIds(ids: string[]) {
      const s = liveSettings();
      if (!s) return;
      const byId = new Map((s.smartShelves ?? []).map((sh) => [sh.id, sh] as const));
      const reordered = ids.map((id) => byId.get(id)).filter(Boolean) as SmartShelf[];
      if (reordered.length !== (s.smartShelves ?? []).length) return;
      await persist({ ...s, smartShelves: reordered });
    },
    async addSmartShelf(mode: SmartShelfMode, title: string): Promise<SmartShelf | undefined> {
      const s = liveSettings();
      if (!s) return;
      const shelf = createDefaultSmartShelf(mode, title);
      await persist({ ...s, smartShelves: [shelf, ...(s.smartShelves ?? [])] });
      return shelf;
    },
    createDraftSmartShelf(mode: SmartShelfMode, title: string): SmartShelf {
      return createDefaultSmartShelf(mode, title);
    },
    async commitSmartShelf(shelf: SmartShelf): Promise<SmartShelf | undefined> {
      const s = liveSettings();
      if (!s) return;
      await persist({ ...s, smartShelves: [shelf, ...(s.smartShelves ?? [])] });
      return shelf;
    },
    async removeSmartShelf(id: string) {
      const s = liveSettings();
      if (!s) return;
      await persist({ ...s, smartShelves: (s.smartShelves ?? []).filter((sh) => sh.id !== id) });
    },
    async toggleSmartShelfHidden(id: string) {
      const s = liveSettings();
      if (!s) return;
      const updated = (s.smartShelves ?? []).map((sh) => sh.id === id ? { ...sh, hidden: !sh.hidden } : sh);
      await persist({ ...s, smartShelves: updated });
    },
    async patchSmartShelf(id: string, patch: Partial<SmartShelf>) {
      const s = liveSettings();
      if (!s) return;
      const list = s.smartShelves ?? [];
      const current = list.find((sh) => sh.id === id);
      if (!current) return;
      const next = { ...current, ...patch };
      if (JSON.stringify(current) === JSON.stringify(next)) return;
      const updated = list.map((sh) => sh.id === id ? next : sh);
      await persist({ ...s, smartShelves: updated });
    },
    async setSmartSurpriseMe(enabled: boolean) {
      const s = liveSettings();
      if (!s || s.smartSurpriseMe === enabled) return;
      await persist({ ...s, smartSurpriseMe: enabled });
    },
    async setSmartSurpriseMeCount(count: number) {
      const s = liveSettings();
      if (!s || s.smartSurpriseMeCount === count) return;
      await persist({ ...s, smartSurpriseMeCount: Math.max(0, Math.min(5, count)) });
    },
    async moveSmartShelf(id: string, dir: -1 | 1) {
      const s = liveSettings();
      if (!s) return;
      const list = [...(s.smartShelves ?? [])];
      const idx = list.findIndex((sh) => sh.id === id);
      if (idx < 0) return;
      const target = idx + dir;
      if (target < 0 || target >= list.length) return;
      [list[idx], list[target]] = [list[target], list[idx]];
      await persist({ ...s, smartShelves: list });
    },
    async resetSmartShelves() {
      const s = liveSettings();
      if (!s) return;
      await persist({ ...s, smartShelves: [], smartShelvesEnabled: false, smartSurpriseMe: false, smartSurpriseMeCount: 0, savedFilters: [] });
      notify("reset", { body: t("toast_smart_shelves_reset") });
    },
    async exportSmartShelves(destPath: string): Promise<boolean> {
      const s = liveSettings();
      if (!s) return false;
      return writeJsonFile(destPath, JSON.stringify({ state: { smartShelves: s.smartShelves ?? [], smartShelvesEnabled: s.smartShelvesEnabled === true, smartShelvesAtBottom: s.smartShelvesAtBottom === true, smartSurpriseMe: s.smartSurpriseMe === true, smartSurpriseMeCount: s.smartSurpriseMeCount ?? 0 } }, null, 2));
    },
    async importSmartShelves(srcPath: string): Promise<boolean> {
      const s = liveSettings();
      if (!s) return false;
      const raw = await readJsonFile(srcPath);
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw);
        const src = parsed?.state ?? parsed ?? {};
        const next: Settings = { ...s };
        if (Array.isArray(src.smartShelves)) next.smartShelves = src.smartShelves;
        if (typeof src.smartShelvesEnabled === "boolean") next.smartShelvesEnabled = src.smartShelvesEnabled;
        if (typeof src.smartShelvesAtBottom === "boolean") next.smartShelvesAtBottom = src.smartShelvesAtBottom;
        if (typeof src.smartSurpriseMe === "boolean") next.smartSurpriseMe = src.smartSurpriseMe;
        if (typeof src.smartSurpriseMeCount === "number") next.smartSurpriseMeCount = src.smartSurpriseMeCount;
        await persist(next);
        return true;
      } catch { return false; }
    },
  };
}
