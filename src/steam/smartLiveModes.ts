import type { AppOverview } from "./index";
import type { SmartShelfMode } from "../types";
import { getParam, type SmartParams } from "./smartParams";
import { getBatteryState } from "../runtime/batteryState";
import { getFriendsPlayingAppIds, getFriendsRecentlyPlayedAppIds } from "../runtime/friendsState";
import { getCurrentSettings } from "../store/settingsStore";
import { achievementPercent, loadAchievements } from "./achievements";
import { STORE_CATEGORY, hasStoreCategory } from "./v3Extensions";
import { playtimeMinutes, lastPlayedSec, deckCompat } from "./smartAppFields";

export function resolveLowBatteryMode(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const threshold = getParam("low_battery_mode", params, "batteryThresholdPct") / 100;
  const maxPt = getParam("low_battery_mode", params, "maxPlaytimeMinutes");
  const maxSizeMb = getParam("low_battery_mode", params, "maxSizeMb");
  const minDeck = getParam("low_battery_mode", params, "minDeckLevel");
  const maxBytes = maxSizeMb * 1024 * 1024;
  const battery = getBatteryState();
  const isOnBatteryLow = battery?.hasBattery === true && battery.state === "discharging" && battery.level > 0 && battery.level <= threshold;
  const pool = apps.filter((a) =>
    !a.is_non_steam &&
    (a.app_type === undefined || a.app_type === 1) &&
    a.installed &&
    playtimeMinutes(a) <= maxPt &&
    Number((a as any).size_on_disk ?? 0) > 0 &&
    Number((a as any).size_on_disk ?? 0) <= maxBytes &&
    deckCompat(a) >= minDeck,
  );
  if (isOnBatteryLow) {
    return pool
      .sort((a, b) => (Number((a as any).size_on_disk ?? 0) - Number((b as any).size_on_disk ?? 0)) || (playtimeMinutes(a) - playtimeMinutes(b)))
      .slice(0, limit)
      .map((a) => a.appid);
  }
  return pool
    .sort((a, b) => deckCompat(b) - deckCompat(a) || lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

// Friends data follows the online master toggle.
function friendsDataAllowed(): boolean {
  try {
    const s = getCurrentSettings();
    return (s as any)?.offlineModeEnabled !== true && s?.onlineFeaturesEnabled === true;
  } catch { return false; }
}

export function resolveFriendsPlaying(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  if (!friendsDataAllowed()) return [];
  const minDeck = getParam("friends_playing", params, "minDeckLevel");
  const includeRecent = getParam("friends_playing", params, "includeRecentlyPlayed") === 1;
  const liveSet = getFriendsPlayingAppIds();
  const friendSet = includeRecent ? getFriendsRecentlyPlayedAppIds() : liveSet;
  if (friendSet.size === 0) return [];
  const ownedMatches = apps
    .filter((a) =>
      !a.is_non_steam &&
      (a.app_type === undefined || a.app_type === 1) &&
      friendSet.has(a.appid) &&
      deckCompat(a) >= minDeck,
    )
    .sort((a, b) => {
      const aLive = liveSet.has(a.appid) ? 1 : 0;
      const bLive = liveSet.has(b.appid) ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;
      return lastPlayedSec(b) - lastPlayedSec(a);
    })
    .map((a) => a.appid);
  // Friends' games the user doesn't own are appended as raw ids after the owned matches.
  // Ownership comes from the full pool, or filtered-out owned games would come back as unowned.
  const libraryAppIds = new Set(apps.map((a) => a.appid));
  const nonOwnedIds: number[] = [];
  for (const id of liveSet) {
    if (!libraryAppIds.has(id)) nonOwnedIds.push(id);
  }
  if (includeRecent) {
    const seenLive = new Set([...liveSet]);
    for (const id of friendSet) {
      if (seenLive.has(id) || libraryAppIds.has(id)) continue;
      nonOwnedIds.push(id);
    }
  }
  return [...ownedMatches, ...nonOwnedIds].slice(0, limit);
}

export function resolveAlmostFinished(apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const minPct = getParam("almost_finished", params, "minAchievementPct");
  const minDeck = getParam("almost_finished", params, "minDeckLevel");
  return apps
    .filter((a) => !a.is_non_steam && (a.app_type === undefined || a.app_type === 1) && playtimeMinutes(a) > 0 && deckCompat(a) >= minDeck)
    .map((a) => ({ a, pct: achievementPercent(a.appid) ?? -1 }))
    .filter((x) => x.pct >= minPct && x.pct < 100)
    .sort((x, y) => y.pct - x.pct)
    .slice(0, limit)
    .map((x) => x.a.appid);
}

const CATEGORY_MODES: Partial<Record<SmartShelfMode, readonly number[]>> = {
  couch_gaming: [STORE_CATEGORY.sharedScreen, STORE_CATEGORY.sharedScreenPvp, STORE_CATEGORY.sharedScreenCoop],
  coop_ready: [STORE_CATEGORY.coop, STORE_CATEGORY.onlineCoop, STORE_CATEGORY.sharedScreenCoop, STORE_CATEGORY.lanCoop],
  party_games: [STORE_CATEGORY.sharedScreen, STORE_CATEGORY.sharedScreenPvp],
};

export function resolveByCategory(mode: SmartShelfMode, apps: AppOverview[], limit: number, params?: SmartParams): number[] {
  const minDeck = getParam(mode, params, "minDeckLevel");
  const ids = CATEGORY_MODES[mode] ?? [];
  return apps
    .filter((a) => !a.is_non_steam && (a.app_type === undefined || a.app_type === 1) && deckCompat(a) >= minDeck && hasStoreCategory(a.appid, ids) === true)
    .sort((a, b) => lastPlayedSec(b) - lastPlayedSec(a))
    .slice(0, limit)
    .map((a) => a.appid);
}

export async function prepareSmartModes(modes: string[], apps: AppOverview[]): Promise<void> {
  if (modes.includes("almost_finished")) await loadAchievements(apps);
}
