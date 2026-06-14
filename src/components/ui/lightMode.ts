import { useEffect, useState } from "react";
import { getCurrentSettings, subscribeSettings } from "../../settingsStore";

export function useLightMode(): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => (getCurrentSettings() as any)?.lightModeEnabled === true);
  useEffect(() => {
    return subscribeSettings((s) => {
      setEnabled((s as any)?.lightModeEnabled === true);
    });
  }, []);
  return enabled;
}
