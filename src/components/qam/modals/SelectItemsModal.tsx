import React, { useMemo, useState } from "react";
import { ConfirmModal, Focusable, ToggleField } from "../../../runtime/host/decky";
import { ModalShell } from "../../ui";
import { useTranslation } from "react-i18next";

export interface SelectableItem {
  id: string;
  label: string;
  /** Optional secondary line shown under the label (dim). */
  hint?: string;
  /** Hide the row entirely. Used by callers to mark categories the
   *  source payload doesn't include. */
  hidden?: boolean;
  /** Default checked state. Callers always pass `true` for "all on by
   *  default" — kept as a prop so future flows can opt out. */
  defaultChecked?: boolean;
}

export interface SelectItemsModalProps {
  closeModal?: () => void;
  title: string;
  /** Short text above the toggle list. Optional. */
  description?: string;
  items: ReadonlyArray<SelectableItem>;
  confirmLabel: string;
  cancelLabel: string;
  /** Header / footer slot for extra controls (destination picker etc.). */
  header?: React.ReactNode;
  footer?: React.ReactNode;
  destructive?: boolean;
  onConfirm: (selected: ReadonlyArray<string>) => void | Promise<void>;
}

export function SelectItemsModal({
  closeModal, title, description, items, confirmLabel, cancelLabel,
  header, footer, destructive, onConfirm,
}: SelectItemsModalProps) {
  const { t } = useTranslation();
  const visible = useMemo(() => items.filter((it) => !it.hidden), [items]);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(visible.filter((it) => it.defaultChecked !== false).map((it) => it.id)),
  );
  const [busy, setBusy] = useState(false);
  const allChecked = visible.length > 0 && visible.every((it) => selected.has(it.id));

  const toggle = (id: string) => (v: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (v) next.add(id); else next.delete(id);
      return next;
    });
  };
  const toggleAll = (v: boolean) => {
    setSelected(v ? new Set(visible.map((it) => it.id)) : new Set());
  };

  const handleOk = () => {
    setBusy(true);
    (async () => {
      try { await onConfirm(Array.from(selected)); }
      finally { setBusy(false); }
    })();
  };

  return (
    <ModalShell>
      <ConfirmModal
        strTitle={title}
        strDescription={description}
        strOKButtonText={busy ? confirmLabel + "…" : confirmLabel}
        strCancelButtonText={cancelLabel}
        bDestructiveWarning={destructive}
        onCancel={closeModal}
        onEscKeypress={closeModal}
        onOK={handleOk}
      >
        <Focusable flow-children="vertical" onMenuButton={handleOk} onMenuActionDescription={confirmLabel} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "4px 16px" }}>
          {header}
          {visible.length > 0 && (
            <div style={{ borderBottom: "1px solid var(--ds-border, rgba(255,255,255,0.08))", paddingBottom: 4, marginBottom: 4 }}>
              <ToggleField
                label={<span style={{ fontWeight: 700 }}>{t("select_items_all")}</span>}
                checked={allChecked}
                onChange={toggleAll}
              />
            </div>
          )}
          {visible.length === 0 ? (
            <div style={{ padding: 12, opacity: 0.55, fontStyle: "italic" }}>—</div>
          ) : visible.map((it) => (
            <ToggleField
              key={it.id}
              label={
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontWeight: 500 }}>{it.label}</span>
                  {it.hint ? (
                    <span style={{ fontSize: 11, color: "var(--ds-text-dim, rgba(255,255,255,0.6))" }}>{it.hint}</span>
                  ) : null}
                </div>
              }
              checked={selected.has(it.id)}
              onChange={toggle(it.id)}
            />
          ))}
          {footer}
        </Focusable>
      </ConfirmModal>
    </ModalShell>
  );
}
