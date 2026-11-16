export interface CacheGroup {
  id: string;
  labelKey: string;
  keys: string[];
}

// The user's game lists and device history are deliberately not listed.
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

export function groupSizeBytes(g: CacheGroup): number {
  let n = 0;
  for (const k of g.keys) {
    try { const v = localStorage.getItem(k); if (v) n += v.length; } catch {}
  }
  return n;
}

export function clearGroup(g: CacheGroup): void {
  for (const k of g.keys) {
    try { localStorage.removeItem(k); } catch {}
  }
  // The key mirrors an in-memory map; clear both or the next cache write brings it back.
  if (g.id === "smart_shelves") {
    try { (require("../steam/smartShelves") as typeof import("../steam/smartShelves")).invalidateSmartShelfCache(); } catch {}
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
