import type { Settings } from "../../../types";
import { writeJsonFile, readJsonFile } from "../../../settingsStore";
import { trackFeature } from "../../../steam/usageTracking";

export const FACTORY_PROFILE_ID = "__factory__";
export const FACTORY_PROFILE_NAME = "Padrão";

export interface ProfilesDeps {
  liveSettings: () => Settings | null;
  persist: (next: Settings) => Promise<boolean>;
}

export interface ProfileRecord {
  id: string;
  name: string;
  createdAt: string;
  snapshot: Record<string, unknown>;
  trigger?: unknown;
}

function randomProfileId(): string {
  return `prof_${Math.random().toString(36).slice(2, 10)}`;
}

function takeSnapshot(s: Settings): Record<string, unknown> {
  const { profiles: _p, activeProfileName: _n, ...rest } = s as any;
  return rest as Record<string, unknown>;
}

function isNameTaken(profiles: ProfileRecord[], name: string): boolean {
  const lc = name.trim().toLowerCase();
  if (lc === FACTORY_PROFILE_NAME.toLowerCase()) return true;
  return profiles.some((p) => p.name.trim().toLowerCase() === lc);
}

export function createProfileActions(deps: ProfilesDeps) {
  const { liveSettings, persist } = deps;
  return {
    async createProfile(name: string): Promise<ProfileRecord | null> {
      const s = liveSettings();
      if (!s) return null;
      const trimmed = (name || "").trim().slice(0, 64);
      if (!trimmed) return null;
      const existing = (s as any).profiles ?? [];
      if (isNameTaken(existing, trimmed)) return null;
      const profile: ProfileRecord = {
        id: randomProfileId(),
        name: trimmed,
        createdAt: new Date().toISOString(),
        snapshot: takeSnapshot(s),
      };
      const next = { ...s, profiles: [...existing, profile], activeProfileName: trimmed } as Settings;
      await persist(next);
      return profile;
    },
    async applyProfile(id: string): Promise<boolean> {
      const s = liveSettings();
      if (!s) return false;
      const profiles: ProfileRecord[] = (s as any).profiles ?? [];
      const profile = profiles.find((p) => p.id === id);
      if (!profile) return false;
      trackFeature("profile");
      const next: Settings = {
        ...(profile.snapshot as any),
        profiles,
        activeProfileName: profile.name,
      };
      await persist(next);
      return true;
    },
    async deleteProfile(id: string): Promise<boolean> {
      const s = liveSettings();
      if (!s) return false;
      const profiles: ProfileRecord[] = (s as any).profiles ?? [];
      const target = profiles.find((p) => p.id === id);
      if (!target) return false;
      const nextProfiles = profiles.filter((p) => p.id !== id);
      // Clear `activeProfileName` if the deleted profile was active.
      const wasActive = (s as any).activeProfileName === target.name;
      await persist({
        ...s,
        profiles: nextProfiles,
        activeProfileName: wasActive ? null : (s as any).activeProfileName,
      } as Settings);
      return true;
    },
    async duplicateProfile(id: string): Promise<ProfileRecord | null> {
      const s = liveSettings();
      if (!s) return null;
      const profiles: ProfileRecord[] = (s as any).profiles ?? [];
      const source = profiles.find((p) => p.id === id);
      if (!source) return null;
      // Suffix with a unique counter so duplicates of duplicates work.
      let name = `${source.name} (cópia)`.slice(0, 64);
      let n = 2;
      while (isNameTaken(profiles, name)) {
        const stem = `${source.name} (cópia ${n})`;
        name = stem.slice(0, 64);
        n++;
      }
      const profile: ProfileRecord = {
        id: randomProfileId(),
        name,
        createdAt: new Date().toISOString(),
        snapshot: source.snapshot,
      };
      await persist({ ...s, profiles: [...profiles, profile] } as Settings);
      return profile;
    },
    async renameProfile(id: string, newName: string): Promise<boolean> {
      const s = liveSettings();
      if (!s) return false;
      const trimmed = (newName || "").trim().slice(0, 64);
      if (!trimmed) return false;
      const profiles: ProfileRecord[] = (s as any).profiles ?? [];
      if (isNameTaken(profiles, trimmed)) return false;
      const before = profiles.find((p) => p.id === id);
      if (!before) return false;
      const nextProfiles = profiles.map((p) => p.id === id ? { ...p, name: trimmed } : p);
      const wasActive = (s as any).activeProfileName === before.name;
      await persist({
        ...s,
        profiles: nextProfiles,
        activeProfileName: wasActive ? trimmed : (s as any).activeProfileName,
      } as Settings);
      return true;
    },
    async updateProfileSnapshot(id: string): Promise<boolean> {
      const s = liveSettings();
      if (!s) return false;
      const profiles: ProfileRecord[] = (s as any).profiles ?? [];
      const target = profiles.find((p) => p.id === id);
      if (!target) return false;
      const nextProfiles = profiles.map((p) => p.id === id ? { ...p, snapshot: takeSnapshot(s) } : p);
      await persist({ ...s, profiles: nextProfiles } as Settings);
      return true;
    },
    // Toggle a profile's hidden flag (still listed, omitted from the dropdown).
    async toggleProfileHidden(id: string): Promise<void> {
      const s = liveSettings();
      if (!s) return;
      const profiles: ProfileRecord[] = (s as any).profiles ?? [];
      if (!profiles.some((p) => p.id === id)) return;
      const nextProfiles = profiles.map((p) => p.id === id ? { ...p, hidden: !(p as any).hidden } : p);
      await persist({ ...s, profiles: nextProfiles } as Settings);
    },
    // Reorder the profiles array (drives both the list and the dropdown order).
    async setProfilesOrder(ids: string[]): Promise<void> {
      const s = liveSettings();
      if (!s) return;
      const profiles: ProfileRecord[] = (s as any).profiles ?? [];
      const byId = new Map(profiles.map((p) => [p.id, p]));
      const reordered = ids.map((id) => byId.get(id)).filter(Boolean) as ProfileRecord[];
      for (const p of profiles) if (!ids.includes(p.id)) reordered.push(p);
      if (reordered.length !== profiles.length) return;
      await persist({ ...s, profiles: reordered } as Settings);
    },
    async clearActiveProfile(): Promise<void> {
      const s = liveSettings();
      if (!s) return;
      if ((s as any).activeProfileName == null) return;
      await persist({ ...s, activeProfileName: null } as Settings);
    },
    // unified shelf list toggle. Order array is preserved
    // across flips (sanitizer/schema guarantee).
    async setUnifiedListEnabled(unifiedListEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s as any).unifiedListEnabled === unifiedListEnabled) return;
      await persist({ ...s, unifiedListEnabled } as Settings);
    },
    async setAllShelvesOrder(ids: string[]) {
      const s = liveSettings();
      if (!s) return;
      const cleaned = ids.filter((x) => typeof x === "string" && x.length > 0);
      const cur: string[] = (s as any).allShelvesOrder ?? [];
      if (cur.length === cleaned.length && cur.every((v, i) => v === cleaned[i])) return;
      await persist({ ...s, allShelvesOrder: cleaned } as Settings);
    },
    // light mode + per-feature toggles. Light and advanced are mutually
    // exclusive — enabling one disables the other.
    async setLightModeEnabled(lightModeEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s as any).lightModeEnabled === lightModeEnabled) return;
      const next: any = { ...s, lightModeEnabled };
      if (lightModeEnabled) next.advancedModeEnabled = false;
      await persist(next as Settings);
    },
    async setAdvancedModeEnabled(advancedModeEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s as any).advancedModeEnabled === advancedModeEnabled) return;
      const next: any = { ...s, advancedModeEnabled };
      if (advancedModeEnabled) next.lightModeEnabled = false;
      await persist(next as Settings);
    },
    async setTemplateSuggestionsEnabled(templateSuggestionsEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s as any).templateSuggestionsEnabled === templateSuggestionsEnabled) return;
      await persist({ ...s, templateSuggestionsEnabled } as Settings);
    },
    async setRemovalSuggestionsEnabled(removalSuggestionsEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s as any).removalSuggestionsEnabled === removalSuggestionsEnabled) return;
      await persist({ ...s, removalSuggestionsEnabled } as Settings);
    },
    async setVerboseLoggingEnabled(verboseLoggingEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s as any).verboseLoggingEnabled === verboseLoggingEnabled) return;
      await persist({ ...s, verboseLoggingEnabled } as Settings);
    },
    async setDevModeEnabled(devModeEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s as any).devModeEnabled === devModeEnabled) return;
      await persist({ ...s, devModeEnabled } as Settings);
    },
    async setDebugOverlayEnabled(debugOverlayEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s as any).debugOverlayEnabled === debugOverlayEnabled) return;
      await persist({ ...s, debugOverlayEnabled } as Settings);
    },
    async setDebugOverlayOption(key: string, value: boolean | string) {
      const s = liveSettings();
      if (!s || (s as any)[key] === value) return;
      await persist({ ...s, [key]: value } as Settings);
    },
    async setOfflineModeEnabled(offlineModeEnabled: boolean) {
      const s = liveSettings();
      if (!s || (s as any).offlineModeEnabled === offlineModeEnabled) return;
      await persist({ ...s, offlineModeEnabled } as Settings);
    },
    async setFeatureToggle(key: string, value: boolean) {
      const s = liveSettings();
      if (!s) return;
      const current = (s as any).featureToggles ?? {};
      if (current[key] === value) return;
      await persist({ ...s, featureToggles: { ...current, [key]: value } } as Settings);
    },
    async exportProfiles(destPath: string, onlyId?: string): Promise<boolean> {
      const s = liveSettings();
      if (!s) return false;
      const profiles: ProfileRecord[] = (s as any).profiles ?? [];
      const payload = {
        profileVersion: 1,
        exportedAt: new Date().toISOString(),
        profiles: onlyId
          ? profiles.filter((p) => p.id === onlyId)
          : profiles,
      };
      return writeJsonFile(destPath, JSON.stringify(payload, null, 2));
    },
    async importProfiles(srcPath: string, mode: "merge" | "replace" = "merge"): Promise<number> {
      const s = liveSettings();
      if (!s) return 0;
      const raw = await readJsonFile(srcPath);
      if (!raw) return 0;
      try {
        const parsed = JSON.parse(raw);
        const incoming = parsed?.profiles ?? parsed;
        if (!Array.isArray(incoming)) return 0;
        const current: ProfileRecord[] = mode === "replace" ? [] : ((s as any).profiles ?? []);
        const seenNames = new Set(current.map((p) => p.name.trim().toLowerCase()));
        const added: ProfileRecord[] = [];
        for (const p of incoming) {
          if (!p || typeof p !== "object") continue;
          if (typeof p.name !== "string" || !p.name.trim()) continue;
          if (typeof p.snapshot !== "object" || !p.snapshot) continue;
          let name = p.name.trim().slice(0, 64);
          let n = 2;
          while (seenNames.has(name.toLowerCase())) {
            name = `${p.name.trim().slice(0, 56)} (cópia ${n})`.slice(0, 64);
            n++;
          }
          seenNames.add(name.toLowerCase());
          added.push({
            id: `prof_${Math.random().toString(36).slice(2, 10)}`,
            name,
            createdAt: typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString(),
            snapshot: p.snapshot,
            trigger: p.trigger,
          });
        }
        if (added.length === 0 && mode === "merge") return 0;
        await persist({
          ...s,
          profiles: mode === "replace" ? added : [...current, ...added],
          activeProfileName: mode === "replace" ? null : (s as any).activeProfileName,
        } as Settings);
        return added.length;
      } catch { return 0; }
    },
    async applyFactoryProfile() {
      const s = liveSettings();
      if (!s) return;
      // Import here to avoid a circular dependency at module load.
      const { defaultSettings } = await import("../../../domain/defaults");
      const defaults = defaultSettings();
      // Preserve saved profiles; reset everything else.
      await persist({
        ...defaults,
        profiles: (s as any).profiles ?? [],
        activeProfileName: null,
      } as Settings);
    },
    // per-integration enable. Stored only when the user
    // explicitly opts out; `undefined` means enabled.
    async setIntegrationEnabled(id: string, value: boolean) {
      const s = liveSettings();
      if (!s) return;
      const current = (s as any).integrationsEnabled ?? {};
      // `value === true` is the default — drop the key instead of
      // storing `true` so the persisted map stays small.
      const next = { ...current };
      if (value) delete next[id];
      else next[id] = false;
      const sameSize = Object.keys(current).length === Object.keys(next).length;
      const same = sameSize && Object.keys(next).every((k) => current[k] === next[k]);
      if (same) return;
      await persist({ ...s, integrationsEnabled: next } as Settings);
    },
    async setButtonBinding(key: "cardHideRemove" | "cardHighlightToggle" | "cardQuickLaunch" | "navSearch" | "navSideNav", value: string | null) {
      const s = liveSettings();
      if (!s) return;
      const current = (s as any).buttonBindings ?? {};
      const next = { ...current };
      if (key === "navSearch" || key === "navSideNav") {
        if (!value) return;
        next[key] = value;
      } else {
        if (value === null) next[key] = null;
        else next[key] = value;
      }
      if (current[key] === next[key]) return;
      await persist({ ...s, buttonBindings: next } as Settings);
    },
    async resetButtonBindings() {
      const s = liveSettings();
      if (!s) return;
      // Restore defaults for every key + clear disabled list.
      await persist({
        ...s,
        buttonBindings: {
          cardHideRemove: "X",
          cardHighlightToggle: "Y",
          cardQuickLaunch: "VIEW",
          navSearch: "L1+R1",
          navSideNav: "L1+L1",
        } as any,
        buttonBindingsDisabled: [],
      } as Settings);
    },
    async setBindingDisabled(key: string, disabled: boolean) {
      const s = liveSettings();
      if (!s) return;
      const list = ((s as any).buttonBindingsDisabled ?? []) as string[];
      const has = list.includes(key);
      let next: string[];
      if (disabled && !has) next = [...list, key];
      else if (!disabled && has) next = list.filter((k) => k !== key);
      else return;
      await persist({ ...s, buttonBindingsDisabled: next } as Settings);
    },
  };
}
