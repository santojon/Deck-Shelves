import { getCurrentSettings } from "../../settingsStore";

export function isOfflineModeOn(): boolean {
  return (getCurrentSettings() as any)?.offlineModeEnabled === true;
}
