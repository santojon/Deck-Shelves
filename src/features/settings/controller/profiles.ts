import type { Settings } from "../../../types";
import { writeJsonFile, readJsonFile } from "../../../settingsStore";
import { trackFeature } from "../../../steam/usageTracking";
import { notify } from "../../../components/notify";
import i18next from "i18next";

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
  // When true, switching to this profile also swaps the displayed shelves;
  // otherwise the current shelves are kept and only the rest is applied.
  linkShelves?: boolean;
}

// Settings fields that make up "the shelves shown on the home". Kept out of a
// profile switch unless the profile is shelf-linked (and out of a factory reset
// unless the user opts in).
const SHELF_LINK_FIELDS = ["shelves", "smartShelves", "allShelvesOrder"] as const;

export function keepShelfFields(next: Settings, from: Settings): void {
  for (const f of SHELF_LINK_FIELDS) (next as any)[f] = (from as any)[f];
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

// Validate + de-duplicate one imported profile entry into a ProfileRecord;
// null when the entry is malformed. Appends the chosen name to `seenNames`.
function normalizeImportedProfile(p: any, seenNames: Set<string>): ProfileRecord | null {
  if (!p || typeof p !== "object") return null;
  if (typeof p.name !== "string" || !p.name.trim()) return null;
  if (typeof p.snapshot !== "object" || !p.snapshot) return null;
  let name = p.name.trim().slice(0, 64);
  let n = 2;
  while (seenNames.has(name.toLowerCase())) {
    name = `${p.name.trim().slice(0, 56)} (cópia ${n})`.slice(0, 64);
    n++;
  }
  seenNames.add(name.toLowerCase());
  return {
    id: randomProfileId(),
    name,
    createdAt: typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString(),
    snapshot: p.snapshot,
    trigger: p.trigger,
    ...(p.linkShelves === true ? { linkShelves: true } : {}),
  };
}

// Build the imported profile list (deduped against current) + the next settings
// payload for the chosen merge/replace mode.
function applyProfileImport(s: Settings, incoming: any[], mode: "merge" | "replace"): { added: ProfileRecord[]; next: Settings } {
  const current: ProfileRecord[] = mode === "replace" ? [] : ((s as any).profiles ?? []);
  const seenNames = new Set(current.map((p) => p.name.trim().toLowerCase()));
  const added: ProfileRecord[] = [];
  for (const p of incoming) {
    const rec = normalizeImportedProfile(p, seenNames);
    if (rec) added.push(rec);
  }
  const next = {
    ...s,
    profiles: mode === "replace" ? added : [...current, ...added],
    activeProfileName: mode === "replace" ? null : (s as any).activeProfileName,
  } as Settings;
  return { added, next };
}

export function createProfileActions(deps: ProfilesDeps) {
  const { liveSettings, persist } = deps;
  return {
    async createProfile(name: string, linkShelves = false): Promise<ProfileRecord | null> {
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
        ...(linkShelves ? { linkShelves: true } : {}),
      };
      const next = { ...s, profiles: [...existing, profile], activeProfileName: trimmed } as Settings;
      await persist(next);
      notify("success", { body: i18next.t("toast_created"), area: "profiles" });
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
      // Shelf-link opt-in: unlinked profiles change everything BUT the shelves.
      if (!profile.linkShelves) keepShelfFields(next, s);
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
      notify("reset", { body: i18next.t("toast_deleted"), area: "profiles" });
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
        ...(source.linkShelves ? { linkShelves: true } : {}),
      };
      await persist({ ...s, profiles: [...profiles, profile] } as Settings);
      notify("success", { body: i18next.t("toast_duplicated"), area: "profiles" });
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
      notify("success", { body: i18next.t("toast_renamed"), area: "profiles" });
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
      notify("success", { body: i18next.t("toast_saved"), area: "profiles" });
      return true;
    },
    // Set (or clear) a profile's Visibility Rules v2 trigger predicate. An
    // empty/undefined tree clears the trigger (the profile stops auto-applying).
    async setProfileTrigger(id: string, trigger: unknown): Promise<boolean> {
      const s = liveSettings();
      if (!s) return false;
      const t = trigger as any;
      const clean = (t && Array.isArray(t.rules) && t.rules.length > 0)
        ? { mode: t.mode === "all" ? "all" : "any", rules: t.rules }
        : undefined;
      // The Default (factory) profile is synthetic — its trigger lives in a
      // dedicated settings field instead of the profiles array.
      if (id === FACTORY_PROFILE_ID) {
        await persist({ ...s, factoryProfileTrigger: clean } as Settings);
        return true;
      }
      const profiles: ProfileRecord[] = (s as any).profiles ?? [];
      if (!profiles.some((p) => p.id === id)) return false;
      const nextProfiles = profiles.map((p) => p.id === id ? { ...p, trigger: clean } : p);
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
        const { added, next } = applyProfileImport(s, incoming, mode);
        if (added.length === 0 && mode === "merge") return 0;
        await persist(next);
        return added.length;
      } catch { return 0; }
    },
    async applyFactoryProfile(resetShelves = false) {
      const s = liveSettings();
      if (!s) return;
      // Import here to avoid a circular dependency at module load.
      const { defaultSettings } = await import("../../../domain/defaults");
      const defaults = defaultSettings();
      // Reset config to defaults but keep the plugin ON (master toggle) and
      // preserve saved profiles. Shelves stay unless the user opts to reset them.
      const next = {
        ...defaults,
        enabled: true,
        profiles: (s as any).profiles ?? [],
        activeProfileName: null,
      } as Settings;
      if (!resetShelves) keepShelfFields(next, s);
      await persist(next);
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
