import React, { useState } from "react";
import { DialogButton, Focusable, ToggleField } from "../../../runtime/host/decky";
import { SettingsSection } from "../../ui/SettingsSection";
import { PencilIcon, PlusCircleIcon, TrashIcon } from "../../icons";
import { BTN_ICON_COMPACT_STYLE } from "../../ui/buttonStyles";

import type { useSettingsController } from "../../../features/settings/controller";
import { openManagedModal } from "../../qam/common/openManagedModal";
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

  // Always use the unified Create modal (Standard + Smart tabs) so
  // users can create either type regardless of the unified-list flag.
  const handleAdd = () => openManagedModal((close) => (
    <CreateShelfModal closeModal={close} controller={controller} />
  ));

  return (
    <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Focusable flow-children="row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 4, alignItems: "center" }}>
        <DialogButton onClick={handleAdd} onOKButton={handleAdd} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 32, width: "100%" }}>
          <PlusCircleIcon size={14} />
          <span>{t("add_shelf")}</span>
        </DialogButton>
        <ToggleField
          label={t("unified_list_enabled")}
          checked={unifiedOn}
          onChange={(v: boolean) => void (controller.actions as any).setUnifiedListEnabled?.(v)}
        />
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
        <Focusable flow-children="horizontal" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
        </Focusable>
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
  const move = (id: string, dir: -1 | 1) => {
    const action = isSmart
      ? (controller.actions as any).moveSmartShelf
      : (controller.actions as any).moveShelf;
    void action?.(id, dir);
  };
  return (
    <SettingsSection title={title}>
      {shelves.length === 0 ? (
        <div style={{ opacity: 0.55, padding: 8, fontStyle: "italic", fontSize: 12 }}>
          {t("settings_empty_shelves")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {shelves.map((shelf, idx) => (
            <ShelfRow
              key={shelf.id}
              shelf={shelf}
              isSmart={isSmart}
              controller={controller}
              t={t}
              reorder={{
                moveUp: idx > 0 ? () => move(shelf.id, -1) : undefined,
                moveDown: idx < shelves.length - 1 ? () => move(shelf.id, 1) : undefined,
              }}
            />
          ))}
        </div>
      )}
    </SettingsSection>
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
    <SettingsSection title={title}>
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
    </SettingsSection>
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

function dragRowStyle(dnd?: DnDProps): React.CSSProperties {
  if (!dnd) return {};
  return {
    opacity: dnd.isDragging ? 0.5 : 1,
    borderTop: dnd.isHover ? "2px solid var(--gpSystemLighter, rgba(120,180,255,0.85))" : "2px solid transparent",
    cursor: "grab",
  };
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
  const dragStyle = dragRowStyle(dnd);
  return (
    <Focusable
      flow-children="row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: 6,
        background: "var(--ds-surface, rgba(255, 255, 255, 0.03))",
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
          <DialogButton onClick={reorder.moveUp} onOKButton={reorder.moveUp} style={BTN_ICON_COMPACT_STYLE} aria-label={t("settings_move_up")}>↑</DialogButton>
        ) : null}
        {reorder?.moveDown ? (
          <DialogButton onClick={reorder.moveDown} onOKButton={reorder.moveDown} style={BTN_ICON_COMPACT_STYLE} aria-label={t("settings_move_down")}>↓</DialogButton>
        ) : null}
        <DialogButton onClick={handleEdit} onOKButton={handleEdit} style={BTN_ICON_COMPACT_STYLE} aria-label={t("settings_edit_action")}>
          <PencilIcon size={14} />
        </DialogButton>
        <DialogButton onClick={handleDelete} onOKButton={handleDelete} style={BTN_ICON_COMPACT_STYLE} aria-label={t("settings_delete_action")}>
          <TrashIcon size={14} />
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

const SOURCE_DESCRIBERS: Record<string, (s: any) => string> = {
  tab: (s) => `tab: ${s.tab}`,
  collection: (s) => `collection: ${s.collectionId}`,
  filter: () => "filter",
  composite: (s) => `composite: ${s.combine ?? "union"}`,
  smart: (s) => `smart: ${s.mode}`,
};

function describeSource(shelf: any, isSmart: boolean): string {
  if (isSmart) return `mode: ${shelf.mode ?? "—"}`;
  const s = shelf.source;
  if (!s) return "—";
  return SOURCE_DESCRIBERS[s.type]?.(s) ?? s.type ?? "—";
}
