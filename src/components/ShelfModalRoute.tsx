/* eslint-disable complexity */
import React, { useEffect, useRef } from "react";
import { Navigation } from "@decky/ui";
import { useSettingsController } from "../features/settings/controller";
import { PlatformProvider, getPlatform } from "../runtime/platformContext";
import { showEditShelfModal, showDeleteConfirm } from "./qam/list/ShelfActions";
import { openManagedModal } from "./qam/common/openManagedModal";
import { EditSmartShelfModal } from "./qam/modals/EditSmartShelfModal";
import { DeleteConfirmSmartModal } from "./qam/modals/DeleteConfirmSmartModal";

/** Parses the shelfId out of the current URL path. Routes are registered as
 *  /deck-shelves/edit/:shelfId and /deck-shelves/delete/:shelfId. */
function getShelfIdFromLocation(): string {
  try {
    const p = (globalThis as any).window?.location?.pathname ?? "";
    const m = p.match(/\/deck-shelves\/(?:edit|delete)\/([^\/?#]+)/);
    return m?.[1] ? decodeURIComponent(m[1]) : "";
  } catch { return ""; }
}

/**
 * Full-screen route that opens the Edit or Delete modal for a shelf, then
 * navigates back when the modal closes. This is the QAM-independent path —
 * the menu action's `Navigation.Navigate('/deck-shelves/edit/{shelfId}')`
 * lands here, the route mounts a SettingsController via the hook, and the
 * modal opens via DFL.showModal (independent of the QAM panel).
 *
 * The Route component itself renders nothing visible — its only job is to
 * mount the controller and trigger the modal in an effect. On modal close,
 * it pops back to the previous route.
 */
function ShelfModalRouteImpl({ kind, shelfId: shelfIdProp }: { kind: "edit" | "delete"; shelfId: string }) {
  const controller = useSettingsController();
  const triggeredRef = useRef(false);
  const shelfId = shelfIdProp || getShelfIdFromLocation();

  useEffect(() => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    const shelf = controller.shelves.find((s) => s.id === shelfId);
    const smartShelf = shelf ? null : (controller.settings?.smartShelves ?? []).find((s) => s.id === shelfId);
    if (!shelf && !smartShelf) {
      try { (Navigation as any).NavigateBack?.(); } catch {}
      return;
    }
    try {
      if (smartShelf) {
        if (kind === "edit") openManagedModal((close) => <EditSmartShelfModal closeModal={close} controller={controller} shelf={smartShelf} />);
        else openManagedModal((close) => <DeleteConfirmSmartModal closeModal={close} controller={controller} shelf={smartShelf} />);
      } else if (shelf) {
        if (kind === "edit") showEditShelfModal(controller, shelf);
        else showDeleteConfirm(controller, shelf);
      }
    } catch {}
    // Pop back immediately — showModal renders in a portal independent of
    // the route, so the modal stays visible over the previous page.
    try {
      setTimeout(() => { try { (Navigation as any).NavigateBack?.(); } catch {} }, 50);
    } catch {}
  }, [kind, shelfId, controller]);

  return null;
}

function withPlatform(node: React.ReactNode): React.ReactElement | null {
  const p = getPlatform();
  if (!p) return null;
  return <PlatformProvider platform={p}>{node}</PlatformProvider>;
}

export function ShelfEditRoute({ shelfId }: { shelfId: string }) {
  return withPlatform(<ShelfModalRouteImpl kind="edit" shelfId={shelfId} />);
}

export function ShelfDeleteRoute({ shelfId }: { shelfId: string }) {
  return withPlatform(<ShelfModalRouteImpl kind="delete" shelfId={shelfId} />);
}
