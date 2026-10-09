import type { Settings } from "../types";

/* Feature-demand rules for the lazily-bootstrapped background services:
   a poller only starts when the current configuration can actually use its
   data, and starts later the moment a settings change introduces such a use.
   Pure — reads the settings document only. */

// Source ids in the v3 catalog whose resolver reads the launcher cache
// (`filterByLauncherNames` in steam/v3Extensions.ts). Kept in sync by hand.
export const LAUNCHER_BACKED_SOURCE_IDS: readonly string[] = [
  "emudeck_collections", "retrodeck_collections", "heroic_library", "lutris_library",
  "moonlight_sessions", "chiaki_sessions",
];

function configText(settings: Settings | null | undefined): string {
  if (!settings) return "";
  try {
    const s = settings as any;
    return JSON.stringify([s.shelves ?? [], s.smartShelves ?? [], s.savedFilters ?? [], s.profiles ?? []]);
  } catch { return ""; }
}

// Any shelf / smart shelf / saved filter / profile mentions one of the needles
// (source ids, smart modes, sort/filter ids are all plain strings in the document).
export function settingsMentionAny(settings: Settings | null | undefined, needles: readonly string[]): boolean {
  const text = configText(settings);
  if (!text) return false;
  return needles.some((n) => n && text.includes(`"${n}"`));
}

// Ids whose resolver/sort reads friends state (smart mode + v3 sorts).
export const FRIENDS_BACKED_IDS: readonly string[] = [
  "friends_playing", "friends_playing_now", "most_friends_owning", "trending_among_friends",
];

// Friends state feeds the friends_playing smart mode, the friends-based
// sorts, and the per-card friends overlay (global or per shelf).
export function settingsNeedFriends(settings: Settings | null | undefined): boolean {
  if (!settings) return false;
  const s = settings as any;
  if (s.globalFriendsPlayingOverlay === true || s.globalFriendsPlayingOverlayRecent === true) return true;
  if (settingsMentionAny(settings, FRIENDS_BACKED_IDS)) return true;
  return /"friendsPlayingOverlay(Recent)?":true/.test(configText(settings));
}

export function settingsNeedLaunchers(settings: Settings | null | undefined): boolean {
  return settingsMentionAny(settings, LAUNCHER_BACKED_SOURCE_IDS);
}
