import type { Settings } from "../types";

function configText(settings: Settings | null | undefined): string {
  if (!settings) return "";
  try {
    const s = settings as any;
    return JSON.stringify([s.shelves ?? [], s.smartShelves ?? [], s.savedFilters ?? [], s.profiles ?? []]);
  } catch { return ""; }
}

export function settingsMentionAny(settings: Settings | null | undefined, needles: readonly string[]): boolean {
  const text = configText(settings);
  if (!text) return false;
  return needles.some((n) => n && text.includes(`"${n}"`));
}

const FRIENDS_BACKED_IDS: readonly string[] = ["friends_playing", "friends_playing_now"];

export function settingsNeedFriends(settings: Settings | null | undefined): boolean {
  if (!settings) return false;
  const s = settings as any;
  if (s.globalFriendsPlayingOverlay === true || s.globalFriendsPlayingOverlayRecent === true) return true;
  if (settingsMentionAny(settings, FRIENDS_BACKED_IDS)) return true;
  return /"friendsPlayingOverlay(Recent)?":true/.test(configText(settings));
}

export function settingsNeedShortcutTags(settings: Settings | null | undefined): boolean {
  return settingsMentionAny(settings, ["parserCategories"]);
}
