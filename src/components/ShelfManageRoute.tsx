import React, { useState } from "react";
import {
  Navigation,
  DialogButton,
  DialogBody,
  DialogControlsSection,
  Focusable,
  PanelSection,
  PanelSectionRow,
} from "../runtime/host/decky";
import { useSettingsController } from "../features/settings/controller";
import { PlatformProvider, getPlatform } from "../runtime/platformContext";
import { showEditShelfModal, showDeleteConfirm } from "./qam/list/ShelfActions";
import { clearOnlineShelfCache } from "../core/shelfActions";
import { invalidateRandomSortCache } from "../steam";
import { subscribeShelfRefresh, triggerShelfRefresh } from "../core/shelfRefresh";

function tr(t: (k: string) => string | undefined, key: string, fallback: string): string {
  return t(key) ?? fallback;
}

function trBy(cond: boolean, t: (k: string) => string | undefined, keyTrue: string, fbTrue: string, keyFalse: string, fbFalse: string): string {
  return cond ? tr(t, keyTrue, fbTrue) : tr(t, keyFalse, fbFalse);
}

function isRandomSourceShelf(shelf: { sort?: unknown; source: { type: string; [k: string]: any } }): boolean {
  if (shelf.sort === 'random') return true;
  if (shelf.source.type === 'smart') return true;
  return shelf.source.type === 'filter' && shelf.source.filter?.sort === 'random';
}

function navigateBack(): void {
  try { (Navigation as any).NavigateBack?.(); } catch {}
}

function resolveManagedShelf(shelves: any[], shelfIdProp: string): { shelfId: string; idx: number; shelf: any | null } {
  const shelfId = shelfIdProp || getShelfIdFromLocation();
  const idx = shelves.findIndex((s) => s.id === shelfId);
  return { shelfId, idx, shelf: idx >= 0 ? shelves[idx] : null };
}

function isOnlineSourceShelf(shelf: { source: { type: string } }): boolean {
  return shelf.source.type === 'wishlist' || shelf.source.type === 'store';
}

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
  const { shelfId, idx, shelf } = resolveManagedShelf(shelves, shelfIdProp);
  const [collapsedTick, setCollapsedTick] = useState(0);

  if (!shelf) {
    try { setTimeout(navigateBack, 0); } catch {}
    return null;
  }

  const isHidden = !!shelf.hidden;
  let isCollapsed = false;
  try { isCollapsed = (globalThis as any).localStorage?.getItem?.(`ds-collapsed-${shelfId}`) === "1"; } catch {}

  const closeRoute = navigateBack;
  const onEdit = () => { showEditShelfModal(controller, shelf); closeRoute(); };
  const onDuplicate = () => { void actions.duplicateShelf(shelf.id); closeRoute(); };
  const onToggleCollapse = () => {
    try {
      if (isCollapsed) (globalThis as any).localStorage?.removeItem?.(`ds-collapsed-${shelfId}`);
      else (globalThis as any).localStorage?.setItem?.(`ds-collapsed-${shelfId}`, "1");
      (globalThis as any).window?.dispatchEvent?.(new CustomEvent("ds-shelf-collapsed", { detail: { shelfId, collapsed: !isCollapsed } }));
    } catch {}
    setCollapsedTick(n => n + 1);
  };
  const onToggleHide = () => { void actions.toggleShelfHidden(shelf.id); closeRoute(); };
  const onMoveUp = () => { void actions.moveShelf(shelf.id, -1); closeRoute(); };
  const onMoveDown = () => { void actions.moveShelf(shelf.id, 1); closeRoute(); };
  const onDelete = () => { showDeleteConfirm(controller, shelf); closeRoute(); };

  const isOnlineSource = isOnlineSourceShelf(shelf);
  const showRefreshOption = isOnlineSource || isRandomSourceShelf(shelf);
  const onRefreshCache = () => {
    if (isOnlineSource) {
      clearOnlineShelfCache();
    } else {
      invalidateRandomSortCache(shelf.id);
    }
    try {
      triggerShelfRefresh({ manual: true, shelfId: shelf.id });
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
            <h1 style={{ marginTop: 0, marginBottom: 4 }}>{tr(t, "menu_deck_shelves", "Deck Shelves")}</h1>
            <p style={{ opacity: 0.7, marginBottom: 16 }}>{shelf.title}</p>
            <PanelSection>
              <PanelSectionRow>
                <DialogButton onClick={onEdit} onOKButton={onEdit}>{tr(t, "edit_shelf", "Edit")}</DialogButton>
              </PanelSectionRow>
              <PanelSectionRow>
                <DialogButton onClick={onDuplicate} onOKButton={onDuplicate}>{tr(t, "duplicate_shelf", "Duplicate")}</DialogButton>
              </PanelSectionRow>
              <PanelSectionRow>
                <DialogButton onClick={onToggleCollapse} onOKButton={onToggleCollapse}>
                  {trBy(isCollapsed, t, "expand_shelf", "Expand shelf", "collapse_shelf", "Collapse shelf")}
                </DialogButton>
              </PanelSectionRow>
              <PanelSectionRow>
                <DialogButton onClick={onToggleHide} onOKButton={onToggleHide}>
                  {trBy(isHidden, t, "show_shelf", "Show shelf", "hide_shelf", "Hide shelf")}
                </DialogButton>
              </PanelSectionRow>
              <PanelSectionRow>
                <DialogButton onClick={onMoveUp} onOKButton={onMoveUp} disabled={idx <= 0}>
                  {tr(t, "move_up", "Move up")}
                </DialogButton>
              </PanelSectionRow>
              <PanelSectionRow>
                <DialogButton onClick={onMoveDown} onOKButton={onMoveDown} disabled={idx >= shelves.length - 1}>
                  {tr(t, "move_down", "Move down")}
                </DialogButton>
              </PanelSectionRow>
              {showRefreshOption && (
                <PanelSectionRow>
                  <DialogButton onClick={onRefreshCache} onOKButton={onRefreshCache}>
                    {trBy(isOnlineSource, t, "refresh_cache", "Refresh cache", "refresh", "Refresh")}
                  </DialogButton>
                </PanelSectionRow>
              )}
              <PanelSectionRow>
                <DialogButton onClick={onDelete} onOKButton={onDelete}>{tr(t, "delete_shelf", "Delete")}</DialogButton>
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
