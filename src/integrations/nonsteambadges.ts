import { isNonSteamBadgesInstalled } from './registry';
import { getPreferredSteamDocument } from '../runtime/steamHost';

export const NON_STEAM_BADGE_CLASS = 'nonsteam-badge';

export function isNonSteamBadgesAvailable(): boolean {
  const qa = __DEV__ && typeof __QA_FORCE_NONSTEAMBADGES__ !== "undefined" ? __QA_FORCE_NONSTEAMBADGES__ : "";
  if (qa === "present") return true;
  if (qa === "absent") return false;
  if (isNonSteamBadgesInstalled()) return true;
  try {
    const doc = getPreferredSteamDocument() ?? (typeof document !== 'undefined' ? document : null);
    if (!doc) return false;
    return !!doc.querySelector('.' + NON_STEAM_BADGE_CLASS);
  } catch {
    return false;
  }
}
