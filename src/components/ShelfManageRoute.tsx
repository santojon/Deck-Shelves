import React, { useState } from "react";
import {
  Navigation,
  DialogButton,
  DialogBody,
  DialogControlsSection,
  Focusable,
  PanelSection,
  PanelSectionRow,
} from "@decky/ui";
import { useSettingsController } from "../features/settings/controller";
import { PlatformProvider, getPlatform } from "../runtime/platformContext";
import { showEditShelfModal, showDeleteConfirm } from "./qam/list/ShelfActions";
import { clearOnlineShelfCache } from "../core/shelfActions";
import { invalidateRandomSortCache } from "../steam";
import { subscribeShelfRefresh, triggerShelfRefresh } from "../core/shelfRefresh";

/** Parses the shelfId out of the current URL path. Route is registered as
 *  /deck-shelves/manage/:shelfId. */
function getShelfIdFromLocation(): string {
  try {
    const p = (globalThis as any).window?.location?.pathname ?? "";
    const m = p.match(/\/deck-shelves\/manage\/([^\/?#]+)/);
    return m?.[1] ? decodeURIComponent(m[1]) : "";
  } catch { return ""; }
}

function ShelfManageRouteImpl({ shelfId: shelfIdProp }: { shelfId: string }) {
  const controller = useSettingsController();
  const { t, shelves, actions } = controller;
  const shelfId = shelfIdProp || getShelfIdFromLocation();
  const idx = shelves.findIndex((s) => s.id === shelfId);
  const shelf = idx >= 0 ? shelves[idx] : null;
  const [collapsedTick, setCollapsedTick] = useState(0);

  if (!shelf) {
    try { setTimeout(() => { try { (Navigation as any).NavigateBack?.(); } catch {} }, 0); } catch {}
    return null;
  }

  const isHidden = !!shelf.hidden;
  let isCollapsed = false;
  try { isCollapsed = (globalThis as any).localStorage?.getItem?.(`ds-collapsed-${shelfId}`) === "1"; } catch {}

  const closeRoute = () => { try { (Navigation as any).NavigateBack?.(); } catch {} };
  const onEdit = () => { showEditShelfModal(controller, shelf); closeRoute(); };
  const onDuplicate = () => { actions.duplicateShelf(shelf.id); closeRoute(); };
  const onToggleCollapse = () => {
    try {
      if (isCollapsed) (globalThis as any).localStorage?.removeItem?.(`ds-collapsed-${shelfId}`);
      else (globalThis as any).localStorage?.setItem?.(`ds-collapsed-${shelfId}`, "1");
      (globalThis as any).window?.dispatchEvent?.(new CustomEvent("ds-shelf-collapsed", { detail: { shelfId, collapsed: !isCollapsed } }));
    } catch {}
    setCollapsedTick(n => n + 1);
  };
  const onToggleHide = () => { actions.toggleShelfHidden(shelf.id); closeRoute(); };
  const onMoveUp = () => { actions.moveShelf(shelf.id, -1); closeRoute(); };
  const onMoveDown = () => { actions.moveShelf(shelf.id, 1); closeRoute(); };
  const onDelete = () => { showDeleteConfirm(controller, shelf); closeRoute(); };

  const isOnlineSource = shelf.source.type === 'wishlist' || shelf.source.type === 'store';
  const isRandomSource = shelf.sort === 'random' ||
    (shelf.source.type === 'filter' && (shelf.source as any).filter?.sort === 'random') ||
    shelf.source.type === 'smart';
  const showRefreshOption = isOnlineSource || isRandomSource;
  const onRefreshCache = () => {
    if (isOnlineSource) {
      clearOnlineShelfCache();
    } else {
      invalidateRandomSortCache(shelf.id);
    }
    try {
      triggerShelfRefresh();
    } catch {}
    closeRoute();
  };

  // Suppress unused-var TS hint — needed to force re-render after collapse toggle.
  void collapsedTick;
  void subscribeShelfRefresh; // imported for type-checking only

  return (
    <Focusable>
      <div style={{ padding: 24, overflowY: 'auto' }}>
        <DialogBody>
          <DialogControlsSection>
            <h1 style={{ marginTop: 0, marginBottom: 4 }}>{t("menu_deck_shelves") ?? "Deck Shelves"}</h1>
            <p style={{ opacity: 0.7, marginBottom: 16 }}>{shelf.title}</p>
            <PanelSection>
              <PanelSectionRow>
                <DialogButton onClick={onEdit} onOKButton={onEdit}>{t("editShelf") ?? "Edit"}</DialogButton>
              </PanelSectionRow>
              <PanelSectionRow>
                <DialogButton onClick={onDuplicate} onOKButton={onDuplicate}>{t("duplicateShelf") ?? "Duplicate"}</DialogButton>
              </PanelSectionRow>
              <PanelSectionRow>
                <DialogButton onClick={onToggleCollapse} onOKButton={onToggleCollapse}>
                  {isCollapsed ? (t("expand_shelf") ?? "Expand shelf") : (t("collapse_shelf") ?? "Collapse shelf")}
                </DialogButton>
              </PanelSectionRow>
              <PanelSectionRow>
                <DialogButton onClick={onToggleHide} onOKButton={onToggleHide}>
                  {isHidden ? (t("show_shelf") ?? "Show shelf") : (t("hide_shelf") ?? "Hide shelf")}
                </DialogButton>
              </PanelSectionRow>
              <PanelSectionRow>
                <DialogButton onClick={onMoveUp} onOKButton={onMoveUp} disabled={idx <= 0}>
                  {t("move_up") ?? "Move up"}
                </DialogButton>
              </PanelSectionRow>
              <PanelSectionRow>
                <DialogButton onClick={onMoveDown} onOKButton={onMoveDown} disabled={idx >= shelves.length - 1}>
                  {t("move_down") ?? "Move down"}
                </DialogButton>
              </PanelSectionRow>
              {showRefreshOption && (
                <PanelSectionRow>
                  <DialogButton onClick={onRefreshCache} onOKButton={onRefreshCache}>
                    {isOnlineSource ? (t("refresh_cache") ?? "Refresh cache") : (t("refresh") ?? "Refresh")}
                  </DialogButton>
                </PanelSectionRow>
              )}
              <PanelSectionRow>
                <DialogButton onClick={onDelete} onOKButton={onDelete}>{t("deleteShelf") ?? "Delete"}</DialogButton>
              </PanelSectionRow>
            </PanelSection>
          </DialogControlsSection>
        </DialogBody>
      </div>
    </Focusable>
  );
}

function withPlatform(node: React.ReactNode): React.ReactElement | null {
  const p = getPlatform();
  if (!p) return null;
  return <PlatformProvider platform={p}>{node}</PlatformProvider>;
}

export function ShelfManageRoute({ shelfId }: { shelfId: string }) {
  return withPlatform(<ShelfManageRouteImpl shelfId={shelfId} />);
}
