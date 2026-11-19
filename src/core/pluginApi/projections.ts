import type { Settings } from "../../types";
import { INTEGRATIONS } from "../../integrations/descriptors";
import type {
  PublicAppMeta, PublicProfile, IntegrationInfo, PublicSettingsSnapshot, PublicFilterGroup,
  PublicShelf, PublicShelfSource, PublicSmartShelf, PublicSavedFilter, PublicSavedSmartFilter,
} from "@deck-shelves/api";

// External descriptors get this canonical shape, not the raw AppOverview.
const numOrUndef = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

export function toPublicAppMeta(raw: any): PublicAppMeta {
  if (!raw || typeof raw !== "object") return { appid: 0, name: "" };
  const appid = Number(raw.appid ?? raw.m_unAppID ?? 0);
  const name = String(raw.display_name ?? raw.name ?? "");
  const isNonSteam = raw.app_type === 1073741824 || raw.is_non_steam === true;
  const playtime = numOrUndef(raw.playtime_forever);
  const lastPlayed = numOrUndef(raw?.last_played);
  const compat = numOrUndef(raw.deck_compatibility_category);
  const controllerSupport = numOrUndef(raw.nControllerSupport);
  const installed = raw.installed === true || raw.is_installed === true;
  return {
    appid,
    name,
    installed,
    isSteam: !isNonSteam,
    is_non_steam: isNonSteam,
    playtimeMinutes: playtime,
    playtime_forever: playtime,
    lastPlayedTimestamp: lastPlayed,
    last_played: lastPlayed,
    deckCompatCategory: compat,
    deck_compatibility_category: compat,
    supportsCloud: raw.bCloudAvailable === true,
    bCloudAvailable: raw.bCloudAvailable === true,
    controllerSupport,
    nControllerSupport: controllerSupport,
    app_type: numOrUndef(raw.app_type),
    is_installed: installed,
    is_hidden: raw.is_hidden === true,
  };
}

const firstSort = (sort: any) => (Array.isArray(sort) ? sort[0] : sort);

// Source kinds whose public shape is `{ type, <key>: string }`.
const SIMPLE_SOURCE_KEYS: Record<string, string> = { collection: "collectionId", tab: "tab", external: "sourceId", smart: "mode" };

function toPublicShelfSource(src: any): PublicShelfSource | null {
  const type = src?.type;
  if (type === "filter") return { type: "filter", filter: { sort: firstSort(src.filter?.sort), group: src.filter?.group as any } };
  const key = SIMPLE_SOURCE_KEYS[type];
  return key ? ({ type, [key]: String(src[key] ?? "") } as PublicShelfSource) : null;
}

export function projectShelves(s: Settings | null): ReadonlyArray<PublicShelf> {
  if (!s) return [];
  const out: PublicShelf[] = [];
  for (const sh of s.shelves) {
    const pub = toPublicShelfSource(sh.source);
    if (!pub) continue;
    out.push({
      id: sh.id,
      title: sh.title,
      enabled: sh.enabled !== false,
      hidden: !!sh.hidden,
      limit: sh.limit ?? 20,
      sort: Array.isArray(sh.sort) ? sh.sort[0] : sh.sort,
      source: pub,
    });
  }
  return out;
}

export function projectSmartShelves(s: Settings | null): ReadonlyArray<PublicSmartShelf> {
  if (!s) return [];
  const list = (s.smartShelves ?? []) as any[];
  return list.map((sh: any) => ({
    id: String(sh.id),
    title: String(sh.title ?? ""),
    mode: String(sh.mode),
    enabled: sh.enabled !== false,
    hidden: !!sh.hidden,
    limit: typeof sh.limit === "number" ? sh.limit : undefined,
    sort: typeof sh.sort === "string" ? sh.sort : undefined,
  }));
}

export function projectSavedFilters(s: Settings | null): ReadonlyArray<PublicSavedFilter> {
  if (!s) return [];
  const list = (s.savedFilters ?? []) as any[];
  return list.map((f: any) => ({
    id: String(f.id),
    name: String(f.name ?? ""),
    group: f.group as PublicFilterGroup,
  }));
}

// One source for the public capability list: the integration descriptors.
const KNOWN_INTEGRATIONS: ReadonlyArray<{ id: string; displayName: string; detect: () => boolean }> =
  INTEGRATIONS.map((i) => ({ id: i.id, displayName: i.label, detect: i.isInstalled }));

export function projectProfiles(s: Settings | null): ReadonlyArray<PublicProfile> {
  if (!s) return [];
  const list = ((s as any).profiles ?? []) as Array<{ id: string; name: string; createdAt: string }>;
  const activeName = (s as any).activeProfileName;
  return list.map((p) => ({
    id: String(p.id),
    name: String(p.name),
    createdAt: String(p.createdAt ?? ""),
    active: typeof activeName === "string" && activeName === p.name,
  }));
}

export function projectSettingsSnapshot(s: Settings | null): PublicSettingsSnapshot {
  const x = (s ?? {}) as any;
  return {
    enabled: x.enabled === true,
    hideRecents: x.hideRecents === true,
    recentsReplaceSource: x.recentsReplaceSource === true,
    hideHomeTabs: x.hideHomeTabs === true,
    shelfHeroBackground: x.shelfHeroBackground === true,
    globalHeroEnabled: x.globalHeroEnabled === true,
    globalFullPageShelf: x.globalFullPageShelf === true,
    smartShelvesEnabled: x.smartShelvesEnabled === true,
    unifiedListEnabled: x.unifiedListEnabled === true,
    forceCssLoaderThemes: x.forceCssLoaderThemes === true,
    lightModeEnabled: x.lightModeEnabled === true,
    onlineFeaturesEnabled: x.onlineFeaturesEnabled === true,
    updateNotifyEnabled: x.updateNotifyEnabled !== false,
    integrationsEnabled: (x.integrationsEnabled ?? {}) as Record<string, boolean>,
    featureToggles: (x.featureToggles ?? {}) as Record<string, boolean>,
    activeProfileName: typeof x.activeProfileName === "string" ? x.activeProfileName : null,
  };
}

export function detectLocale(): string {
  try {
    const nav = (globalThis as any).navigator;
    const lang = nav?.language;
    if (typeof lang === "string" && lang.length > 0) return lang;
  } catch {}
  return "en-US";
}

// Cheap user-agent hint; undefined when it can't be determined.
export function detectOs(): string | undefined {
  try {
    const ua = (globalThis as any).navigator?.userAgent as string | undefined;
    if (!ua) return undefined;
    if (/SteamOS/i.test(ua)) return "SteamOS";
    if (/Windows/i.test(ua)) return "Windows";
    if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
    if (/Linux/i.test(ua)) return "Linux";
  } catch { /* no navigator */ }
  return undefined;
}

export function detectGamepadUi(): boolean {
  try {
    const doc = (globalThis as any).document;
    if (!doc) return false;
    const body = doc.body || doc.documentElement;
    if (!body) return false;
    return body.classList?.contains("gamepad") === true
      || body.classList?.contains("bigpicture") === true
      || !!doc.querySelector?.("[class*='gamepadui_GamepadUI']");
  } catch { return false; }
}

export function projectIntegrations(s: Settings | null): ReadonlyArray<IntegrationInfo> {
  const enabledMap = (s ? ((s as any).integrationsEnabled ?? {}) : {}) as Record<string, boolean>;
  return KNOWN_INTEGRATIONS.map((it) => {
    let installed = false;
    try { installed = it.detect(); } catch {}
    const enabled = enabledMap[it.id] !== false;
    return { id: it.id, displayName: it.displayName, installed, enabled };
  });
}

export function projectSavedSmartFilters(s: Settings | null): ReadonlyArray<PublicSavedSmartFilter> {
  if (!s) return [];
  const list = ((s as any).savedSmartFilters ?? []) as any[];
  return list.map((f: any) => ({
    id: String(f.id),
    name: String(f.name ?? ""),
    mode: String(f.mode ?? ""),
    smartParams: f.smartParams && typeof f.smartParams === "object" ? f.smartParams : undefined,
    filterGroup: f.filterGroup as PublicFilterGroup | undefined,
    sort: f.sort,
    sortReverse: f.sortReverse,
    limit: typeof f.limit === "number" ? f.limit : undefined,
    visibleHours: Array.isArray(f.visibleHours) ? f.visibleHours : undefined,
    visibleDaysOfWeek: Array.isArray(f.visibleDaysOfWeek) ? f.visibleDaysOfWeek : undefined,
  }));
}
