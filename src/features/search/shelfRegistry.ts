// Tiny in-memory index of resolved shelf items so Quick Search can hit
// EVERY item the user has on screen — including cards waiting to render,
// virtualised cards, or items below the fold whose DOM nodes haven't
// mounted yet. Each Shelf component publishes its resolved items here on
// every items/appIds change; the search provider reads the snapshot.

export interface RegisteredItem { appid: number; name: string }
export interface RegisteredShelf {
  shelfId: string;
  title: string;
  items: RegisteredItem[];
  order: number;
  updatedAt: number;
}

const registry = new Map<string, RegisteredShelf>();
let orderCounter = 0;

export function publishShelf(shelfId: string, title: string, items: RegisteredItem[]): void {
  const prev = registry.get(shelfId);
  registry.set(shelfId, {
    shelfId,
    title,
    items,
    order: prev?.order ?? ++orderCounter,
    updatedAt: Date.now(),
  });
  try { (globalThis as any).__ds_shelf_registry_size = registry.size; } catch {}
}

export function unpublishShelf(shelfId: string): void {
  registry.delete(shelfId);
}

export function readRegistry(): RegisteredShelf[] {
  return Array.from(registry.values()).sort((a, b) => a.order - b.order);
}
