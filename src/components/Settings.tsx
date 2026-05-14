import { useEffect } from "react";
import { useSettingsController } from "../features/settings/controller";
import { DeckQAMSettings } from "./DeckQAMSettings";
import { wrapQAMSettings } from "../qa/harness";
import { registerShelfModalHandler } from "../core/shelfActions";
import { showDeleteConfirm, showEditShelfModal } from "./qam/list/ShelfActions";

const QAMSettings = wrapQAMSettings(DeckQAMSettings);

export function SettingsView() {
  const controller = useSettingsController();
  // Bridge the non-React shelf-card menu (Deck Shelves > Shelf > Edit / Delete)
  // to the existing managed-modal flow via a registry handler. Cleanup is
  // mandatory — the controller is per-mount.
  useEffect(() => {
    registerShelfModalHandler((kind, shelfId) => {
      const shelf = controller.shelves.find((sh) => sh.id === shelfId);
      if (!shelf) return;
      if (kind === "edit") showEditShelfModal(controller, shelf);
      else if (kind === "delete") showDeleteConfirm(controller, shelf);
    });
    return () => registerShelfModalHandler(null);
  }, [controller]);
  return (
    <div className="deck-shelves-root" style={{ width: "100%", maxWidth: "100%", minWidth: 0, overflowX: "hidden" }}>
      <QAMSettings controller={controller} />
    </div>
  );
}
