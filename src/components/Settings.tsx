import { useSettingsController } from "../features/settings/controller";
import { DeckQAMSettings } from "./DeckQAMSettings";
import { wrapQAMSettings } from "../qa/harness";

const QAMSettings = wrapQAMSettings(DeckQAMSettings);

export function SettingsView() {
  const controller = useSettingsController();
  return (
    <div className="deck-shelves-root" style={{ width: "100%", maxWidth: "100%", minWidth: 0, overflowX: "hidden" }}>
      <QAMSettings controller={controller} />
    </div>
  );
}
