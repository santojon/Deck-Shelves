// Fallback context menu for synthetic (decoration) cards.
//
// Real game cards go through Steam's native AppContextMenu (extended
// with `buildDeckShelvesMenuItems`). Synthetic cards aren't apps —
// there's no overview to feed the native menu, so we open our own DFL
// menu reusing the SAME shelf-level builder (`buildShelfContextMenu`)
// the online shelves use. Passing appid=0 skips the per-card actions
// (highlight this game / hide from shelf / add to shelf / remove from
// shelf) — only the shelf-scoped items (Management, Display, Visual,
// sort direction) come through, which is everything a decoration card
// should expose.
import { getCurrentSettings } from "../store/settingsStore";
import { buildShelfContextMenu } from "./steamGameMenu";
import { dispatchShelfModal } from "./shelfActions";
import i18n from "i18next";

function dfl(): any {
  return (globalThis as any).DFL ?? (globalThis as any).deckyFrontendLib;
}
function react(): any {
  return (globalThis as any).SP_REACT;
}

const lbl = (key: string, fallback: string): string => {
  try { const v = i18n.t(key as any); return (typeof v === "string" && v && v !== key) ? v : fallback; } catch { return fallback; }
};

export function showSyntheticCardMenu(shelfId: string, anchor: HTMLElement | null): void {
  const d = dfl();
  const R = react();
  if (!d?.showContextMenu || !d?.Menu || !R?.createElement) return;
  const settings = getCurrentSettings();
  if (!settings) return;
  const shelves = (settings.shelves ?? []) as any[];
  const shelf = shelves.find((sh) => sh.id === shelfId);
  if (!shelf) return;

  // appid=0 → buildDeckShelvesMenuItems skips its per-card branch (no
  // highlight-this / hide-from-shelf / add-to-shelf), keeping only the
  // shelf-scoped submenus. Decoration submenu is already INSIDE the
  // "Shelf" group at the same rank as Display / Visual.
  const shelfItems = buildShelfContextMenu(shelfId, 0, d, R);
  if (!shelfItems.length) return;
  const menu = R.createElement(
    d.Menu,
    { label: shelf.title ?? "Shelf", cancelText: lbl("cancel", "Cancel") },
    ...shelfItems,
  );
  try { d.showContextMenu(menu, anchor ?? null); } catch {}
}
