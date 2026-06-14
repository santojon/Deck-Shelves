import React, { useState } from "react";
import { DialogButton, Focusable } from "../../../runtime/host/decky";
import { PencilIcon, PlusCircleIcon, TrashIcon } from "../../icons";

const ICON_BTN_STYLE: React.CSSProperties = {
  minWidth: 0, width: 32, height: 32, padding: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
};
import type { useSettingsController } from "../../../features/settings/controller";
import { openManagedModal } from "../../qam/common/openManagedModal";
import { TemplatePickerModal } from "../../qam/modals/TemplatePickerModal";
import { CreateShelfModal } from "../../qam/modals/CreateShelfModal";
import { EditShelfModal } from "../../qam/modals/EditShelfModal";
import { EditSmartShelfModal } from "../../qam/modals/EditSmartShelfModal";
import { DeleteConfirmModal } from "../../qam/modals/DeleteConfirmModal";
import { DeleteConfirmSmartModal } from "../../qam/modals/DeleteConfirmSmartModal";

export interface ShelvesDetailProps {
  controller: ReturnType<typeof useSettingsController>;
  t: (key: string) => string;
}

export function ShelvesDetail({ controller, t }: ShelvesDetailProps) {
  const settings = controller.settings;
  if (!settings) return null;

  const regulars = settings.shelves ?? [];
  const smarts: any[] = (settings as any).smartShelves ?? [];
  const unifiedOn = (settings as any).unifiedListEnabled === true;

  const handleAdd = () => openManagedModal((close) => (
    unifiedOn
      ? <CreateShelfModal closeModal={close} controller={controller} />
      : <TemplatePickerModal closeModal={close} controller={controller} />
  ));

  return (
    <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Focusable flow-children="row" style={{ display: "flex", gap: 8, marginBottom: 4 }}>
        <DialogButton onClick={handleAdd} onOKButton={handleAdd} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 12px", height: 32 }}>
          <PlusCircleIcon size={14} />
          <span>{t("add_shelf")}</span>
        </DialogButton>
      </Focusable>
      {unifiedOn ? (
        <UnifiedColumn
          title={t("settings_tab_shelves")}
          regulars={regulars}
          smarts={smarts}
          controller={controller}
          t={t}
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <ShelfColumn
            title={t("settings_tab_shelves")}
            shelves={regulars}
            isSmart={false}
            controller={controller}
            t={t}
          />
          <ShelfColumn
            title={t("smart_section_header")}
            shelves={smarts}
            isSmart={true}
            controller={controller}
            t={t}
          />
        </div>
      )}
    </Focusable>
  );
}

function ShelfColumn({
  title, shelves, isSmart, controller, t,
}: {
  title: string;
  shelves: any[];
  isSmart: boolean;
  controller: ReturnType<typeof useSettingsController>;
  t: (k: string) => string;
}) {
  return (
    <div style={{
      padding: "12px 14px",
      borderRadius: 8,
      background: "rgba(255, 255, 255, 0.04)",
      border: "1px solid rgba(255, 255, 255, 0.06)",
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.8, marginBottom: 8 }}>
        {title}
      </div>
      {shelves.length === 0 ? (
        <div style={{ opacity: 0.55, padding: 8, fontStyle: "italic", fontSize: 12 }}>
          {t("settings_empty_shelves")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {shelves.map((shelf) => (
            <ShelfRow key={shelf.id} shelf={shelf} isSmart={isSmart} controller={controller} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function UnifiedColumn({
  title, regulars, smarts, controller, t,
}: {
  title: string;
  regulars: any[];
  smarts: any[];
  controller: ReturnType<typeof useSettingsController>;
  t: (k: string) => string;
}) {
  const order: string[] = ((controller.settings as any)?.allShelvesOrder ?? []) as string[];
  const all = [
    ...regulars.map((s) => ({ ...s, _kind: "normal" as const })),
    ...smarts.map((s) => ({ ...s, _kind: "smart" as const })),
  ];
  const byId = new Map(all.map((s) => [s.id, s]));
  const ordered = order.length > 0
    ? order.map((id) => byId.get(id)).filter(Boolean).concat(all.filter((s) => !order.includes(s.id)))
    : all;

  const moveShelf = (id: string, dir: -1 | 1) => {
    const idsNow = ordered.map((s: any) => s.id);
    const idx = idsNow.indexOf(id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= idsNow.length) return;
    [idsNow[idx], idsNow[target]] = [idsNow[target], idsNow[idx]];
    void (controller.actions as any).setAllShelvesOrder?.(idsNow);
  };

  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const onDragStart = (id: string) => (e: React.DragEvent<HTMLDivElement>) => {
    try { e.dataTransfer.setData("text/ds-shelf-id", id); } catch {}
    e.dataTransfer.effectAllowed = "move";
    setDragId(id);
  };
  const onDragOver = (id: string) => (e: React.DragEvent<HTMLDivElement>) => {
    if (!dragId || dragId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setHoverId(id);
  };
  const onDrop = (id: string) => (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const src = (() => {
      try { return e.dataTransfer.getData("text/ds-shelf-id"); } catch { return dragId ?? ""; }
    })() || dragId || "";
    if (!src || src === id) { setDragId(null); setHoverId(null); return; }
    const idsNow = ordered.map((s: any) => s.id);
    const from = idsNow.indexOf(src);
    const to = idsNow.indexOf(id);
    if (from < 0 || to < 0) { setDragId(null); setHoverId(null); return; }
    const next = idsNow.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void (controller.actions as any).setAllShelvesOrder?.(next);
    setDragId(null);
    setHoverId(null);
  };
  const onDragEnd = () => { setDragId(null); setHoverId(null); };

  return (
    <div style={{
      padding: "12px 14px",
      borderRadius: 8,
      background: "rgba(255, 255, 255, 0.04)",
      border: "1px solid rgba(255, 255, 255, 0.06)",
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.8, marginBottom: 8 }}>
        {title}
      </div>
      {ordered.length === 0 ? (
        <div style={{ opacity: 0.55, padding: 8, fontStyle: "italic", fontSize: 12 }}>
          {t("settings_empty_shelves")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {ordered.map((shelf: any, idx: number) => (
            <ShelfRow
              key={shelf.id}
              shelf={shelf}
              isSmart={shelf._kind === "smart"}
              controller={controller}
              t={t}
              reorder={{
                moveUp: idx > 0 ? () => moveShelf(shelf.id, -1) : undefined,
                moveDown: idx < ordered.length - 1 ? () => moveShelf(shelf.id, 1) : undefined,
              }}
              dnd={{
                draggable: true,
                isDragging: dragId === shelf.id,
                isHover: hoverId === shelf.id && dragId !== shelf.id,
                onDragStart: onDragStart(shelf.id),
                onDragOver: onDragOver(shelf.id),
                onDrop: onDrop(shelf.id),
                onDragEnd,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface DnDProps {
  draggable: boolean;
  isDragging: boolean;
  isHover: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

function ShelfRow({
  shelf, isSmart, controller, t, reorder, dnd,
}: {
  shelf: any;
  isSmart: boolean;
  controller: ReturnType<typeof useSettingsController>;
  t: (k: string) => string;
  reorder?: { moveUp?: () => void; moveDown?: () => void };
  dnd?: DnDProps;
}) {
  const handleEdit = () => openManagedModal((close) => (
    isSmart
      ? <EditSmartShelfModal closeModal={close} controller={controller} shelf={shelf as any} mode="edit" />
      : <EditShelfModal      closeModal={close} controller={controller} shelf={shelf as any} mode="edit" />
  ));
  const handleDelete = () => openManagedModal((close) => (
    isSmart
      ? <DeleteConfirmSmartModal closeModal={close} controller={controller} shelf={shelf as any} />
      : <DeleteConfirmModal      closeModal={close} controller={controller} shelf={shelf as any} />
  ));
  const dragStyle: React.CSSProperties = dnd ? {
    opacity: dnd.isDragging ? 0.5 : 1,
    borderTop: dnd.isHover ? "2px solid var(--gpSystemLighter, rgba(120,180,255,0.85))" : "2px solid transparent",
    cursor: "grab",
  } : {};
  return (
    <Focusable
      flow-children="row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 6,
        background: "rgba(255, 255, 255, 0.03)",
        ...dragStyle,
      }}
      {...(dnd ? {
        draggable: dnd.draggable,
        onDragStart: dnd.onDragStart,
        onDragOver: dnd.onDragOver,
        onDrop: dnd.onDrop,
        onDragEnd: dnd.onDragEnd,
      } as any : {})}
    >
      {dnd ? (
        <span aria-hidden style={{ opacity: 0.45, fontSize: 14, lineHeight: 1, padding: "0 4px", userSelect: "none" }}>
          ⋮⋮
        </span>
      ) : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600, fontSize: 13 }}>
          <span>{shelf.title || "—"}</span>
          <TypeChip kind={isSmart ? "smart" : "normal"} t={t} />
        </div>
        <div style={{ opacity: 0.55, fontSize: 11, marginTop: 2 }}>
          {describeSource(shelf, isSmart)}
        </div>
      </div>
      <Focusable flow-children="row" style={{ display: "flex", gap: 4 }}>
        {reorder?.moveUp ? (
          <DialogButton onClick={reorder.moveUp} onOKButton={reorder.moveUp} style={ICON_BTN_STYLE} aria-label="↑">
            ↑
          </DialogButton>
        ) : null}
        {reorder?.moveDown ? (
          <DialogButton onClick={reorder.moveDown} onOKButton={reorder.moveDown} style={ICON_BTN_STYLE} aria-label="↓">
            ↓
          </DialogButton>
        ) : null}
        <DialogButton onClick={handleEdit} onOKButton={handleEdit} style={ICON_BTN_STYLE} aria-label={t("settings_edit_action")}>
          <PencilIcon size={16} />
        </DialogButton>
        <DialogButton onClick={handleDelete} onOKButton={handleDelete} style={ICON_BTN_STYLE} aria-label={t("settings_delete_action")}>
          <TrashIcon size={16} />
        </DialogButton>
      </Focusable>
    </Focusable>
  );
}

function TypeChip({ kind, t }: { kind: "normal" | "smart"; t: (k: string) => string }) {
  const isSmart = kind === "smart";
  return (
    <span style={{
      fontSize: 9,
      fontWeight: 700,
      color: isSmart ? "rgba(255, 200, 90, 0.95)" : "rgba(120, 180, 255, 0.95)",
      background: isSmart ? "rgba(255, 200, 90, 0.16)" : "rgba(120, 180, 255, 0.16)",
      padding: "2px 6px",
      borderRadius: 999,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    }}>
      {t(isSmart ? "shelf_type_smart" : "shelf_type_normal")}
    </span>
  );
}

function describeSource(shelf: any, isSmart: boolean): string {
  if (isSmart) return `mode: ${shelf.mode ?? "—"}`;
  const s = shelf.source;
  if (!s) return "—";
  if (s.type === "tab")        return `tab: ${s.tab}`;
  if (s.type === "collection") return `collection: ${s.collectionId}`;
  if (s.type === "filter")     return "filter";
  if (s.type === "composite")  return `composite: ${s.combine ?? "union"}`;
  if (s.type === "smart")      return `smart: ${s.mode}`;
  return s.type ?? "—";
}
