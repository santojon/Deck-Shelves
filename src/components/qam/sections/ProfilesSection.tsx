import type { ReactNode } from "react";
import { Dropdown, Field, Menu, MenuItem, showContextMenu, DialogButton } from "../../../runtime/host/decky";
import { CollapsibleSection } from "../../ui";
import { PersonIcon, CheckIcon } from "../../icons";
import { icons } from "../icons";
import type { SettingsController } from "../../../features/settings/controller";
import { FACTORY_PROFILE_ID, FACTORY_PROFILE_NAME } from "../../../features/settings/controller/profiles";
import { openManagedModal } from "../common/openManagedModal";
import { SaveProfileModal } from "../modals/SaveProfileModal";
import { RenameProfileModal } from "../modals/RenameProfileModal";
import { confirmAction } from "../modals/ConfirmActionModal";
import { joinDownloads } from "../../../core/userPaths";
import { ReorderableShelfList } from "../common/ReorderableShelfList";
import { HideableRow, type HideableRowMode } from "../sidecar/HideableRow";

export interface ProfilesSectionProps {
  controller: SettingsController;
  hidden: boolean;
  // Sidecar passes the visibility eye here (the QAM omits it).
  headerExtra?: ReactNode;
}

// Row label: an active check (same colour as the eye), then the eye (open /
// crossed when hidden), then the name — same structure + classes as the
// shelves list (left-aligned, only ellipsised on real overflow).
function ProfileLabel({ profile, active }: { profile: any; active: boolean }) {
  return (
    <div className={`deck-shelves-label-cont ${profile.hidden ? "deck-shelves-hidden" : ""}`}>
      {active ? <span className="deck-shelves-hidden-icon"><CheckIcon size={14} color="currentColor" /></span> : null}
      <span className="deck-shelves-hidden-icon">{profile.hidden ? icons.eyeClosed : icons.eyeOpen}</span>
      <span className="deck-shelves-label-text">{profile.name}</span>
    </div>
  );
}

function ProfileActionsButton({ controller, profile }: { controller: SettingsController; profile: any }) {
  const { t, actions } = controller;
  const exportPath = joinDownloads(`profile-${profile.name}.json`.replace(/\s+/g, "-").toLowerCase());
  const onClick = () => showContextMenu(
    <Menu label={profile.name}>
      <MenuItem onSelected={() => (actions as any).applyProfile?.(profile.id)}>{t("settings_profiles_apply" as any)}</MenuItem>
      <MenuItem onSelected={() => (actions as any).updateProfileSnapshot?.(profile.id)}>{t("settings_profiles_update" as any)}</MenuItem>
      <MenuItem onSelected={() => (actions as any).duplicateProfile?.(profile.id)}>{t("settings_profiles_duplicate" as any)}</MenuItem>
      <MenuItem onSelected={() => openManagedModal((close) => <RenameProfileModal closeModal={close} controller={controller} profileId={profile.id} currentName={profile.name} />)}>{t("settings_profiles_rename" as any)}</MenuItem>
      <MenuItem onSelected={() => (actions as any).toggleProfileHidden?.(profile.id)}>{profile.hidden ? t("qam_show" as any) : t("qam_hide" as any)}</MenuItem>
      <MenuItem onSelected={() => (actions as any).exportProfiles?.(exportPath, profile.id)}>{t("settings_profiles_export" as any)}</MenuItem>
      <MenuItem onSelected={() => confirmAction({
        title: t("settings_profiles_delete_confirm_title" as any),
        body: t("settings_profiles_delete_confirm_message" as any),
        okText: t("settings_profiles_delete" as any),
        cancelText: t("cancel"),
        onConfirm: () => (actions as any).deleteProfile?.(profile.id),
      })}>{t("settings_profiles_delete" as any)}</MenuItem>
    </Menu>,
  );
  return (
    <DialogButton
      style={{ height: "40px", minWidth: "40px", width: "40px", display: "flex", justifyContent: "center", alignItems: "center", padding: "10px" }}
      onClick={onClick}
      onOKButton={onClick}
      onOKActionDescription={t("settings_profiles_apply" as any)}
    >
      {icons.ellipsis}
    </DialogButton>
  );
}

export function ProfilesSection({ controller, hidden, headerExtra }: ProfilesSectionProps) {
  if (hidden) return null;
  const { settings, t } = controller;
  if (!settings) return null;
  // Hide when the user has zero shelves of any kind.
  const regularCount = (settings.shelves ?? []).length;
  const smartCount = ((settings as any).smartShelves ?? []).length;
  if (regularCount + smartCount === 0) return null;

  // Array order drives both the list and the dropdown (reorder persists it).
  const profiles: any[] = (settings as any).profiles ?? [];
  const activeName: string | null = (settings as any).activeProfileName ?? null;
  const isSidecar = headerExtra != null;
  const mode: HideableRowMode = isSidecar ? "sidecar" : "qam";
  const hiddenToggles: string[] = (settings as any).qamHiddenToggles ?? [];
  const isHid = (k: string) => hiddenToggles.includes(k);
  const setHid = (k: string, v: boolean) => (controller.actions as any).setQamHiddenToggle?.(k, v);

  // Hidden profiles stay in the list but drop out of the quick-select dropdown.
  const visible = profiles.filter((p) => !p.hidden);
  const dropdownOptions = [
    { label: `+ ${t("profile_add_action" as any) || "Save current"}`, data: "__SAVE__" },
    { label: FACTORY_PROFILE_NAME, data: FACTORY_PROFILE_ID },
    { label: t("profile_none_option" as any) || "None", data: "__NONE__" },
    ...visible.map((p) => ({ label: p.name, data: p.id })),
  ];
  const selectedData = activeName
    ? (visible.find((p) => p.name === activeName)?.id ?? "__NONE__")
    : "__NONE__";

  const handleSelect = (option: { data: string }) => {
    const d = option.data;
    if (d === "__SAVE__") {
      openManagedModal((close) => <SaveProfileModal closeModal={close} controller={controller} />);
      return;
    }
    if (d === "__NONE__") {
      (controller.actions as any).clearActiveProfile?.();
      return;
    }
    if (d === FACTORY_PROFILE_ID) {
      confirmAction({
        title: t("settings_profiles_apply_confirm_title" as any),
        body: t("settings_profiles_apply_confirm_message" as any),
        okText: t("settings_profiles_apply" as any),
        cancelText: t("cancel"),
        onConfirm: () => (controller.actions as any).applyFactoryProfile?.(),
      });
      return;
    }
    (controller.actions as any).applyProfile?.(d);
  };

  const dropdownNode = (
    <Field padding="compact" label={t("profile_active_label" as any) || "Active profile"}>
      <Dropdown rgOptions={dropdownOptions} selectedOption={selectedData} onChange={handleSelect} />
    </Field>
  );
  // In the sidecar the list is represented by a single item; the QAM renders
  // the full reorderable list.
  const listNode = isSidecar ? (
    <div className="deck-shelves-label-cont" style={{ padding: "6px 16px" }}>
      <span className="deck-shelves-label-text">{t("profile_list_label" as any) || "Profiles list"}</span>
    </div>
  ) : (
    <ReorderableShelfList
      items={profiles}
      emptyText={t("settings_profiles_empty" as any)}
      onReorder={(ids) => (controller.actions as any).setProfilesOrder?.(ids)}
      renderLabel={(p: any) => <ProfileLabel profile={p} active={activeName === p.name} />}
      renderActions={(p: any) => <ProfileActionsButton controller={controller} profile={p} />}
    />
  );

  return (
    <CollapsibleSection
      id="profiles"
      icon={<PersonIcon />}
      title={t("profile_section_title" as any) || "Perfis"}
      count={profiles.length}
      initialOpen={false}
      headerExtra={headerExtra}
    >
      <HideableRow tk="profileDropdown" hidden={isHid("profileDropdown")} setHidden={(v) => setHid("profileDropdown", v)} mode={mode} t={t}>
        {dropdownNode}
      </HideableRow>
      <HideableRow tk="profileList" hidden={isHid("profileList")} setHidden={(v) => setHid("profileList", v)} mode={mode} t={t}>
        {listNode}
      </HideableRow>
    </CollapsibleSection>
  );
}
