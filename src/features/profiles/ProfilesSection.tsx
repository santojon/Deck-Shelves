import type { ReactNode } from "react";
import { Dropdown, Field, ToggleField } from "../../runtime/host/decky";
import { CollapsibleSection } from "../../components/ui";
import { PersonIcon, CheckIcon, StackIcon } from "../../components/icons";
import { icons } from "../../components/qam/icons";
import type { SettingsController } from "../settings/controller";
import { FACTORY_PROFILE_ID, FACTORY_PROFILE_NAME } from "../settings/controller/profiles";
import { openManagedModal } from "../../components/qam/common/openManagedModal";
import { SaveProfileModal } from "./SaveProfileModal";
import { confirmAction } from "../../components/qam/modals/ConfirmActionModal";
import { ReorderableShelfList } from "../../components/qam/common/ReorderableShelfList";
import { HideableRow, type HideableRowMode } from "../../components/qam/sidecar/HideableRow";
import { ProfileRowMenuButton } from "./ProfileRowMenu";

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
    <div className={`deck-shelves-nameplate ${profile.hidden ? "deck-shelves-hidden" : ""}`}>
      {active ? <span className="deck-shelves-hidden-icon"><CheckIcon size={14} color="currentColor" /></span> : null}
      <span className="deck-shelves-hidden-icon">{profile.hidden ? icons.eyeClosed : icons.eyeOpen}</span>
      <span className="deck-shelves-nameplate-text">{profile.name}</span>
      {profile.linkShelves ? <span className="deck-shelves-hidden-icon" style={{ marginLeft: 6, opacity: 0.7 }}><StackIcon size={12} /></span> : null}
    </div>
  );
}

// Derived state the section renders from: shelf counts (for the zero-hide), the
// profile list + active name, the sidecar flag, hidden-toggle keys, and the
// dropdown-visible (non-hidden) profiles.
function deriveProfilesState(settings: any, headerExtra: any) {
  const regularCount = (settings.shelves ?? []).length;
  const smartCount = (settings.smartShelves ?? []).length;
  const profiles: any[] = settings.profiles ?? [];
  const activeName: string | null = settings.activeProfileName ?? null;
  const isSidecar = headerExtra != null;
  const hiddenToggles: string[] = settings.qamHiddenToggles ?? [];
  const visible = profiles.filter((p) => !p.hidden);
  return { regularCount, smartCount, profiles, activeName, isSidecar, hiddenToggles, visible };
}

// The quick-select dropdown options (Save current / factory / None / profiles)
// and the currently-selected entry.
function buildProfileDropdown(visible: any[], activeName: string | null, t: (k: string) => string) {
  const options = [
    { label: `+ ${t("profile_add_action" as any) || "Save current"}`, data: "__SAVE__" },
    { label: t("profile_factory_name" as any) || FACTORY_PROFILE_NAME, data: FACTORY_PROFILE_ID },
    { label: t("profile_none_option" as any) || "None", data: "__NONE__" },
    // A shelf-linked profile says so, since only those swap the shelves.
    ...visible.map((p) => ({ label: p.linkShelves ? `${p.name} · ${t("profile_includes_shelves" as any)}` : p.name, data: p.id })),
  ];
  const selectedData = activeName
    ? (visible.find((p) => p.name === activeName)?.id ?? "__NONE__")
    : "__NONE__";
  return { options, selectedData };
}

export function ProfilesSection({ controller, hidden, headerExtra }: ProfilesSectionProps) {
  if (hidden) return null;
  const { settings, t } = controller;
  if (!settings) return null;
  // Hide when the user has zero shelves of any kind. Array order drives both the
  // list and the dropdown (reorder persists it); hidden profiles stay in the
  // list but drop out of the quick-select dropdown.
  const { regularCount, smartCount, profiles, activeName, isSidecar, hiddenToggles, visible } =
    deriveProfilesState(settings, headerExtra);
  if (regularCount + smartCount === 0) return null;

  const mode: HideableRowMode = isSidecar ? "sidecar" : "qam";
  const isHid = (k: string) => hiddenToggles.includes(k);
  const setHid = (k: string, v: boolean) => (controller.actions as any).setQamHiddenToggle?.(k, v);

  const { options: dropdownOptions, selectedData } = buildProfileDropdown(visible, activeName, t);

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
        body: t("settings_profiles_factory_confirm_message" as any),
        okText: t("settings_profiles_apply" as any),
        cancelText: t("cancel"),
        toggleLabel: t("settings_profiles_factory_reset_shelves" as any),
        onConfirm: (resetShelves: boolean) => (controller.actions as any).applyFactoryProfile?.(resetShelves),
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
    <div className="deck-shelves-nameplate" style={{ padding: "6px 16px" }}>
      <span className="deck-shelves-nameplate-text">{t("profile_list_label" as any) || "Profiles list"}</span>
    </div>
  ) : (
    <ReorderableShelfList
      items={profiles}
      emptyText={t("settings_profiles_empty" as any)}
      onReorder={(ids) => (controller.actions as any).setProfilesOrder?.(ids)}
      renderLabel={(p: any) => <ProfileLabel profile={p} active={activeName === p.name} />}
      renderActions={(p: any) => <ProfileRowMenuButton controller={controller} profile={p} />}
    />
  );

  return (
    <CollapsibleSection
      id="profiles"
      icon={<PersonIcon />}
      title={t("profile_section_title" as any) || "Profiles"}
      count={profiles.length}
      initialOpen={false}
      headerExtra={headerExtra}
    >
      <HideableRow tk="profileDropdown" hidden={isHid("profileDropdown")} setHidden={(v) => setHid("profileDropdown", v)} mode={mode} t={t}>
        {dropdownNode}
      </HideableRow>
      <HideableRow tk="profileTriggers" hidden={isHid("profileTriggers")} setHidden={(v) => setHid("profileTriggers", v)} mode={mode} t={t}>
        <ToggleField
          label={t("settings_profile_triggers_label" as any)}
          checked={(settings as any).profileTriggersEnabled === true}
          onChange={(v: boolean) => (controller.actions as any).setProfileTriggersEnabled?.(v)}
        />
        {/* QAM subtext pattern: a styled div under the toggle (not ToggleField's
           `description`, which mis-aligns in the QAM's custom CSS) — matches the
           context-search hint. QAM only; the sidecar stays compact. */}
        {mode === "qam" ? (
          <div style={{ paddingLeft: 16, paddingRight: 8, paddingBottom: 4, fontSize: 11, opacity: 0.65, lineHeight: 1.4 }}>
            {t("settings_profile_triggers_qam_hint" as any)}
          </div>
        ) : null}
      </HideableRow>
      <HideableRow tk="profileList" hidden={isHid("profileList")} setHidden={(v) => setHid("profileList", v)} mode={mode} t={t}>
        {listNode}
      </HideableRow>
    </CollapsibleSection>
  );
}
