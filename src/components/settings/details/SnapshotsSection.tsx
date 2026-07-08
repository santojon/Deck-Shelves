import { useCallback, useEffect, useState } from "react";
import { DialogButton, Focusable, openFilePicker } from "../../../runtime/host/decky";
import { CollapsibleSection } from "../../ui/CollapsibleSection";
import { confirmAction } from "../../qam/modals/ConfirmActionModal";
import { tryPickerCalls } from "../../qam/modals/modalUtils";
import { getUserDownloadsDir } from "../../../core/userPaths";
import { formatBytes } from "../../../runtime/cacheRegistry";
import { listBackups, createSnapshot, restoreBackup, exportBackupToFile, importBackupFromFile, deleteBackup, clearBackups, type BackupEntry } from "../../../store/settingsStore";
import { RefreshIcon, RestoreIcon, StackIcon, SparkleIcon, PersonIcon, BookmarkIcon, UploadIcon, DownloadIcon, TrashIcon, PlusCircleIcon, GearIcon } from "../../icons";
import { BTN_ICON_STYLE } from "../../ui/buttonStyles";
import { notify } from "../../notify";

function Stat({ icon, n }: { icon: React.ReactNode; n: number }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{icon}{n}</span>;
}

/** Origin marker: automatic vs user-created vs imported (derived from the name). */
function OriginIcon({ name, t }: { name: string; t: (k: string) => string }) {
  if (name.includes("-manual")) return <span aria-label={t("snapshot_origin_manual")} title={t("snapshot_origin_manual")}><PersonIcon size={12} /></span>;
  if (name.includes("-import")) return <span aria-label={t("snapshot_origin_import")} title={t("snapshot_origin_import")}><DownloadIcon size={12} /></span>;
  return <span aria-label={t("snapshot_origin_auto")} title={t("snapshot_origin_auto")}><GearIcon size={12} /></span>;
}

/** Advanced → Snapshots: the rolling versioned settings history. Create a
    snapshot on demand, restore/export/delete any entry, or import an external
    settings file. Distinct from the file-based Backup (export/import). */
export function SnapshotsSection({ t }: { t: (k: string) => string }) {
  const [items, setItems] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    void listBackups().then((b) => { setItems(b); setLoading(false); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const doCreate = () => {
    setBusy(true);
    void createSnapshot().then((b) => { setItems(b); setBusy(false); notify("copy", { body: t("snapshot_created") }); });
  };

  const doImport = async () => {
    const start = getUserDownloadsDir();
    const path = await tryPickerCalls([
      async () => openFilePicker(0 as any, start, true, true, undefined, ["json"], false, false),
      async () => openFilePicker(0 as any, start),
    ]);
    if (!path) return;
    setBusy(true);
    const res = await importBackupFromFile(path);
    setBusy(false);
    notify("copy", { body: res ? t("snapshot_imported") : t("snapshot_import_failed") });
    if (res) setItems(res);
  };

  const doExport = async (b: BackupEntry) => {
    const start = getUserDownloadsDir();
    const folder = await tryPickerCalls([
      async () => openFilePicker(1 as any, start, false, true, undefined, undefined, false, false),
      async () => openFilePicker(1 as any, start),
    ]);
    if (!folder) return;
    const ok = await exportBackupToFile(b.name, `${folder}/${b.name}`);
    notify(ok ? "export" : "error", { body: ok ? t("snapshot_exported") : t("snapshot_export_failed") });
  };

  const doRestore = (name: string) => confirmAction({
    title: t("snapshot_restore"), body: t("snapshot_restore_confirm"),
    okText: t("confirm_continue"), cancelText: t("cancel"),
    onConfirm: () => { void restoreBackup(name).then((res) => { notify("copy", { body: res ? t("snapshot_restored") : t("snapshot_restore_failed") }); load(); }); },
  });

  const doDelete = (name: string) => confirmAction({
    title: t("snapshot_delete"), body: t("snapshot_delete_confirm"),
    okText: t("confirm_continue"), cancelText: t("cancel"),
    onConfirm: () => { void deleteBackup(name).then((res) => { notify("copy", { body: res ? t("snapshot_deleted") : t("snapshot_delete_failed") }); if (res) setItems(res); else load(); }); },
  });

  const doClearAll = () => confirmAction({
    title: t("snapshot_clear_all"), body: t("snapshot_clear_all_confirm"),
    okText: t("confirm_continue"), cancelText: t("cancel"),
    onConfirm: () => { void clearBackups().then((b) => { setItems(b); notify("copy", { body: t("snapshot_cleared_all") }); }); },
  });

  return (
    <CollapsibleSection
      id="adv-snapshots"
      title={t("snapshot_title")}
      count={items.length}
      icon={<StackIcon size={14} />}
      headerExtra={
        <Focusable flow-children="horizontal" style={{ display: "flex", gap: 6 }}>
          <DialogButton disabled={busy} onClick={doCreate} onOKButton={doCreate} style={BTN_ICON_STYLE} aria-label={t("snapshot_create")}>
            <PlusCircleIcon size={12} />
          </DialogButton>
          <DialogButton disabled={busy} onClick={() => void doImport()} onOKButton={() => void doImport()} style={BTN_ICON_STYLE} aria-label={t("snapshot_import")}>
            <DownloadIcon size={12} />
          </DialogButton>
          <DialogButton onClick={load} onOKButton={load} style={BTN_ICON_STYLE} aria-label={t("diag_refresh")}>
            <RefreshIcon size={12} />
          </DialogButton>
          <DialogButton disabled={busy || items.length === 0} onClick={doClearAll} onOKButton={doClearAll} style={BTN_ICON_STYLE} aria-label={t("snapshot_clear_all")}>
            <TrashIcon size={12} />
          </DialogButton>
        </Focusable>
      }
    >
      <div style={{ fontSize: 12, opacity: 0.6, margin: "2px 0 8px" }}>{t("snapshot_desc")}</div>
      {items.length === 0 ? (
        <div style={{ opacity: 0.55, fontStyle: "italic", padding: 8 }}>{loading ? t("snapshot_loading") : t("snapshot_empty")}</div>
      ) : (
        <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {items.map((b) => (
            <Focusable key={b.name} flow-children="horizontal" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ opacity: 0.7, display: "inline-flex" }}><OriginIcon name={b.name} t={t} /></span>
                  {new Date(b.mtime * 1000).toLocaleString()}
                </div>
                <div style={{ fontSize: 11, opacity: 0.65, display: "flex", gap: 10, alignItems: "center", marginTop: 2, flexWrap: "wrap" }}>
                  <Stat icon={<StackIcon size={11} />} n={b.summary.shelves} />
                  <Stat icon={<SparkleIcon size={11} />} n={b.summary.smartShelves} />
                  <Stat icon={<PersonIcon size={11} />} n={b.summary.profiles} />
                  <Stat icon={<BookmarkIcon size={11} />} n={b.summary.filters} />
                  <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.8 }}>{formatBytes(b.size)}</span>
                </div>
              </div>
              <DialogButton onClick={() => doRestore(b.name)} onOKButton={() => doRestore(b.name)} style={BTN_ICON_STYLE} aria-label={t("snapshot_restore")}>
                <RestoreIcon size={12} />
              </DialogButton>
              <DialogButton onClick={() => void doExport(b)} onOKButton={() => void doExport(b)} style={BTN_ICON_STYLE} aria-label={t("snapshot_export")}>
                <UploadIcon size={12} />
              </DialogButton>
              <DialogButton onClick={() => doDelete(b.name)} onOKButton={() => doDelete(b.name)} style={BTN_ICON_STYLE} aria-label={t("snapshot_delete")}>
                <TrashIcon size={12} />
              </DialogButton>
            </Focusable>
          ))}
        </Focusable>
      )}
    </CollapsibleSection>
  );
}
