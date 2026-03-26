import React from "react";
import { useSettingsController } from "../features/settings/controller";
import { DeckQAMSettings } from "./DeckQAMSettings";

export function SettingsView() {
  const controller = useSettingsController();
  return (
    <div className="deck-shelves-root" style={{ width: "100%", maxWidth: "100%", minWidth: 0, overflowX: "hidden" }}>
      <DeckQAMSettings controller={controller} />
    </div>
  );
}
