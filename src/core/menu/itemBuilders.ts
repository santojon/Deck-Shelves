/* Menu-item builders extracted from steamGameMenu.ts to keep the
   orchestration file under the 1k-line cap. Pure construction — no
   module-global reads. `activeAppId` / `activeCardIndex` flow in from
   the caller so the builder stays a function of its inputs. */
import { MenuGroup as DeckyMenuGroup, MenuItem as DeckyMenuItem } from "../../runtime/host/decky";
import i18n from "../../i18n";
import { getCurrentSettings, saveSettings } from "../../store/settingsStore";
import {
  toggleShelfHiddenById,
  moveShelfById,
  duplicateShelfById,
  setShelfCollapsed,
  dispatchShelfModal,
  clearOnlineShelfCache,
} from "../shelfActions";
import { patchShelfInSettings } from "../../domain/settings";
import { saveFocusTarget, beginFocusRestoreLoop } from "../focusRestore";
import { invalidateRandomSortCache } from "../../steam";
import { invalidateSmartShelfCache } from "../../steam/smartShelves";
import { triggerShelfRefresh } from "../shelfRefresh";
import { isOnlineSource } from "../../domain/sourceUtils";

function tLabel(key: string, fallback: string): string {
  try { const v = i18n.t(key as any); return (typeof v === "string" && v && v !== key) ? v : fallback; } catch { return fallback; }
}

function locateShelf(settings: any, shelfId: string): { shelf: any; idx: number; listLen: number; isSmart: boolean } | null {
  const shelves = settings.shelves ?? [];
  let idx = shelves.findIndex((sh: any) => sh.id === shelfId);
  if (idx >= 0) return { shelf: shelves[idx], idx, listLen: shelves.length, isSmart: false };
  const smartShelves = settings.smartShelves ?? [];
  idx = smartShelves.findIndex((sh: any) => sh.id === shelfId);
  if (idx >= 0) return { shelf: smartShelves[idx], idx, listLen: smartShelves.length, isSmart: true };
  return null;
}

function readCollapsedFromStorage(shelfId: string): boolean {
  try { return (globalThis as any).localStorage?.getItem?.(`ds-collapsed-${shelfId}`) === "1"; } catch { return false; }
}

function isRandomFilterSource(src: any): boolean {
  return src?.type === "filter" && src?.filter?.sort === "random";
}

function shelfNeedsManualRefresh(shelf: any, isSmart: boolean): boolean {
  if (isSmart) return true;
  const src: any = shelf?.source;
  if (isOnlineSource(src)) return true;
  if (src?.type === "smart") return true;
  if (shelf?.sort === "random") return true;
  return isRandomFilterSource(src);
}

function persistFlagToggle(shelf: any, isSmart: boolean, shelfId: string, key: string): void {
  const s = getCurrentSettings();
  if (!s) return;
  const next = !shelf[key];
  if (isSmart) {
    const updated = (s.smartShelves ?? []).map((sh: any) => sh.id === shelfId ? { ...sh, [key]: next } : sh);
    void saveSettings({ ...s, smartShelves: updated });
  } else {
    void saveSettings(patchShelfInSettings(s, shelfId, { [key]: next } as any));
  }
}

function persistShelfPatch(shelfId: string, isSmart: boolean, patch: Record<string, any>): void {
  const s = getCurrentSettings();
  if (!s) return;
  if (isSmart) {
    const updated = (s.smartShelves ?? []).map((sh: any) => sh.id === shelfId ? { ...sh, ...patch } : sh);
    void saveSettings({ ...s, smartShelves: updated });
  } else {
    void saveSettings(patchShelfInSettings(s, shelfId, patch));
  }
}

const ABSOLUTE_MAX = 50;

function shelfCanAppend(sh: any, appid: number): boolean {
  const manual: number[] = sh.manualOrder ?? [];
  if (manual.includes(appid)) return false;
  const cap = Math.min(typeof sh.limit === "number" ? sh.limit : ABSOLUTE_MAX, ABSOLUTE_MAX);
  return manual.length < cap;
}

function filterAddCandidates(settings: any, currentShelfId: string, appid: number): any[] {
  return (settings.shelves ?? []).filter((sh: any) => sh.id !== currentShelfId && shelfCanAppend(sh, appid));
}

function filterRemoveCandidates(settings: any, currentShelfId: string, appid: number): any[] {
  return (settings.shelves ?? []).filter((sh: any) => {
    if (sh.id === currentShelfId) return false;
    return (sh.manualOrder ?? []).includes(appid);
  });
}

function appendToShelf(shelfId: string, appid: number): void {
  const s = getCurrentSettings();
  if (!s) return;
  const tgt: any = (s.shelves ?? []).find((row: any) => row.id === shelfId);
  if (!tgt) return;
  const manual: number[] = tgt.manualOrder ?? [];
  const wasManual = tgt.sort === "manual";
  const patch: Record<string, any> = {
    sort: "manual",
    sortReverse: false,
    manualOrder: [...manual, appid],
  };
  if (!wasManual) patch.manualBaseSort = typeof tgt.sort === "string" ? tgt.sort : "alphabetical";
  void saveSettings(patchShelfInSettings(s, shelfId, patch));
}

function removeFromShelf(shelfId: string, appid: number): void {
  const s = getCurrentSettings();
  if (!s) return;
  const tgt: any = (s.shelves ?? []).find((row: any) => row.id === shelfId);
  if (!tgt) return;
  const manual: number[] = tgt.manualOrder ?? [];
  void saveSettings(patchShelfInSettings(s, shelfId, {
    manualOrder: manual.filter((id) => id !== appid),
  }));
}

type Ctx = {
  shelfId: string;
  shelf: any;
  isSmart: boolean;
  idx: number;
  listLen: number;
  focusedAppId: number;
  cardIndex: number;
  isCollapsed: boolean;
  isHidden: boolean;
  isRandomOrSmart: boolean;
  isOnline: boolean;
  settings: any;
};

type Mk = {
  item: (key: string, label: string, onSelected: () => void, disabled?: boolean) => any;
  group: (key: string, label: string, ...children: any[]) => any;
  checked: (flag: boolean, label: string) => string;
};

function runRefreshAction(ctx: Ctx): void {
  const { isSmart, shelf, isOnline, shelfId } = ctx;
  try {
    if (isSmart || shelf?.source?.type === "smart") invalidateSmartShelfCache(shelfId);
    else if (isOnline) clearOnlineShelfCache();
    else invalidateRandomSortCache(shelfId);
    triggerShelfRefresh({ manual: true, shelfId });
  } catch {}
}

function buildMgmt(ctx: Ctx, mk: Mk): any[] {
  const { shelfId, idx, listLen, isCollapsed, isHidden, isRandomOrSmart, isOnline } = ctx;
  const { item } = mk;
  const refreshLabel = isOnline ? tLabel("refresh_cache", "Refresh cache") : tLabel("refresh", "Refresh");
  return [
    item("ds-edit", tLabel("edit_shelf", "Edit"), () => dispatchShelfModal("edit", shelfId)),
    item("ds-duplicate", tLabel("duplicate_shelf", "Duplicate"), () => { void duplicateShelfById(shelfId, tLabel("copy_suffix", "(Copy)")); }),
    item("ds-collapse", isCollapsed ? tLabel("expand_shelf", "Expand shelf") : tLabel("collapse_shelf", "Collapse shelf"), () => setShelfCollapsed(shelfId, !isCollapsed)),
    item("ds-hide", isHidden ? tLabel("show_shelf", "Show shelf") : tLabel("hide_shelf", "Hide shelf"), () => { void toggleShelfHiddenById(shelfId); }),
    item("ds-move-up", tLabel("move_up", "Move up"), () => { void moveShelfById(shelfId, -1); }, idx <= 0),
    item("ds-move-down", tLabel("move_down", "Move down"), () => { void moveShelfById(shelfId, 1); }, idx >= listLen - 1),
    ...(isRandomOrSmart ? [item("ds-refresh", refreshLabel, () => runRefreshAction(ctx))] : []),
    item("ds-delete", tLabel("delete_shelf", "Delete"), () => dispatchShelfModal("delete", shelfId)),
  ];
}

function makeFlagItem(mk: Mk, shelf: any, isSmart: boolean, shelfId: string, key: string, keyId: string, labelKey: string, fallback: string): any {
  return mk.item(keyId, mk.checked(!!shelf[key], tLabel(labelKey, fallback)), () => persistFlagToggle(shelf, isSmart, shelfId, key));
}

function buildDisplay(ctx: Ctx, mk: Mk): any[] {
  const { shelf, shelfId, isSmart } = ctx;
  return [
    makeFlagItem(mk, shelf, isSmart, shelfId, "hideShelfTitle", "ds-d-title", "hide_shelf_title", "Hide shelf title"),
    makeFlagItem(mk, shelf, isSmart, shelfId, "hideGameNames", "ds-d-names", "hide_game_name", "Hide game names"),
    makeFlagItem(mk, shelf, isSmart, shelfId, "hideStatusLine", "ds-d-status", "hide_status_line", "Hide status line"),
    makeFlagItem(mk, shelf, isSmart, shelfId, "hideNewBadge", "ds-d-badge", "hide_new_badge", "Hide new badge"),
    makeFlagItem(mk, shelf, isSmart, shelfId, "hideDiscountBadge", "ds-d-discount", "hide_discount_badge", "Hide discount badge"),
    makeFlagItem(mk, shelf, isSmart, shelfId, "hideCompatIcons", "ds-d-compat", "hide_compat_icons", "Hide compat icons"),
    makeFlagItem(mk, shelf, isSmart, shelfId, "hideNonSteamBadge", "ds-d-nsbadge", "hide_non_steam_badge", "Hide non-Steam badge"),
    makeFlagItem(mk, shelf, isSmart, shelfId, "hideInstallIndicator", "ds-d-install", "hide_install_indicator", "Hide install indicator"),
    makeFlagItem(mk, shelf, isSmart, shelfId, "hideSeeMore", "ds-d-seemore", "hide_see_more_card", "Hide \"See more\""),
    makeFlagItem(mk, shelf, isSmart, shelfId, "hideRefreshCard", "ds-d-refresh", "hide_refresh_card", "Hide refresh card"),
  ];
}

function buildVisual(ctx: Ctx, mk: Mk): any[] {
  const { shelf, shelfId, isSmart } = ctx;
  const items: any[] = [
    makeFlagItem(mk, shelf, isSmart, shelfId, "matchNativeSize", "ds-v-native", "match_native_size", "Match native size"),
    makeFlagItem(mk, shelf, isSmart, shelfId, "highlightFirst", "ds-v-hiFirst", "highlight_first", "Highlight first card"),
    makeFlagItem(mk, shelf, isSmart, shelfId, "highlightAll", "ds-v-hiAll", "highlight_all", "Highlight all cards"),
    makeFlagItem(mk, shelf, isSmart, shelfId, "highlightRandom", "ds-v-hiRandom", "highlight_random", "Random featured cards"),
    makeFlagItem(mk, shelf, isSmart, shelfId, "heroEnabled", "ds-v-hero", "hero_enabled_label", "Enable hero art"),
    makeFlagItem(mk, shelf, isSmart, shelfId, "enableLogo", "ds-v-logo", "enable_logo", "Show logo"),
    makeFlagItem(mk, shelf, isSmart, shelfId, "enableIcon", "ds-v-icon", "enable_icon", "Show icon"),
    makeFlagItem(mk, shelf, isSmart, shelfId, "enableDescription", "ds-v-desc", "enable_description", "Show description"),
    makeFlagItem(mk, shelf, isSmart, shelfId, "fullPageShelf", "ds-v-fullpage", "full_page_shelf_label", "Full-page shelf"),
  ];
  // Only surface "description below logo" when both prereqs are on for
  // this shelf — otherwise the toggle is a no-op and clutters the menu.
  if (shelf?.enableLogo && shelf?.enableDescription) {
    items.push(makeFlagItem(mk, shelf, isSmart, shelfId, "descriptionBelowLogo", "ds-v-descBelow", "description_below_logo", "Description below logo"));
  }
  return items;
}

function highlightActionFor(ctx: Ctx, mk: Mk): any {
  const { shelf, shelfId, isSmart, focusedAppId, cardIndex } = ctx;
  const inHighlightedIds = (shelf.highlightedAppIds ?? []).includes(focusedAppId);
  const isFirstCard = cardIndex === 0;
  const highlightedViaFirst = isFirstCard && !!shelf.highlightFirst;
  const highlightedViaAll = !!shelf.highlightAll;
  const highlighted = inHighlightedIds || highlightedViaFirst || highlightedViaAll;
  const label = highlighted
    ? mk.checked(true, tLabel("remove_highlight", "Remove highlight"))
    : tLabel("highlight_this", "Highlight this game");
  return mk.item("ds-card-highlight", label, () => {
    if (highlighted) {
      const patch: Record<string, any> = {};
      if (highlightedViaAll) patch.highlightAll = false;
      if (highlightedViaFirst) patch.highlightFirst = false;
      if (inHighlightedIds) patch.highlightedAppIds = (shelf.highlightedAppIds ?? []).filter((id: number) => id !== focusedAppId);
      persistShelfPatch(shelfId, isSmart, patch);
    } else {
      persistShelfPatch(shelfId, isSmart, { highlightedAppIds: [...(shelf.highlightedAppIds ?? []), focusedAppId] });
    }
  });
}

function hideActionFor(ctx: Ctx, mk: Mk): any {
  const { shelf, shelfId, isSmart, focusedAppId } = ctx;
  const hiddenFromShelf = (shelf.hiddenAppIds ?? []).includes(focusedAppId);
  return mk.item(
    "ds-card-hide",
    hiddenFromShelf ? tLabel("show_in_shelf", "Show in shelf") : tLabel("hide_from_shelf", "Hide from shelf"),
    () => {
      const ids: number[] = shelf.hiddenAppIds ?? [];
      const next = hiddenFromShelf ? ids.filter((id) => id !== focusedAppId) : [...ids, focusedAppId];
      persistShelfPatch(shelfId, isSmart, { hiddenAppIds: next });
    },
  );
}

function buildAddRemoveGroups(ctx: Ctx, mk: Mk): any[] {
  const { settings, shelfId, focusedAppId } = ctx;
  const out: any[] = [];
  const addCandidates = filterAddCandidates(settings, shelfId, focusedAppId);
  if (addCandidates.length > 0) {
    const addItems = addCandidates.map((sh: any) => mk.item(
      `ds-card-add-${sh.id}`, sh.title ?? sh.id, () => appendToShelf(sh.id, focusedAppId),
    ));
    out.push(mk.group("ds-card-add-shelf", tLabel("menu_add_to_shelf", "Add to shelf"), ...addItems));
  }
  const removeCandidates = filterRemoveCandidates(settings, shelfId, focusedAppId);
  if (removeCandidates.length > 0) {
    const rmItems = removeCandidates.map((sh: any) => mk.item(
      `ds-card-rm-${sh.id}`, sh.title ?? sh.id, () => removeFromShelf(sh.id, focusedAppId),
    ));
    out.push(mk.group("ds-card-remove-shelf", tLabel("menu_remove_from_shelf", "Remove from shelf"), ...rmItems));
  }
  return out;
}

function buildCardActions(ctx: Ctx, mk: Mk): any[] {
  if (ctx.focusedAppId <= 0) return [];
  return [highlightActionFor(ctx, mk), hideActionFor(ctx, mk), ...buildAddRemoveGroups(ctx, mk)];
}

function buildMk(dfl: any, R: any, focusedAppId: number, shelfId: string): Mk {
  const preserveFocus = () => {
    if (focusedAppId > 0) {
      try { saveFocusTarget(focusedAppId, shelfId); beginFocusRestoreLoop(); } catch {}
    }
  };
  const item = (key: string, label: string, onSelected: () => void, disabled?: boolean) =>
    R.createElement(dfl.MenuItem, { key, onSelected: () => { onSelected(); preserveFocus(); }, disabled }, label);
  const group = (key: string, label: string, ...children: any[]) =>
    R.createElement(dfl.MenuGroup, { key, label }, ...children);
  const checked = (flag: boolean, label: string) => (flag ? `✓ ${label}` : label);
  return { item, group, checked };
}

function buildSortToggle(ctx: Ctx, mk: Mk): any {
  const isReversed = !!ctx.shelf.sortReverse;
  const label = isReversed
    ? mk.checked(true, tLabel("sort_descending", "Sort: descending"))
    : tLabel("sort_ascending", "Sort: ascending");
  return mk.item("ds-sort-dir", label, () => persistFlagToggle(ctx.shelf, ctx.isSmart, ctx.shelfId, "sortReverse"));
}

function buildDecorationItem(ctx: Ctx, mk: Mk): any[] {
  if (ctx.isSmart) return [];
  return [mk.item("ds-decoration", tLabel("menu_decoration", "Decoration"), () => dispatchShelfModal("edit", ctx.shelfId, { initialTab: "decoration" }))];
}

function deriveCtx(ctx: Omit<Ctx, "isCollapsed" | "isHidden" | "isOnline" | "isRandomOrSmart">): Ctx {
  return {
    ...ctx,
    isCollapsed: readCollapsedFromStorage(ctx.shelfId),
    isHidden: !!ctx.shelf?.hidden,
    isOnline: isOnlineSource(ctx.shelf?.source),
    isRandomOrSmart: shelfNeedsManualRefresh(ctx.shelf, ctx.isSmart),
  };
}

function hasMenuPrimitives(dfl: any, R: any): boolean {
  return !!(dfl?.MenuItem && dfl?.MenuGroup && R?.createElement);
}

export function buildDeckShelvesMenuItems(
  shelfId: string,
  dfl: any,
  R: any,
  appid?: number,
  activeAppId: number = 0,
  cardIndex: number = -1,
): any[] {
  if (!hasMenuPrimitives(dfl, R)) return [];
  const settings = getCurrentSettings?.();
  if (!settings) return [];
  const located = locateShelf(settings, shelfId);
  if (!located) return [];
  const focusedAppId = appid ?? activeAppId;
  const ctx = deriveCtx({ shelfId, shelf: located.shelf, isSmart: located.isSmart, idx: located.idx, listLen: located.listLen, focusedAppId, cardIndex, settings });
  const mk = buildMk(dfl, R, focusedAppId, shelfId);

  return [
    ...buildCardActions(ctx, mk),
    mk.group(
      "ds-shelf-root", tLabel("menu_shelf", "Shelf"),
      buildSortToggle(ctx, mk),
      mk.group("ds-mgmt", tLabel("menu_management", "Management"), ...buildMgmt(ctx, mk)),
      mk.group("ds-display", tLabel("menu_display", "Display"), ...buildDisplay(ctx, mk)),
      mk.group("ds-visual", tLabel("menu_visual", "Visual"), ...buildVisual(ctx, mk)),
      ...buildDecorationItem(ctx, mk),
    ),
  ];
}

export function buildShelfContextMenu(shelfId: string, appid: number, dfl: any, R: any): any[] {
  return buildDeckShelvesMenuItems(shelfId, dfl, R, appid);
}

function libraryGroup(R: any, shelves: any[], keyPrefix: string, groupKey: string, labelKey: string, fallback: string, appid: number, action: (shelfId: string, appid: number) => void): any | null {
  if (!shelves.length) return null;
  const children = shelves.map((sh: any) =>
    R.createElement(DeckyMenuItem, {
      key: `${keyPrefix}${sh.id}`,
      onSelected: () => action(sh.id, appid),
    }, sh.title ?? sh.id),
  );
  return R.createElement(DeckyMenuGroup, { key: groupKey, label: tLabel(labelKey, fallback) }, ...children);
}

function libraryCandidates(s: any, appid: number): { eligible: any[]; removable: any[] } {
  const shelves = s.shelves ?? [];
  return {
    eligible: shelves.filter((sh: any) => shelfCanAppend(sh, appid)),
    removable: shelves.filter((sh: any) => (sh.manualOrder ?? []).includes(appid)),
  };
}

export function buildLibraryAddToShelfItems(appid: number, _dfl: any, R: any): any[] {
  if (!R?.createElement || !appid) return [];
  const s = getCurrentSettings?.();
  if (!s) return [];
  const { eligible, removable } = libraryCandidates(s, appid);
  const groups: any[] = [];
  const add = libraryGroup(R, eligible, "ds-lib-add-", "ds-lib-add-shelf", "menu_add_to_shelf", "Add to shelf", appid, appendToShelf);
  if (add) groups.push(add);
  const rm = libraryGroup(R, removable, "ds-lib-rm-", "ds-lib-remove-shelf", "menu_remove_from_shelf", "Remove from shelf", appid, removeFromShelf);
  if (rm) groups.push(rm);
  return groups;
}
