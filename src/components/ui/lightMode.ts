import { useEffect, useState } from "react";
import { getCurrentSettings, subscribeSettings } from "../../settingsStore";

function useSettingsBool(key: string): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => (getCurrentSettings() as any)?.[key] === true);
  useEffect(() => subscribeSettings((s) => setEnabled((s as any)?.[key] === true)), [key]);
  return enabled;
}

export function useLightMode(): boolean {
  return useSettingsBool("lightModeEnabled");
}

export function useAdvancedMode(): boolean {
  return useSettingsBool("advancedModeEnabled");
}
