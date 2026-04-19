import React, { useEffect, useState } from "react";
import { Focusable } from "@decky/ui";
import { CheckIcon, XIcon, ChevronIcon, getTypeLabel, capitalizeFirst, isValidParams } from "./utils";
import type { FilterItem } from "../../types";
import i18n from "../../i18n";

export default function FilterSectionAccordion({ index, item, isOpen, children }: { index: number; item: FilterItem; isOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(isOpen);
  const valid = isValidParams(item);

  useEffect(() => {
    if (isOpen) setOpen(true);
  }, [isOpen]);

  const toggle = (e: any) => { e?.stopPropagation?.(); setOpen((o) => !o); };

  return (
    <div style={{ width: "100%", padding: 0, margin: 0 }}>
      <Focusable onClick={toggle} onOKButton={toggle}>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6, padding: "8px 0", marginLeft: -42, marginRight: -42 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>
            {valid ? <CheckIcon /> : <XIcon />}
            {`${i18n.t("filter_item", { n: index + 1 })} — ${capitalizeFirst(getTypeLabel(item.type))}`}
          </div>
          <div style={{ flexGrow: 1, height: 1, background: "rgba(255,255,255,0.2)" }} />
          <ChevronIcon open={open} />
        </div>
      </Focusable>
      {open && children}
    </div>
  );
}
