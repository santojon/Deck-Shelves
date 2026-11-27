import { getCurrentSettings } from "../../store/settingsStore";

export function isOfflineModeOn(): boolean {
  return (getCurrentSettings() as any)?.offlineModeEnabled === true;
}
