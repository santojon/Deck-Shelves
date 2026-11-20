import type { AppOverview } from "./index";
import { isNonSteamOf } from "./appOverview";
import { getDeviceProfile } from "../runtime/deviceState";
import { compatCategoryForFamily } from "../domain/deviceProfile";

export function playtimeMinutes(app: AppOverview): number {
  return Number(app.playtime_forever ?? 0);
}

export function lastPlayedSec(app: AppOverview): number {
  return Number(app.last_played ?? 0);
}

export function deckCompat(app: AppOverview): number {
  const own = compatCategoryForFamily(getDeviceProfile().family, {
    deckCompatCategory: app.deck_compatibility_category,
    machineCompatCategory: (app as any).machine_compatibility_category,
    frameCompatCategory: (app as any).frame_compatibility_category,
  });
  return Number(own ?? app.deck_compatibility_category ?? 0);
}

export function rtAcquired(app: AppOverview): number {
  return Number(app.rt_purchased_time ?? app.user_added_ts ?? 0);
}

export function isGameCandidate(app: AppOverview): boolean {
  return isNonSteamOf(app) || app.app_type === undefined || app.app_type === 1;
}
