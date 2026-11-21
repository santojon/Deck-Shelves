import { useState } from "react";
import { ConfirmModal, DialogButton, Focusable, ToggleField } from "../../../runtime/host/decky";
import { ModalShell } from "../../ui";
import type { TemplateOrigin } from "../../../domain/templates";

const ORIGIN_KEY: Record<TemplateOrigin, string> = {
  library: "template_origin_library",
  store: "template_origin_store",
  both: "template_origin_both",
};

const hintStyle: React.CSSProperties = { fontSize: 11, opacity: 0.65, lineHeight: 1.4, padding: "0 4px" };

export function TemplateOriginModal({ closeModal, t, onlineEnabled, onPick }: {
  closeModal?: () => void;
  t: (key: any) => string;
  onlineEnabled: boolean;
  onPick: (origin: TemplateOrigin, borrowedOnly: boolean) => void;
}) {
  const [borrowedOnly, setBorrowedOnly] = useState(false);
  const origins: TemplateOrigin[] = onlineEnabled ? ["library", "store", "both"] : ["library"];
  const pick = (origin: TemplateOrigin) => {
    closeModal?.();
    onPick(origin, origin !== "store" && borrowedOnly);
  };
  return (
    <ModalShell>
      <ConfirmModal
        strTitle={t("template_origin_title")}
        strOKButtonText={t("close")}
        onOK={() => closeModal?.()}
        onCancel={() => closeModal?.()}
      >
        <Focusable style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <ToggleField
            label={t("template_origin_borrowed")}
            description={onlineEnabled ? t("template_origin_borrowed_desc") : undefined}
            checked={borrowedOnly}
            onChange={(v: boolean) => setBorrowedOnly(v)}
          />
          {origins.map((origin) => (
            <DialogButton
              key={origin}
              onClick={() => pick(origin)}
              onOKButton={() => pick(origin)}
              onOKActionDescription={t(ORIGIN_KEY[origin])}
            >
              {t(ORIGIN_KEY[origin])}
            </DialogButton>
          ))}
          {onlineEnabled ? <div style={hintStyle}>{t("template_origin_store_hint")}</div> : null}
        </Focusable>
      </ConfirmModal>
    </ModalShell>
  );
}
