/* Registry of the plugin's runtime caches for the Advanced → Cache management
   panel: per-group size + one-click invalidation, plus a clear-all. Only the
   data caches are listed (not UI class names). Advanced-mode only. */

export interface CacheGroup {
  id: string;
  labelKey: string;           // i18n key
  keys: string[];             // exact localStorage keys backing this group
}

/* Only persisted (localStorage-backed) caches are listed, so every row shows a
   real byte size. Deliberately NOT listed, each for its own reason:
   `ds-pinned-games-v1` is a user choice, not a cache. `ds-history-v1` is
   read-only from our side — not ours to offer clearing. `ds_device_history_v1`
   backs the Statistics usage counters, not a performance cache. */
export const CACHE_GROUPS: CacheGroup[] = [
  { id: "images", labelKey: "cache_group_images", keys: ["ds-images-v1"] },
  { id: "store", labelKey: "cache_group_store", keys: ["ds-store-cache-v1", "ds-store-cache-v3"] },
  { id: "wishlist", labelKey: "cache_group_wishlist", keys: ["ds-wishlist-cache-v1", "ds-price-cache-v1"] },
  { id: "metadata", labelKey: "cache_group_metadata", keys: ["ds-metadata-cache-v1", "ds-name-appid-v1", "ds-game-name-cache-v1"] },
  { id: "update", labelKey: "cache_group_update", keys: ["ds-update-check-v1"] },
  { id: "smart_shelves", labelKey: "cache_group_smart_shelves", keys: ["ds-smart-shelf-cache-v1"] },
  { id: "catalog", labelKey: "cache_group_catalog", keys: ["ds-catalog-meta-cache-v1"] },
  { id: "screenshots", labelKey: "cache_group_screenshots", keys: ["ds-screenshot-cache-v1"] },
  { id: "tabs", labelKey: "cache_group_tabs", keys: ["ds-tabs-cache-v1"] },
  { id: "theme_discovery", labelKey: "cache_group_theme_discovery", keys: ["ds_class_map", "ds_qam_panel_classes"] },
  { id: "adaptive_timeout", labelKey: "cache_group_adaptive_timeout", keys: ["ds-adaptive-timeout-v1"] },
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
  /* The smart-shelf group's localStorage key is a mirror of an in-memory
     Map (`resolverCache`) — removing just the key leaves that Map live, so
     the next unrelated cache write would silently resurrect it. Clearing
     the in-memory side here keeps the two in sync. */
  if (g.id === "smart_shelves") {
    try { (require("../steam/smartShelves") as typeof import("../steam/smartShelves")).invalidateSmartShelfCache(); } catch { /* not loaded */ }
  }
}

export function clearAllCaches(): void {
  for (const g of CACHE_GROUPS) clearGroup(g);
}

export function formatBytes(n: number): string {
  if (n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
