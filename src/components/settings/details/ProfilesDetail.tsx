import React, { useState } from "react";
import { DialogButton, Focusable, TextField } from "../../../runtime/host/decky";
import type { useSettingsController } from "../../../features/settings/controller";
import { FACTORY_PROFILE_ID, FACTORY_PROFILE_NAME } from "../../../features/settings/controller/profiles";
import { joinDownloads } from "../../../core/userPaths";
import { SettingsSection } from "../../ui/SettingsSection";
import { CollapsibleSection } from "../../ui/CollapsibleSection";
import { CheckIcon, CopyIcon, DownloadIcon, PencilIcon, PlayIcon, SaveIcon, TrashIcon, UploadIcon, XIcon, PersonIcon } from "../../icons";
import { BTN_ICON_COMPACT_STYLE, BTN_STYLE } from "../../ui/buttonStyles";


export interface ProfilesDetailProps {
  controller: ReturnType<typeof useSettingsController>;
  t: (key: string) => string;
}

export function ProfilesDetail({ controller, t }: ProfilesDetailProps) {
  const settings = controller.settings;
  const [newName, setNewName] = useState("");
  const [confirmApplyId, setConfirmApplyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  if (!settings) return null;
  const savedProfiles = (settings as any).profiles ?? [];
  // Factory-defaults read-only entry sits at the top of the list.
  // Apply resets every setting to defaults; saved profiles are
  // preserved. Cannot be renamed, deleted, updated, or duplicated.
  const factoryEntry = {
    id: FACTORY_PROFILE_ID,
    name: FACTORY_PROFILE_NAME,
    createdAt: "",
    snapshot: {},
    readOnly: true as const,
  };
  const profiles = [factoryEntry, ...savedProfiles];
  const activeName = (settings as any).activeProfileName as string | null;

  const exportAll = async () => {
    const dest = joinDownloads("deck-shelves-profiles.json");
    await (controller.actions as any).exportProfiles?.(dest);
  };
  const importMerge = async () => {
    const src = joinDownloads("deck-shelves-profiles.json");
    await (controller.actions as any).importProfiles?.(src, "merge");
  };

  const handleSave = async () => {
    const name = newName.trim();
    if (!name) return;
    const created = await (controller.actions as any).createProfile?.(name);
    if (created) setNewName("");
  };

  const handleApply = async () => {
    if (!confirmApplyId) return;
    if (confirmApplyId === FACTORY_PROFILE_ID) {
      await (controller.actions as any).applyFactoryProfile?.();
    } else {
      await (controller.actions as any).applyProfile?.(confirmApplyId);
    }
    setConfirmApplyId(null);
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    await (controller.actions as any).deleteProfile?.(confirmDeleteId);
    setConfirmDeleteId(null);
  };

  const handleRename = async () => {
    if (!renameId) return;
    const next = renameDraft.trim();
    if (!next) { setRenameId(null); return; }
    await (controller.actions as any).renameProfile?.(renameId, next);
    setRenameId(null);
    setRenameDraft("");
  };

  return (
    <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column" }}>
      <CollapsibleSection id="profiles-list" title={t("settings_profiles_list_title")} count={savedProfiles.length} icon={<PersonIcon size={14} />} initialOpen>
        <div style={{ fontSize: 12, opacity: 0.6, margin: "2px 0 8px" }}>{t("settings_profiles_list_desc")}</div>
        {profiles.length === 0 ? (
          <div style={{ opacity: 0.55, padding: 12, fontStyle: "italic" }}>
            {t("settings_profiles_empty")}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {profiles.map((profile: any) => {
              const isFactory = profile.id === FACTORY_PROFILE_ID;
              const isActive = activeName === profile.name;
              const isRenaming = renameId === profile.id;
              return (
                <Focusable
                  key={profile.id}
                  flow-children="row"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: 6,
                    background: "rgba(255, 255, 255, 0.04)",
                    border: isActive
                      ? "1px solid rgba(120, 180, 255, 0.45)"
                      : "1px solid transparent",
                  }}
                >
                  {isRenaming ? (
                    <div style={{ flex: 1 }}>
                      <TextField
                        value={renameDraft}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRenameDraft(e?.target?.value ?? "")}
                      />
                    </div>
                  ) : (
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, display: "flex", gap: 8, alignItems: "center" }}>
                        <span>{profile.name}</span>
                        {isActive ? (
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "rgba(120, 180, 255, 0.95)",
                            background: "rgba(120, 180, 255, 0.18)",
                            padding: "2px 6px",
                            borderRadius: 999,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}>{t("settings_profiles_active")}</span>
                        ) : null}
                      </div>
                      <div style={{ opacity: 0.55, fontSize: 12, marginTop: 2 }}>
                        {profile.createdAt ? profile.createdAt.slice(0, 10) : ""}
                      </div>
                    </div>
                  )}
                  {isRenaming ? (
                    <Focusable flow-children="row" style={{ display: "flex", gap: 4 }}>
                      <DialogButton onClick={handleRename} onOKButton={handleRename} style={BTN_ICON_COMPACT_STYLE} aria-label={t("settings_profiles_save_action")}>
                        <CheckIcon size={14} />
                      </DialogButton>
                      <DialogButton onClick={() => { setRenameId(null); setRenameDraft(""); }} style={BTN_ICON_COMPACT_STYLE} aria-label={t("settings_profiles_cancel")}>
                        <XIcon size={14} />
                      </DialogButton>
                    </Focusable>
                  ) : (
                    <Focusable flow-children="row" style={{ display: "flex", gap: 4 }}>
                      <DialogButton
                        onClick={() => setConfirmApplyId(profile.id)}
                        onOKButton={() => setConfirmApplyId(profile.id)}
                        style={BTN_ICON_COMPACT_STYLE}
                        aria-label={t("settings_profiles_apply")}
                      >
                        <PlayIcon size={14} />
                      </DialogButton>
                      {!isFactory ? (
                        <>
                          <DialogButton
                            onClick={() => (controller.actions as any).updateProfileSnapshot?.(profile.id)}
                            onOKButton={() => (controller.actions as any).updateProfileSnapshot?.(profile.id)}
                            style={BTN_ICON_COMPACT_STYLE}
                            aria-label={t("settings_profiles_update")}
                          >
                            <SaveIcon size={14} />
                          </DialogButton>
                          <DialogButton
                            onClick={() => (controller.actions as any).duplicateProfile?.(profile.id)}
                            onOKButton={() => (controller.actions as any).duplicateProfile?.(profile.id)}
                            style={BTN_ICON_COMPACT_STYLE}
                            aria-label={t("settings_profiles_duplicate")}
                          >
                            <CopyIcon size={14} />
                          </DialogButton>
                          <DialogButton
                            onClick={() => { setRenameId(profile.id); setRenameDraft(profile.name); }}
                            onOKButton={() => { setRenameId(profile.id); setRenameDraft(profile.name); }}
                            style={BTN_ICON_COMPACT_STYLE}
                            aria-label={t("settings_profiles_rename")}
                          >
                            <PencilIcon size={14} />
                          </DialogButton>
                          <DialogButton
                            onClick={() => (controller.actions as any).exportProfiles?.(joinDownloads(`profile-${profile.name}.json`.replace(/\s+/g, "-").toLowerCase()), profile.id)}
                            onOKButton={() => (controller.actions as any).exportProfiles?.(joinDownloads(`profile-${profile.name}.json`.replace(/\s+/g, "-").toLowerCase()), profile.id)}
                            style={BTN_ICON_COMPACT_STYLE}
                            aria-label={t("settings_profiles_export")}
                          >
                            <UploadIcon size={14} />
                          </DialogButton>
                          <DialogButton
                            onClick={() => setConfirmDeleteId(profile.id)}
                            onOKButton={() => setConfirmDeleteId(profile.id)}
                            style={BTN_ICON_COMPACT_STYLE}
                            aria-label={t("settings_profiles_delete")}
                          >
                            <TrashIcon size={14} />
                          </DialogButton>
                        </>
                      ) : (
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          opacity: 0.7,
                          padding: "4px 8px",
                          background: "rgba(255,255,255,0.06)",
                          borderRadius: 999,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          alignSelf: "center",
                        }}>{t("settings_profiles_factory_badge")}</span>
                      )}
                    </Focusable>
                  )}
                </Focusable>
              );
            })}
          </div>
        )}
      </CollapsibleSection>

      <SettingsSection title={t("settings_profiles_save_title")} description={t("settings_profiles_save_desc")}>
        <Focusable flow-children="row" style={{ display: "flex", gap: 8, alignItems: "center", width: "100%" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TextField
              value={newName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e?.target?.value ?? "")}
              style={{ width: "100%" } as any}
            />
          </div>
          <DialogButton
            onClick={handleSave}
            onOKButton={handleSave}
            disabled={!newName.trim()}
            style={{ ...BTN_ICON_COMPACT_STYLE, flexShrink: 0 }}
            aria-label={t("settings_profiles_save_action")}
          >
            <SaveIcon size={14} />
          </DialogButton>
        </Focusable>
      </SettingsSection>

      <SettingsSection title={t("settings_profiles_io_title")} description={t("settings_profiles_io_desc")}>
        <Focusable flow-children="row" style={{ display: "flex", gap: 8 }}>
          <DialogButton onClick={exportAll} onOKButton={exportAll} style={BTN_STYLE}>
            <UploadIcon size={14} />
            <span>{t("settings_profiles_export_all")}</span>
          </DialogButton>
          <DialogButton onClick={importMerge} onOKButton={importMerge} style={BTN_STYLE}>
            <DownloadIcon size={14} />
            <span>{t("settings_profiles_import")}</span>
          </DialogButton>
        </Focusable>
      </SettingsSection>

      {activeName ? (
        <SettingsSection
          title={t("settings_profiles_active_title")}
          description={t("settings_profiles_active_desc").replace("{{name}}", activeName)}
        >
          <DialogButton
            onClick={() => (controller.actions as any).clearActiveProfile?.()}
            onOKButton={() => (controller.actions as any).clearActiveProfile?.()}
          >
            {t("settings_profiles_clear_active")}
          </DialogButton>
        </SettingsSection>
      ) : null}

      {confirmApplyId ? (
        <ConfirmDialog
          title={t("settings_profiles_apply_confirm_title")}
          message={t("settings_profiles_apply_confirm_message")}
          confirmLabel={t("settings_profiles_apply")}
          cancelLabel={t("settings_profiles_cancel")}
          onConfirm={handleApply}
          onCancel={() => setConfirmApplyId(null)}
        />
      ) : null}
      {confirmDeleteId ? (
        <ConfirmDialog
          title={t("settings_profiles_delete_confirm_title")}
          message={t("settings_profiles_delete_confirm_message")}
          confirmLabel={t("settings_profiles_delete")}
          cancelLabel={t("settings_profiles_cancel")}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      ) : null}
    </Focusable>
  );
}

function ConfirmDialog({
  title, message, confirmLabel, cancelLabel, onConfirm, onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Focusable
      flow-children="vertical"
      onCancelButton={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9_999,
      }}
    >
      <div style={{
        background: "rgba(20, 24, 30, 0.98)",
        borderRadius: 10,
        padding: "20px 24px",
        maxWidth: 480,
        width: "85%",
        border: "1px solid rgba(255,255,255,0.08)",
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ds-text, #fff)", marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--ds-text-dim, rgba(255,255,255,0.85))", lineHeight: 1.45, marginBottom: 16 }}>
          {message}
        </div>
        <Focusable flow-children="row" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <DialogButton onClick={onCancel} onOKButton={onCancel}>{cancelLabel}</DialogButton>
          <DialogButton onClick={onConfirm} onOKButton={onConfirm}>{confirmLabel}</DialogButton>
        </Focusable>
      </div>
    </Focusable>
  );
}
