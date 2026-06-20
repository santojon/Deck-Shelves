import { useEffect, useState } from "react";
import { getCurrentSettings, subscribeSettings } from "../../settingsStore";

export function useOfflineMode(): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => (getCurrentSettings() as any)?.offlineModeEnabled === true);
  useEffect(() => {
    return subscribeSettings((s) => {
      setEnabled((s as any)?.offlineModeEnabled === true);
    });
  }, []);
  return enabled;
}

// Synchronous reader for non-React callers (updateNotifier, asset URL
// builders, online resolvers). Reads live settings without subscribing.
export function isOfflineModeOn(): boolean {
  return (getCurrentSettings() as any)?.offlineModeEnabled === true;
}
