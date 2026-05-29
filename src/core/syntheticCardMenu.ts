// Fallback context menu for synthetic (decoration) cards.
//
// Real game cards go through Steam's native AppContextMenu (extended
// with `buildDeckShelvesMenuItems`). Synthetic cards aren't apps —
// there's no overview to feed the native menu, so we open our own DFL
// menu carrying just the DS-side actions: hide / highlight toggle,
// add-to-shelf, edit decoration (jumps to the Decoration tab).
import { getCurrentSettings, saveSettings } from "../store/settingsStore";
import { patchShelfInSettings } from "../domain/settings";
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
  if (!d?.showContextMenu || !d?.Menu || !d?.MenuItem || !R?.createElement) return;
  const settings = getCurrentSettings();
  if (!settings) return;
  const shelves = (settings.shelves ?? []) as any[];
  const idx = shelves.findIndex((sh) => sh.id === shelfId);
  if (idx < 0) return;
  const shelf = shelves[idx];

  const item = (key: string, label: string, onSelected: () => void, disabled?: boolean) =>
    R.createElement(d.MenuItem, { key, onSelected, disabled }, label);
  const group = (key: string, label: string, ...children: any[]) =>
    R.createElement(d.MenuGroup ?? d.Menu, { key, label }, ...children);

  // Toggle whole-shelf flags — keeps shape parity with the game-card menu.
  const highlightAll = !!shelf.highlightAll;
  const isHidden = !!shelf.hidden;

  const items: any[] = [];
  items.push(item(
    "ds-syn-highlight-all",
    highlightAll
      ? `✓ ${lbl("remove_highlight", "Remove highlight")}`
      : lbl("highlight_this", "Highlight this game"),
    () => {
      const s = getCurrentSettings(); if (!s) return;
      void saveSettings(patchShelfInSettings(s, shelfId, { highlightAll: !highlightAll }));
    },
  ));
  items.push(item(
    "ds-syn-hide-shelf",
    isHidden ? lbl("show_shelf", "Show shelf") : lbl("hide_shelf", "Hide shelf"),
    () => {
      const s = getCurrentSettings(); if (!s) return;
      void saveSettings(patchShelfInSettings(s, shelfId, { hidden: !isHidden }));
    },
  ));
  items.push(item(
    "ds-syn-edit-decoration",
    lbl("menu_decoration", "Decoration"),
    () => dispatchShelfModal("edit", shelfId, { initialTab: "decoration" }),
  ));

  // Reuse the same shelf grouping pattern so the menu feels consistent
  // with the regular card menu — single top-level "Shelf" submenu.
  const menu = R.createElement(d.Menu, { label: shelf.title ?? "Shelf", cancelText: lbl("cancel", "Cancel") },
    group("ds-syn-root", lbl("menu_shelf", "Shelf"), ...items),
  );
  try { d.showContextMenu(menu, anchor ?? null); } catch {}
}
