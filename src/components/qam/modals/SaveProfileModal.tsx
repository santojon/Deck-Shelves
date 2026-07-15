import { useState } from "react";
import { ConfirmModal, TextField, ToggleField, Focusable } from "../../../runtime/host/decky";
import type { SettingsController } from "../../../features/settings/controller";

export interface SaveProfileModalProps {
  closeModal?: () => void;
  controller: SettingsController;
}

export function SaveProfileModal({ closeModal, controller }: SaveProfileModalProps) {
  const [name, setName] = useState("");
  const [linkShelves, setLinkShelves] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing: any[] = (controller.settings as any)?.profiles ?? [];

  const validate = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return controller.t("profile_save_name_required" as any) || "Profile name is required.";
    const lc = trimmed.toLowerCase();
    if (existing.some((p) => p.name?.trim().toLowerCase() === lc)) {
      return controller.t("profile_save_name_taken" as any) || "A profile with that name already exists.";
    }
    return null;
  };

  const handleSave = async () => {
    const e = validate(name);
    if (e) { setError(e); return; }
    const created = await (controller.actions as any).createProfile?.(name.trim(), linkShelves);
    if (!created) {
      setError(controller.t("profile_save_failed" as any) || "Failed to save profile.");
      return;
    }
    try { closeModal?.(); } catch {}
  };

  return (
    <ConfirmModal
      strTitle={controller.t("profile_save_as" as any) || "Save current configuration as profile"}
      strOKButtonText={controller.t("profile_save_action" as any) || "Save"}
      strCancelButtonText={controller.t("profile_cancel" as any) || "Cancel"}
      onOK={handleSave}
      onCancel={() => { try { closeModal?.(); } catch {} }}
      closeModal={closeModal}
    >
      <Focusable onMenuButton={handleSave} onMenuActionDescription={controller.t("profile_save_action" as any) || "Save"}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}>
        <div style={{ fontSize: 13, opacity: 0.8 }}>
          {controller.t("profile_save_description" as any) || "Captures every setting, every shelf, and every saved filter into a named snapshot you can restore later."}
        </div>
        <TextField
          value={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setName(e?.target?.value ?? "");
            if (error) setError(null);
          }}
          focusOnMount={true}
        />
        {error ? (
          <div style={{ color: "rgba(255, 110, 110, 0.95)", fontSize: 12 }}>{error}</div>
        ) : null}
        <ToggleField
          label={controller.t("profile_link_shelves_label" as any)}
          description={controller.t("profile_link_shelves_desc" as any)}
          checked={linkShelves}
          onChange={(v: boolean) => setLinkShelves(v)}
        />
      </div>
      </Focusable>
    </ConfirmModal>
  );
}
