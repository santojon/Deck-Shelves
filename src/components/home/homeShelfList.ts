import type { Settings, SmartShelfMode } from "../../types";
import { nextVisibilityFlip, getModeVisibilityWindows } from "../../steam/smartShelves";

export const SURPRISE_MODES: SmartShelfMode[] = [
  "daily_pick", "deck_picks", "on_deck", "recently_played", "long_session",
  "random_pick", "not_started", "best_unplayed", "quick_play", "interrupted",
  "non_steam", "spare_time", "time_of_day", "rediscover", "forgotten",
];

export function computeNormalFirst(settings: Settings, replaceInjecting: boolean, replaceKillSwitch: boolean): boolean {
  return settings.smartShelvesAtBottom
    || (settings.hideRecents === true && !(replaceInjecting && !replaceKillSwitch));
}

export function explicitShelfOrder(settings: Settings): string[] {
  return ((settings as any).allShelvesOrder ?? []) as string[];
}

export function computeEarliestFlip(smartList: any[], now: Date): { earliest: number | null; timeAwareIds: string[] } {
  let earliest: number | null = null;
  const timeAwareIds: string[] = [];
  for (const s of smartList) {
    const w = (s as any).visibleHours ?? getModeVisibilityWindows((s as any).mode);
    const entry = { visibility: (s as any).visibility, visibleHours: w, visibleDaysOfWeek: (s as any).visibleDaysOfWeek };
    const next = nextVisibilityFlip(entry, now);
    if (next == null) continue;
    timeAwareIds.push((s as any).id);
    if (earliest == null || next < earliest) earliest = next;
  }
  return { earliest, timeAwareIds };
}
