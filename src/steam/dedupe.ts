import type { AppOverview } from "./index";

export function normalizeTitleForMatch(name: string | undefined | null): string {
  if (!name) return "";
  return String(name)
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function dedupeByName(
  apps: { appid: number; name: string; isSteam: boolean }[],
): number[] {
  /* Use the same normalisation the online-shelves name-dedup uses
     (lowercases, strips trademark glyphs, collapses non-alphanumeric
     runs). Without this, "Kingdom Come Deliverance" and "Kingdom Come:
     Deliverance" stayed as separate buckets even with dedup on. */
  const seen = new Map<string, number>(); // normalised name → appid of winner
  for (const a of apps) {
    const key = normalizeTitleForMatch(a.name);
    if (!key) continue; // empty after normalise — can't compare
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
