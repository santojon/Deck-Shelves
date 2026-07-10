import React, { useEffect, useRef } from "react";
import { Navigation } from "../runtime/host/decky";
import { useSettingsController } from "../features/settings/controller";
import { PlatformProvider, getPlatform } from "../runtime/platformContext";
import { showEditShelfModal, showDeleteConfirm } from "./qam/list/ShelfActions";
import { openManagedModal } from "./qam/common/openManagedModal";
import { EditSmartShelfModal } from "./qam/modals/EditSmartShelfModal";
import { DeleteConfirmSmartModal } from "./qam/modals/DeleteConfirmSmartModal";

function getShelfIdFromLocation(): string {
  try {
    const p = (globalThis as any).window?.location?.pathname ?? "";
    const m = p.match(/\/deck-shelves\/(?:edit|delete)\/([^\/?#]+)/);
    return m?.[1] ? decodeURIComponent(m[1]) : "";
  } catch { return ""; }
}

function resolveShelf(controller: ReturnType<typeof useSettingsController>, shelfId: string) {
  const shelf = controller.shelves.find((s) => s.id === shelfId);
  const smartShelf = shelf ? null : (controller.settings?.smartShelves ?? []).find((s) => s.id === shelfId);
  return { shelf, smartShelf };
}

function openShelfModal(
  kind: "edit" | "delete",
  shelf: any,
  smartShelf: any,
  controller: ReturnType<typeof useSettingsController>,
): void {
  try {
    if (smartShelf) {
      if (kind === "edit") openManagedModal((close) => <EditSmartShelfModal closeModal={close} controller={controller} shelf={smartShelf} />);
      else openManagedModal((close) => <DeleteConfirmSmartModal closeModal={close} controller={controller} shelf={smartShelf} />);
    } else if (shelf) {
      if (kind === "edit") showEditShelfModal(controller, shelf);
      else showDeleteConfirm(controller, shelf);
    }
  } catch {}
}

function ShelfModalRouteImpl({ kind, shelfId: shelfIdProp }: { kind: "edit" | "delete"; shelfId: string }) {
  const controller = useSettingsController();
  const triggeredRef = useRef(false);
  const shelfId = shelfIdProp || getShelfIdFromLocation();

  useEffect(() => {
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    const { shelf, smartShelf } = resolveShelf(controller, shelfId);
    if (!shelf && !smartShelf) {
      try { (Navigation as any).NavigateBack?.(); } catch {}
      return;
    }
    openShelfModal(kind, shelf, smartShelf, controller);
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
