import type { AppOverview } from "./index";

/**
 * Normalize a game title for cross-source name matching.
 *
 * Online wishlist / store entries arrive with the official Steam title
 * (e.g. "Kingdom Come: Deliverance"), while non-Steam shortcuts that
 * the user created or that Unifideck imported often spell the same
 * game without punctuation (e.g. "Kingdom Come Deliverance"). Exact
 * lowercase compare misses these matches and leaves the wishlist row
 * advertising games the user already owns locally.
 *
 * The normalisation:
 *   - lowercases
 *   - strips trademark / copyright / registered marks
 *   - replaces every non-alphanumeric character (incl. punctuation and
 *     accented punctuation) with a single space
 *   - collapses whitespace and trims
 *
 * Accented letters are preserved so locale-specific titles still match
 * across sources ("Hadès" stays distinct from "Hades" only when one
 * side genuinely uses the accent).
 */
export function normalizeTitleForMatch(name: string | undefined | null): string {
  if (!name) return "";
  return String(name)
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
  // Use the same normalisation the online-shelves name-dedup uses
  // (lowercases, strips trademark glyphs, collapses non-alphanumeric
  // runs). Without this, "Kingdom Come Deliverance" and "Kingdom Come:
  // Deliverance" stayed as separate buckets even with dedup on.
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
