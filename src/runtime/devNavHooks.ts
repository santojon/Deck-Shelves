import { Navigation } from "./host/decky";
import { getFocusedDsCardAppid } from "../core/focusRestore";
import { countNavTreeDsCards } from "../components/home/mountUtils";

/* Dev-only globals for on-device drivers (the back-nav gate, perf probes):
   real Steam navigation + nav-tree facts through the plugin's own host
   abstraction, so a probe never has to reach for a loader-specific global
   and works the same under any host. Installed by boot() in dev builds only. */
export function installDevNavHooks(): () => void {
  const g = globalThis as any;
  g.__ds_dev_navigate = (path: string): boolean => {
    try { Navigation.Navigate(String(path)); return true; } catch { return false; }
  };
  g.__ds_dev_navigate_back = (): boolean => {
    try { Navigation.NavigateBack(); return true; } catch { return false; }
  };
  // Focused DS card per Steam's own nav tree/context (the `gpfocus` class is
  // not reliable on every client build), as its appid — null when none.
  g.__ds_dev_nav_focus = (): string | null => {
    try { return getFocusedDsCardAppid(); } catch { return null; }
  };
  g.__ds_dev_nav_tree = (): { total: number; dsCards: number } | null => {
    try { return countNavTreeDsCards(); } catch { return null; }
  };
  return () => {
    for (const k of ["__ds_dev_navigate", "__ds_dev_navigate_back", "__ds_dev_nav_focus", "__ds_dev_nav_tree"]) {
      try { delete g[k]; } catch {}
    }
  };
}
