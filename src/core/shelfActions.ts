import { getCurrentSettings, saveSettings } from "../store/settingsStore";
import {
  addShelfToSettings,
  deleteShelfFromSettings,
  moveShelf as moveShelfInSettings,
  patchShelfInSettings,
} from "../domain/settings";
import { randomShelfId } from "../domain/defaults";
import type { Shelf } from "../types";

/**
 * Non-React shelf-action handlers callable from places that don't have a
 * SettingsController in scope (e.g. native game-capsule context menu).
 *
 * All mutate via `getCurrentSettings + saveSettings` so they participate in
 * the same persistence path as the QAM controller — no diverging state.
 */

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
  const shelf = s.shelves.find((sh) => sh.id === id);
  if (!shelf) return;
  await saveSettings(patchShelfInSettings(s, id, { hidden: !shelf.hidden }));
}

export async function moveShelfById(id: string, direction: -1 | 1): Promise<void> {
  const s = getCurrentSettings();
  if (!s) return;
  await saveSettings(moveShelfInSettings(s, id, direction));
}

export async function duplicateShelfById(id: string, copySuffix: string): Promise<void> {
  const s = getCurrentSettings();
  if (!s) return;
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
export function registerShelfModalHandler(h: ShelfModalHandler | null): void {
  modalHandler = h;
}
export function dispatchShelfModal(kind: ShelfModalKind, shelfId: string): void {
  try { modalHandler?.(kind, shelfId); } catch {}
}
