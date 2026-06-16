import { useCallback, useState } from "react";
import { Tabs, Focusable } from "../runtime/host/decky";
import { Navigation } from "@decky/ui";
import { useSettingsController } from "../features/settings/controller";
import { PageHeader } from "./ui/PageHeader";
import { DeckQAMStyles } from "./styles/DeckQAMStyles";
import { ShelvesDetail } from "./settings/details/ShelvesDetail";
import { ProfilesDetail } from "./settings/details/ProfilesDetail";
import { IntegrationsDetail } from "./settings/details/IntegrationsDetail";
import { ButtonBindingsDetail } from "./settings/details/ButtonBindingsDetail";
import { BackupDetail } from "./settings/details/BackupDetail";
import { AdvancedDetail } from "./settings/details/AdvancedDetail";
import { BookmarkIcon, PersonIcon, PuzzleIcon, GamepadIcon, SaveIcon, ToolsIcon } from "./icons";

function tabLabel(icon: React.ReactNode, text: string): string {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {icon}
      {text}
    </span>
  ) as unknown as string;
}

export function SettingsPage() {
  const controller = useSettingsController();
  const [activeTab, setActiveTab] = useState("shelves");
  const t = useCallback(
    (key: string) => (controller.t as (k: string) => string)(key),
    [controller.t],
  );
  const goBack = useCallback(() => {
    try { Navigation.NavigateBack(); } catch {}
  }, []);

  if (!controller.settings) return null;

  return (
    <Focusable
      flow-children="vertical"
      onCancelButton={goBack}
      style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", color: "white" }}
    >
      <DeckQAMStyles />
      <PageHeader title={t("settings_page_title")} onBack={goBack} active="settings" />
      <div style={{ flex: 1, minHeight: 0 }}>
        <Tabs
          activeTab={activeTab}
          onShowTab={setActiveTab}
          tabs={[
            { id: "shelves",      title: tabLabel(<BookmarkIcon />, t("settings_card_shelves_title")),      content: <ShelvesDetail        controller={controller} t={t} /> },
            { id: "profiles",     title: tabLabel(<PersonIcon />,   t("settings_card_profiles_title")),     content: <ProfilesDetail       controller={controller} t={t} /> },
            { id: "integrations", title: tabLabel(<PuzzleIcon />,   t("settings_card_integrations_title")), content: <IntegrationsDetail   controller={controller} t={t} /> },
            { id: "bindings",     title: tabLabel(<GamepadIcon />,  t("settings_card_bindings_title")),     content: <ButtonBindingsDetail controller={controller} t={t} /> },
            { id: "backup",       title: tabLabel(<SaveIcon />,     t("settings_card_backup_title")),       content: <BackupDetail         controller={controller} t={t} /> },
            { id: "advanced",     title: tabLabel(<ToolsIcon />,    t("settings_card_advanced_title")),     content: <AdvancedDetail       controller={controller} t={t} /> },
          ]}
        />
      </div>
    </Focusable>
  );
}
