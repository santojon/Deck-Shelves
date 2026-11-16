import { getCurrentSettings, saveSettings } from "../store/settingsStore";
import { addShelfToSettings, moveShelf as moveShelfInSettings, patchShelfInSettings } from "../domain/settings";
import { randomShelfId } from "../domain/defaults";
import { getFrontendLib } from "../runtime/host/decky";
import type { Shelf, SmartShelf } from "../types";

function isSmartShelfId(id: string): boolean {
  const s = getCurrentSettings();
  if (!s) return false;
  return (s.smartShelves ?? []).some((sh: SmartShelf) => sh.id === id);
}

export function clearOnlineShelfCache(): void {
  const keys = [
    "ds-store-cache-v1",
    "ds-wishlist-cache-v1",
    "ds-price-cache-v1",
    "ds-game-name-cache-v1",
  ];
  try {
    for (const k of keys) (globalThis as any).localStorage?.removeItem?.(k);
  } catch {}
  // Callers trigger the refresh scoped to the clicked shelf, so only that shelf flashes.
}

export async function toggleShelfHiddenById(id: string): Promise<void> {
  const s = getCurrentSettings();
  if (!s) return;
  if (isSmartShelfId(id)) {
    const updated = (s.smartShelves ?? []).map((sh) => sh.id === id ? { ...sh, hidden: !sh.hidden } : sh);
    await saveSettings({ ...s, smartShelves: updated });
    return;
  }
  const shelf = s.shelves.find((sh) => sh.id === id);
  if (!shelf) return;
  await saveSettings(patchShelfInSettings(s, id, { hidden: !shelf.hidden }));
}

export async function moveShelfById(id: string, direction: -1 | 1): Promise<void> {
  const s = getCurrentSettings();
  if (!s) return;
  if (isSmartShelfId(id)) {
    const list = [...(s.smartShelves ?? [])];
    const idx = list.findIndex((sh) => sh.id === id);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    await saveSettings({ ...s, smartShelves: list });
    return;
  }
  await saveSettings(moveShelfInSettings(s, id, direction));
}

export async function duplicateShelfById(id: string, copySuffix: string): Promise<void> {
  const s = getCurrentSettings();
  if (!s) return;
  if (isSmartShelfId(id)) {
    const list = s.smartShelves ?? [];
    const source = list.find((sh) => sh.id === id);
    if (!source) return;
    const dup: SmartShelf = JSON.parse(JSON.stringify(source));
    dup.id = randomShelfId();
    dup.title = `${source.title} ${copySuffix}`.trim();
    const idx = list.findIndex((sh) => sh.id === id);
    const next = [...list];
    next.splice(idx + 1, 0, dup);
    await saveSettings({ ...s, smartShelves: next });
    return;
  }
  const sourceShelf = s.shelves.find((sh) => sh.id === id);
  if (!sourceShelf) return;
  const duplicate: Shelf = JSON.parse(JSON.stringify(sourceShelf));
  duplicate.id = randomShelfId();
  duplicate.title = `${sourceShelf.title} ${copySuffix}`.trim();
  await saveSettings(addShelfToSettings(s, duplicate, id));
}

export function setShelfCollapsed(shelfId: string, collapsed: boolean): void {
  try {
    if (collapsed) localStorage.setItem(`ds-collapsed-${shelfId}`, "1");
    else localStorage.removeItem(`ds-collapsed-${shelfId}`);
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent("ds-shelf-collapsed", { detail: { shelfId, collapsed } }));
  } catch {}
}

type ShelfModalKind = "edit" | "delete";
type ShelfModalHandler = (kind: ShelfModalKind, shelfId: string) => void;

let modalHandler: ShelfModalHandler | null = null;
let pendingModal: { kind: ShelfModalKind; shelfId: string } | null = null;

export function registerShelfModalHandler(h: ShelfModalHandler | null): void {
  modalHandler = h;
  if (h && pendingModal) {
    const p = pendingModal;
    pendingModal = null;
    // One tick so settings finish mounting before the modal opens.
    try { setTimeout(() => { try { h(p.kind, p.shelfId); } catch {} }, 0); } catch {}
  }
}

let _pendingShelfModalTab: string | null = null;
export function consumePendingShelfModalTab(): string | null {
  const v = _pendingShelfModalTab;
  _pendingShelfModalTab = null;
  return v;
}

function resolveNavigationApi(): any {
  // `Navigation` may also be a standalone global on some hosts.
  const g = globalThis as any;
  return getFrontendLib()?.Navigation ?? g.Navigation ?? g.window?.Navigation;
}

// A dedicated route opens the modal without depending on the QAM.
function tryNavigateToShelfModal(kind: ShelfModalKind, shelfId: string): boolean {
  try {
    const nav = resolveNavigationApi();
    if (typeof nav?.Navigate !== "function") return false;
    try { nav?.CloseSideMenus?.(); } catch {}
    nav.Navigate(`/deck-shelves/${kind}/${encodeURIComponent(shelfId)}`);
    return true;
  } catch { return false; }
}

export function dispatchShelfModal(kind: ShelfModalKind, shelfId: string, opts?: { initialTab?: string }): void {
  if (opts?.initialTab) _pendingShelfModalTab = String(opts.initialTab);
  if (tryNavigateToShelfModal(kind, shelfId)) return;
  if (modalHandler) {
    try { modalHandler(kind, shelfId); } catch {}
    return;
  }
  pendingModal = { kind, shelfId };
}

export function dispatchTagsModal(appid: number): void {
  try {
    const nav = resolveNavigationApi();
    if (typeof nav?.Navigate !== "function") return;
    try { nav?.CloseSideMenus?.(); } catch {}
    nav.Navigate(`/deck-shelves/tags/${encodeURIComponent(String(appid))}`);
  } catch {}
}

// The native game menu has no QAM controller, so this also goes through a route.
export function dispatchComposeModal(sourceId: string, targetId: string): void {
  try {
    const nav = resolveNavigationApi();
    if (typeof nav?.Navigate !== "function") return;
    try { nav?.CloseSideMenus?.(); } catch {}
    nav.Navigate(`/deck-shelves/compose/${encodeURIComponent(sourceId)}/${encodeURIComponent(targetId)}`);
  } catch {}
}
