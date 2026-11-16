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

function dedupeByName(
  apps: { appid: number; name: string; isSteam: boolean }[],
): number[] {
  const seen = new Map<string, number>();
  for (const a of apps) {
    const key = normalizeTitleForMatch(a.name);
    if (!key) continue;
    if (!seen.has(key)) {
      seen.set(key, a.appid);
    } else if (a.isSteam) {
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
