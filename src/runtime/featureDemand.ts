import type { Settings } from "../types";

/* Feature-demand rules for the lazily-bootstrapped background services:
   a poller only starts when the current configuration can actually use its
   data, and starts later the moment a settings change introduces such a use.
   Pure — reads the settings document only. */

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

// Ids whose resolver or sort reads the friends state.
const FRIENDS_BACKED_IDS: readonly string[] = ["friends_playing", "friends_playing_now"];

// Friends state feeds the friends_playing smart mode, the friends-based
// sorts, and the per-card friends overlay (global or per shelf).
export function settingsNeedFriends(settings: Settings | null | undefined): boolean {
  if (!settings) return false;
  const s = settings as any;
  if (s.globalFriendsPlayingOverlay === true || s.globalFriendsPlayingOverlayRecent === true) return true;
  if (settingsMentionAny(settings, FRIENDS_BACKED_IDS)) return true;
  return /"friendsPlayingOverlay(Recent)?":true/.test(configText(settings));
}

// The Parser categories filter reads the tags on non-Steam shortcuts.
export function settingsNeedShortcutTags(settings: Settings | null | undefined): boolean {
  return settingsMentionAny(settings, ["parserCategories"]);
}
