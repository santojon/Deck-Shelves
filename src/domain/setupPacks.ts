import type { Settings, Shelf, SmartShelf, SmartShelfMode } from "../types";
import { SHELF_TEMPLATES, ONLINE_SHELF_TEMPLATES, DEFAULT_SHELF_TEMPLATES, coveredTemplateIds, type ShelfTemplate } from "./templates";
import { createDefaultShelf, createDefaultSmartShelf } from "./defaults";
import { addShelfToSettings } from "./settings";

/* Setup packs ("recipes"): named bundles of existing shelf templates, smart
   modes and a few settings, applied non-destructively (shelves you already
   have are skipped, nothing is removed) and revertible as one step — the apply
   record remembers exactly what it added and which settings it moved. Quick
   presets cover the first run; packs, situations; device packs, Frame/Machine/Stream. */
export type SetupPackGroup = "quick" | "pack" | "device";

export type SetupPack = {
  id: string;
  group: SetupPackGroup;
  templates: string[];
  smart: SmartShelfMode[];
  settings?: Partial<Settings>;
};

export const SETUP_PACKS: SetupPack[] = [
  { id: "essential", group: "quick", templates: DEFAULT_SHELF_TEMPLATES.map((t) => t.id), smart: [] },
  { id: "steam_and_nonsteam", group: "quick", templates: ["recent", "installed", "non_steam", "favorites"], smart: [] },
  { id: "backlog_rescue", group: "pack", templates: ["never_played"], smart: ["backlog_rescue", "best_unplayed"] },
  { id: "portable_deck", group: "pack", templates: ["installed", "deck_verified"], smart: ["short_battery", "travel_mode", "quick_play"] },
  { id: "rediscover", group: "pack", templates: ["most_played"], smart: ["rediscover", "forgotten_gems", "hidden_gems"] },
  // Same living-room look as the Machine pack (hero art everywhere, full-page shelves, featured first game, logos); the shelves differ.
  { id: "living_room", group: "pack", templates: ["favorites", "recent"], smart: ["long_session_night", "deck_picks"], settings: { shelfHeroBackground: true, globalHeroEnabled: true, globalFullPageShelf: true, globalHighlightFirst: true, globalEnableLogo: true } },
  { id: "frame", group: "device", templates: ["vr_games", "vr_only", "recent", "favorites"], smart: ["quick_play", "short_battery"] },
  // A TV: hero art everywhere, full-page shelves, the first game featured, logos.
  { id: "machine", group: "device", templates: ["favorites", "recent", "most_played"], smart: ["long_session_night", "deck_picks"], settings: { shelfHeroBackground: true, globalHeroEnabled: true, globalFullPageShelf: true, globalHighlightFirst: true, globalEnableLogo: true } },
  { id: "stream", group: "device", templates: ["steam_cloud", "recent"], smart: ["quick_play"] },
];

export function setupPackById(id: string): SetupPack | undefined {
  return SETUP_PACKS.find((p) => p.id === id);
}

export type SetupApplyRecord = {
  packId: string;
  at: number;
  addedShelfIds: string[];
  addedSmartIds: string[];
  prevSettings: Record<string, unknown>;
};

export type SetupPreview = {
  shelves: Array<{ templateId: string; titleKey: string; already: boolean }>;
  smart: Array<{ mode: SmartShelfMode; already: boolean }>;
  settings: Array<{ key: string; from: unknown; to: unknown }>;
};

const ALL_TEMPLATES: ShelfTemplate[] = [...SHELF_TEMPLATES, ...ONLINE_SHELF_TEMPLATES];

function templateById(id: string): ShelfTemplate | undefined {
  return ALL_TEMPLATES.find((t) => t.id === id);
}

function presentSmartModes(settings: Settings): Set<string> {
  return new Set((settings.smartShelves ?? []).map((s) => String(s.mode)));
}

function settingsChanges(settings: Settings, pack: SetupPack): SetupPreview["settings"] {
  const out: SetupPreview["settings"] = [];
  for (const [key, to] of Object.entries(pack.settings ?? {})) {
    const from = (settings as any)[key];
    if (from !== to) out.push({ key, from, to });
  }
  if (pack.smart.length && !settings.smartShelvesEnabled) out.push({ key: "smartShelvesEnabled", from: settings.smartShelvesEnabled, to: true });
  return out;
}

export function previewSetupPack(settings: Settings, pack: SetupPack): SetupPreview {
  const covered = new Set(coveredTemplateIds(settings.shelves ?? [], []));
  const smartPresent = presentSmartModes(settings);
  return {
    shelves: pack.templates.map((id) => ({ templateId: id, titleKey: templateById(id)?.titleKey ?? id, already: covered.has(id) })),
    smart: pack.smart.map((mode) => ({ mode, already: smartPresent.has(mode) })),
    settings: settingsChanges(settings, pack),
  };
}

export type SetupTitles = { template: (tpl: ShelfTemplate) => string; smart: (mode: SmartShelfMode) => string };

export function applySetupPack(settings: Settings, pack: SetupPack, titles: SetupTitles, now: number = Date.now()): { next: Settings; record: SetupApplyRecord } {
  const preview = previewSetupPack(settings, pack);
  let next: Settings = { ...settings, enabled: true };
  const prevSettings: Record<string, unknown> = {};
  if (!settings.enabled) prevSettings.enabled = false;
  for (const change of preview.settings) {
    prevSettings[change.key] = change.from;
    (next as any)[change.key] = change.to;
  }
  const addedShelfIds: string[] = [];
  for (const entry of preview.shelves) {
    if (entry.already) continue;
    const tpl = templateById(entry.templateId);
    if (!tpl) continue;
    const shelf: Shelf = { ...createDefaultShelf(), title: titles.template(tpl), source: tpl.source, ...(tpl.defaultSort ? { sort: tpl.defaultSort } : {}) } as Shelf;
    next = addShelfToSettings(next, shelf);
    addedShelfIds.push(shelf.id);
  }
  const addedSmart: SmartShelf[] = preview.smart.filter((s) => !s.already).map((s) => createDefaultSmartShelf(s.mode, titles.smart(s.mode)));
  if (addedSmart.length) next = { ...next, smartShelves: [...(next.smartShelves ?? []), ...addedSmart] };
  const record: SetupApplyRecord = { packId: pack.id, at: now, addedShelfIds, addedSmartIds: addedSmart.map((s) => s.id), prevSettings };
  return { next: { ...next, lastSetupApply: record } as Settings, record };
}

/* Undo one apply: drop the shelves it added (only those still present) and
   put back the settings it moved. Anything the user did since stays. */
export function revertSetupApply(settings: Settings, record: SetupApplyRecord): Settings {
  const dropShelves = new Set(record.addedShelfIds);
  const dropSmart = new Set(record.addedSmartIds);
  const next: Settings = {
    ...settings,
    shelves: (settings.shelves ?? []).filter((s) => !dropShelves.has(s.id)),
    smartShelves: (settings.smartShelves ?? []).filter((s) => !dropSmart.has(s.id)),
  };
  for (const [key, value] of Object.entries(record.prevSettings ?? {})) (next as any)[key] = value;
  return { ...next, lastSetupApply: null } as Settings;
}

/* Packs worth pointing out for this library, from the statistics the
   Suggestions tab already derives (template ids / smart modes it names). */
export function recommendedPackIds(hints: ReadonlyArray<{ templateId?: string; smartMode?: string }>, hasShelves: boolean): string[] {
  const out = new Set<string>();
  if (!hasShelves) out.add("essential");
  for (const h of hints) {
    const k = h.templateId ?? h.smartMode ?? "";
    if (["never_played", "best_unplayed", "backlog_rescue", "not_started"].includes(k)) out.add("backlog_rescue");
    if (["deck_verified", "deck_playable", "short_battery", "travel_mode"].includes(k)) out.add("portable_deck");
    if (["rediscover", "forgotten", "forgotten_gems", "hidden_gems", "most_played"].includes(k)) out.add("rediscover");
  }
  return [...out];
}
