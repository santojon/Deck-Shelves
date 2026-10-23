
import { getCurrentSettings } from "../../settingsStore";

// Synchronous reader for non-React callers (updateNotifier, asset URL
// builders, online resolvers). Reads live settings without subscribing.
export function isOfflineModeOn(): boolean {
  return (getCurrentSettings() as any)?.offlineModeEnabled === true;
}
