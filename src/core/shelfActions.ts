import { getCurrentSettings, saveSettings } from "../store/settingsStore";
import {
  addShelfToSettings,
  deleteShelfFromSettings,
  moveShelf as moveShelfInSettings,
  patchShelfInSettings,
} from "../domain/settings";
import { randomShelfId } from "../domain/defaults";
import type { Shelf, SmartShelf } from "../types";

/** Returns whether the given id belongs to the smart-shelves list. Regular
 *  and smart shelves have disjoint id spaces in practice but we look at the
 *  smart list directly to avoid relying on naming conventions. */
function isSmartShelfId(id: string): boolean {
  const s = getCurrentSettings();
  if (!s) return false;
  return (s.smartShelves ?? []).some((sh: SmartShelf) => sh.id === id);
}

/**
 * Non-React shelf-action handlers callable from places that don't have a
 * SettingsController in scope (e.g. native game-capsule context menu).
 *
 * All mutate via `getCurrentSettings + saveSettings` so they participate in
 * the same persistence path as the QAM controller — no diverging state.
 */

/** Clears online feature caches (store, wishlist, price, name). */
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
  // No `triggerShelfRefresh()` here: callers know which shelf the user
  // clicked, so they fire the trigger with a `shelfId` scope so only that
  // shelf shows the visual indicator. Triggering from inside this helper
  // would force every online shelf to flash on a single-shelf click.
}

export async function patchShelfById(id: string, patch: Partial<Shelf>): Promise<void> {
  const s = getCurrentSettings();
  if (!s) return;
  const shelf = s.shelves.find((sh) => sh.id === id);
  if (!shelf) return;
  await saveSettings(patchShelfInSettings(s, id, patch));
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

export async function deleteShelfById(id: string): Promise<void> {
  const s = getCurrentSettings();
  if (!s) return;
  if (isSmartShelfId(id)) {
    await saveSettings({ ...s, smartShelves: (s.smartShelves ?? []).filter((sh) => sh.id !== id) });
    return;
  }
  await saveSettings(deleteShelfFromSettings(s, id));
}

/**
 * Persists the collapsed state for a shelf and notifies any mounted DeckRow
 * via a window event so the home view updates without remount.
 */
export function setShelfCollapsed(shelfId: string, collapsed: boolean): void {
  try {
    if (collapsed) localStorage.setItem(`ds-collapsed-${shelfId}`, "1");
    else localStorage.removeItem(`ds-collapsed-${shelfId}`);
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent("ds-shelf-collapsed", { detail: { shelfId, collapsed } }));
  } catch {}
}

/**
 * Edit / Delete need the React modal flow (controller + ConfirmModal). The
 * QAM controller registers a handler at mount; non-React callers dispatch
 * via the registry so the modal opens through the existing managed-modal
 * primitive. When no controller is mounted, the action is a silent no-op.
 */
type ShelfModalKind = "edit" | "delete";
type ShelfModalHandler = (kind: ShelfModalKind, shelfId: string) => void;

let modalHandler: ShelfModalHandler | null = null;
let pendingModal: { kind: ShelfModalKind; shelfId: string } | null = null;

export function registerShelfModalHandler(h: ShelfModalHandler | null): void {
  modalHandler = h;
  if (h && pendingModal) {
    const p = pendingModal;
    pendingModal = null;
    // Defer one tick so SettingsView finishes mounting before opening the modal.
    try { setTimeout(() => { try { h(p.kind, p.shelfId); } catch {} }, 0); } catch {}
  }
}

export function dispatchShelfModal(kind: ShelfModalKind, shelfId: string, opts?: { initialTab?: string }): void {
  if (opts?.initialTab) {
    try { (globalThis as any).__DECK_SHELVES_PENDING_TAB__ = String(opts.initialTab); } catch {}
  }
  // Primary path: navigate to a dedicated route that mounts a standalone
  // SettingsController and opens the modal via DFL.showModal — no QAM
  // dependency. Uses a `Navigation.Navigate('/route/:id')` pattern. The
  // route handlers are registered in src/index.tsx at boot.
  try {
    const nav: any = (globalThis as any).DFL?.Navigation
      ?? (globalThis as any).Navigation
      ?? (globalThis as any).window?.Navigation;
    if (typeof nav?.Navigate === "function") {
      try { nav?.CloseSideMenus?.(); } catch {}
      nav.Navigate(`/deck-shelves/${kind}/${encodeURIComponent(shelfId)}`);
      return;
    }
  } catch {}
  // Fallback: if Navigation.Navigate isn't available (very old build),
  // queue the action and try the QAM modalHandler when it registers.
  if (modalHandler) {
    try { modalHandler(kind, shelfId); } catch {}
    return;
  }
  pendingModal = { kind, shelfId };
}
