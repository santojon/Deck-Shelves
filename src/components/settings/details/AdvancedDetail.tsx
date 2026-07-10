import { useMemo, useState } from "react";
import { DialogButton, Focusable, ToggleField } from "../../../runtime/host/decky";
import type { useSettingsController } from "../../../features/settings/controller";
import { openManagedModal } from "../../qam/common/openManagedModal";
import { ResetAllModal } from "../../qam/modals/ResetAllModal";
import { ResetCategoriesModal } from "../../qam/modals/ResetCategoriesModal";
import { confirmAction } from "../../qam/modals/ConfirmActionModal";
import { CACHE_GROUPS, groupSizeBytes, clearGroup, clearAllCaches, formatBytes } from "../../../runtime/cacheRegistry";
import { SettingsSection } from "../../ui/SettingsSection";
import { CollapsibleSection } from "../../ui/CollapsibleSection";
import { DiagnosticsSection } from "./DiagnosticsSection";
import { SnapshotsSection } from "./SnapshotsSection";
import { TrashIcon, StackIcon } from "../../icons";
import { BTN_COMPACT_STYLE, BTN_ICON_STYLE } from "../../ui/buttonStyles";
import { notify } from "../../notify";

export interface AdvancedDetailProps {
  controller: ReturnType<typeof useSettingsController>;
  t: (key: string) => string;
}

export function AdvancedDetail({ controller, t }: AdvancedDetailProps) {
  const handleResetShelves = () => openManagedModal((close) => <ResetAllModal closeModal={close} controller={controller} scope='shelves' />);
  const handleResetSmart   = () => openManagedModal((close) => <ResetAllModal closeModal={close} controller={controller} scope='smart' />);
  const handleResetAll     = () => openManagedModal((close) => <ResetAllModal closeModal={close} controller={controller} />);
  const handleResetCustom  = () => openManagedModal((close) => <ResetCategoriesModal closeModal={close} controller={controller} />);

  const [cacheTick, setCacheTick] = useState(0);
  const cacheSizes = useMemo(() => CACHE_GROUPS.map((g) => groupSizeBytes(g)), [cacheTick]);
  const handleClearGroup = (g: typeof CACHE_GROUPS[number]) => {
    clearGroup(g); setCacheTick((n) => n + 1); notify("copy", { body: t("cache_cleared") });
  };
  const handleClearAll = () => confirmAction({
    title: t("cache_clear_all"), body: t("cache_clear_all_confirm"),
    okText: t("confirm_continue"), cancelText: t("cancel"),
    onConfirm: () => { clearAllCaches(); setCacheTick((n) => n + 1); notify("copy", { body: t("cache_cleared") }); },
  });

  const devMode = (controller.settings as any)?.devModeEnabled === true;

  return (
    <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column" }}>
      <SettingsSection title={t("settings_advanced_reset_title")} description={t("settings_advanced_reset_desc")} icon={<TrashIcon size={14} />}>
        <Focusable
          flow-children="horizontal"
          style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6, alignItems: "center" }}
        >
          <DialogButton onClick={handleResetShelves} onOKButton={handleResetShelves} style={{ ...BTN_COMPACT_STYLE, minWidth: 0, width: "100%" }}>
            <TrashIcon size={12} /><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t("settings_advanced_reset_shelves")}</span>
          </DialogButton>
          <DialogButton onClick={handleResetSmart} onOKButton={handleResetSmart} style={{ ...BTN_COMPACT_STYLE, minWidth: 0, width: "100%" }}>
            <TrashIcon size={12} /><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t("settings_advanced_reset_smart")}</span>
          </DialogButton>
          <DialogButton onClick={handleResetAll} onOKButton={handleResetAll} style={{ ...BTN_COMPACT_STYLE, minWidth: 0, width: "100%" }}>
            <TrashIcon size={12} /><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t("settings_advanced_reset_all")}</span>
          </DialogButton>
          <DialogButton onClick={handleResetCustom} onOKButton={handleResetCustom} style={{ ...BTN_COMPACT_STYLE, minWidth: 0, width: "100%" }}>
            <TrashIcon size={12} /><span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t("settings_advanced_reset_custom")}</span>
          </DialogButton>
        </Focusable>
      </SettingsSection>
      <CollapsibleSection
        id="adv-cache"
        title={t("cache_management_title")}
        count={cacheSizes.filter((n) => n > 0).length}
        icon={<StackIcon size={14} />}
        headerExtra={
          <Focusable flow-children="horizontal" style={{ display: "flex", gap: 6 }}>
            <DialogButton
              onClick={handleClearAll}
              onOKButton={handleClearAll}
              disabled={cacheSizes.every((n) => n === 0)}
              style={BTN_ICON_STYLE}
              aria-label={t("cache_clear_all")}
            >
              <TrashIcon size={12} />
            </DialogButton>
          </Focusable>
        }
      >
        <div style={{ fontSize: 12, opacity: 0.6, margin: "2px 0 8px" }}>{t("cache_management_desc")}</div>
        <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {CACHE_GROUPS.map((g, i) => (
            <Focusable key={g.id} flow-children="horizontal" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ flex: 1, fontSize: 13 }}>{t(g.labelKey)}</span>
              <span style={{ fontSize: 12, opacity: 0.7, fontVariantNumeric: "tabular-nums", minWidth: 64, textAlign: "right" }}>{formatBytes(cacheSizes[i])}</span>
              <DialogButton disabled={cacheSizes[i] === 0} onClick={() => handleClearGroup(g)} onOKButton={() => handleClearGroup(g)} style={{ ...BTN_COMPACT_STYLE, minWidth: 0, width: "auto" }}>{t("cache_clear")}</DialogButton>
            </Focusable>
          ))}
        </Focusable>
      </CollapsibleSection>
      <SnapshotsSection t={t} />
      <DiagnosticsSection t={t} />
      <ToggleField
        label={t("dev_mode_title")}
        checked={devMode}
        onChange={(v: boolean) => (controller.actions as any).setDevModeEnabled?.(v)}
      />
    </Focusable>
  );
}
