import { getCurrentSettings } from "../store/settingsStore";
import { buildShelfContextMenu } from "./steamGameMenu";
import { getFrontendLib } from "../runtime/host/decky";
import i18n from "i18next";

const dfl = getFrontendLib;
function react(): any {
  return (globalThis as any).SP_REACT;
}

const lbl = (key: string, fallback: string): string => {
  try { const v = i18n.t(key as any); return (typeof v === "string" && v && v !== key) ? v : fallback; } catch { return fallback; }
};

function hasMenuApis(d: any, R: any): boolean {
  return !!d?.showContextMenu && !!d?.Menu && !!R?.createElement;
}

function synthCardMenuTitle(cardText: string | undefined): string {
  return (typeof cardText === "string" && cardText.trim()) || lbl("card_options", "Options");
}

export function showSyntheticCardMenu(shelfId: string, anchor: HTMLElement | null, cardText?: string): void {
  const d = dfl();
  const R = react();
  if (!hasMenuApis(d, R)) return;
  const settings = getCurrentSettings();
  if (!settings) return;
  const shelves = (settings.shelves ?? []) as any[];
  const shelf = shelves.find((sh) => sh.id === shelfId);
  if (!shelf) return;

  // appid 0 skips the per-card actions and keeps only the shelf submenus.
  const shelfItems = buildShelfContextMenu(shelfId, 0, d, R);
  if (!shelfItems.length) return;
  // The card's own text when set, otherwise the generic "Options".
  const titleText = synthCardMenuTitle(cardText);
  const menu = R.createElement(
    d.Menu,
    { label: titleText, cancelText: lbl("cancel", "Cancel") },
    ...shelfItems,
  );
  try { d.showContextMenu(menu, anchor ?? null); } catch {}
}
