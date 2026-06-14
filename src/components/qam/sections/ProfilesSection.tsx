import { DialogButton, Dropdown, Focusable, Field } from "../../../runtime/host/decky";
import { CollapsibleSection } from "../../ui";
import { PersonIcon } from "../../icons";
import type { SettingsController } from "../../../features/settings/controller";
import { openManagedModal } from "../common/openManagedModal";
import { SaveProfileModal } from "../modals/SaveProfileModal";

export interface ProfilesSectionProps {
  controller: SettingsController;
  hidden: boolean;
}

export function ProfilesSection({ controller, hidden }: ProfilesSectionProps) {
  if (hidden) return null;
  const { settings, t } = controller;
  if (!settings) return null;
  // Hide when the user has zero shelves of any kind.
  const regularCount = (settings.shelves ?? []).length;
  const smartCount = ((settings as any).smartShelves ?? []).length;
  if (regularCount + smartCount === 0) return null;

  const profiles: any[] = (settings as any).profiles ?? [];
  const activeName: string | null = (settings as any).activeProfileName ?? null;

  const handleAdd = () => {
    openManagedModal((close) => <SaveProfileModal closeModal={close} controller={controller} />);
  };

  const dropdownOptions = [
    { label: t("profile_none_option" as any) || "None", data: "__NONE__" },
    ...profiles
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({ label: p.name, data: p.id })),
  ];
  const selectedData = activeName
    ? (profiles.find((p) => p.name === activeName)?.id ?? "__NONE__")
    : "__NONE__";

  const handleSelect = (option: { data: string }) => {
    if (option.data === "__NONE__") {
      (controller.actions as any).clearActiveProfile?.();
      return;
    }
    (controller.actions as any).applyProfile?.(option.data);
  };

  return (
    <CollapsibleSection
      id="profiles"
      icon={<PersonIcon />}
      title={t("profile_section_title" as any) || "Perfis"}
      count={profiles.length}
      initialOpen={false}
    >
      <Focusable flow-children="row" style={{ display: "flex", gap: 6, padding: "4px 8px 8px", alignItems: "center" }}>
        <DialogButton
          onClick={handleAdd}
          onOKButton={handleAdd}
          style={{ minWidth: 0 }}
        >
          + {t("profile_add_action" as any) || "Save current"}
        </DialogButton>
      </Focusable>
      {profiles.length > 0 ? (
        <Field padding="compact" label={t("profile_active_label" as any) || "Active profile"}>
          <Dropdown
            rgOptions={dropdownOptions}
            selectedOption={selectedData}
            onChange={handleSelect}
          />
        </Field>
      ) : null}
    </CollapsibleSection>
  );
}
