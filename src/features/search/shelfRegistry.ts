import { devStamp } from "../../runtime/devStamps";

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
  devStamp("__ds_shelf_registry_size", registry.size);
}

export function unpublishShelf(shelfId: string): void {
  registry.delete(shelfId);
}

export function readRegistry(): RegisteredShelf[] {
  return Array.from(registry.values()).sort((a, b) => a.order - b.order);
}
