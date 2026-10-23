import { call } from "./host/decky";
import { triggerShelfRefresh } from "../core/shelfRefresh";

/* Tags the tools that add non-Steam shortcuts (ROM managers, launcher
   integrations) write into Steam's shortcuts file, read by the backend and
   used by the Parser categories filter. Fetched only while a configuration
   uses that filter (see featureDemand), at idle and then every 15 min. */

const TTL_MS = 15 * 60 * 1000;
const KEY = "__ds_shortcut_tags_v1";

export function shortcutTagsFor(appid: number): string[] {
  const tags = (globalThis as any)[KEY]?.[String(appid)];
  return Array.isArray(tags) ? tags.map(String) : [];
}

async function refreshShortcutTags(): Promise<void> {
  try {
    const res: any = await call("get_shortcut_tags", {});
    if (!res?.ok || !res.tags || typeof res.tags !== "object") return;
    const before = JSON.stringify((globalThis as any)[KEY] ?? null);
    (globalThis as any)[KEY] = res.tags;
    if (JSON.stringify(res.tags) !== before) triggerShelfRefresh();
  } catch {}
}

export function installShortcutTagsPoll(): () => void {
  const g = globalThis as any;
  let cancelled = false;
  const run = () => { if (!cancelled) void refreshShortcutTags(); };
  if (g.requestIdleCallback) g.requestIdleCallback(run, { timeout: 5000 });
  else setTimeout(run, 1500);
  const interval = setInterval(run, TTL_MS);
  return () => { cancelled = true; clearInterval(interval); };
}
