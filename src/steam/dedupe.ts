import type { AppOverview } from "./index";

/**
 * Collapse duplicate names in an app list.
 *
 * Within each exact-name group (case-sensitive, trim only):
 *   - keep the first Steam app (`isNonSteam === false`) if one exists;
 *   - otherwise keep the first entry.
 *
 * The input ordering is preserved for surviving entries.
 */
export function dedupeByName(
  apps: { appid: number; name: string; isSteam: boolean }[],
): number[] {
  const seen = new Map<string, number>(); // name → appid of winner
  for (const a of apps) {
    const key = a.name.trim();
    if (!seen.has(key)) {
      seen.set(key, a.appid);
    } else if (a.isSteam) {
      // Steam entry displaces a previously-seen non-Steam entry for this name
      const prev = apps.find((x) => x.appid === seen.get(key));
      if (prev && !prev.isSteam) {
        seen.set(key, a.appid);
      }
    }
  }
  const winners = new Set(seen.values());
  return apps.filter((a) => winners.has(a.appid)).map((a) => a.appid);
}

/**
 * Apply name-dedup to a list of appids given the full app pool.
 * Returns the filtered id list in the same relative order.
 */
export function dedupeAppIdsByName(
  ids: number[],
  all: AppOverview[],
): number[] {
  const byId = new Map<number, AppOverview>();
  for (const a of all) byId.set(Number(a.appid), a);

  const apps = ids.map((id) => {
    const a = byId.get(id);
    const name = String(a?.display_name ?? `App ${id}`).trim();
    const isSteam = a ? !(a as any).is_non_steam : true;
    return { appid: id, name, isSteam };
  });

  return dedupeByName(apps);
}
