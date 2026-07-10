/* Registry of the plugin's runtime caches for the Advanced → Cache management
   panel: per-group size + one-click invalidation, plus a clear-all. Only the
   data caches are listed (not UI class names). Advanced-mode only. */

export interface CacheGroup {
  id: string;
  labelKey: string;           // i18n key
  keys: string[];             // exact localStorage keys backing this group
}

/* Only persisted (localStorage-backed) caches are listed, so every row shows a
   real byte size. The smart-shelf memo cache is in-memory and auto-invalidates
   on settings changes — it isn't a row; clear-all folds in its invalidation. */
export const CACHE_GROUPS: CacheGroup[] = [
  { id: "images", labelKey: "cache_group_images", keys: ["ds-images-v1"] },
  { id: "store", labelKey: "cache_group_store", keys: ["ds-store-cache-v1", "ds-store-cache-v3"] },
  { id: "wishlist", labelKey: "cache_group_wishlist", keys: ["ds-wishlist-cache-v1", "ds-price-cache-v1"] },
  { id: "metadata", labelKey: "cache_group_metadata", keys: ["ds-metadata-cache-v1", "ds-name-appid-v1", "ds-game-name-cache-v1"] },
  { id: "update", labelKey: "cache_group_update", keys: ["ds-update-check-v1"] },
];

/** Bytes held in localStorage for a group. */
export function groupSizeBytes(g: CacheGroup): number {
  let n = 0;
  for (const k of g.keys) {
    try { const v = localStorage.getItem(k); if (v) n += v.length; } catch { /* private mode */ }
  }
  return n;
}

/** Drop a group's persisted keys. */
export function clearGroup(g: CacheGroup): void {
  for (const k of g.keys) {
    try { localStorage.removeItem(k); } catch { /* best effort */ }
  }
}

export function clearAllCaches(): void {
  for (const g of CACHE_GROUPS) clearGroup(g);
  try { (require("../steam/smartShelves") as typeof import("../steam/smartShelves")).invalidateSmartShelfCache(); } catch { /* not loaded */ }
}

export function formatBytes(n: number): string {
  if (n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
