// Fallback context menu for synthetic (decoration) cards.
//
// Synthetic cards open a DS-built DFL menu (no native overview).
// Reuses buildShelfContextMenu with appid=0 to skip per-card actions.
import { getCurrentSettings } from "../store/settingsStore";
import { buildShelfContextMenu } from "./steamGameMenu";
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

export function showSyntheticCardMenu(shelfId: string, anchor: HTMLElement | null, cardText?: string): void {
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
  // Menu title: the synthetic card's own text when set (e.g. a labeled
  // decoration card), otherwise the generic "Options" — matches the
  // on-card menu-button hint, since neither the shelf name nor "Shelf"
  // is the natural identity for a focused decoration card.
  const titleText = (typeof cardText === "string" && cardText.trim()) || lbl("card_options", "Options");
  const menu = R.createElement(
    d.Menu,
    { label: titleText, cancelText: lbl("cancel", "Cancel") },
    ...shelfItems,
  );
  try { d.showContextMenu(menu, anchor ?? null); } catch {}
}
