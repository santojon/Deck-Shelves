import React, { useEffect, useState } from "react";
import { Focusable, DialogButton } from "@decky/ui";
import { CheckIcon, XIcon, ChevronIcon, getTypeLabel, capitalizeFirst, isValidParams } from "./utils";
import type { FilterItem } from "../../types";

export default function FilterSectionAccordion({ index, item, isOpen, children }: { index: number; item: FilterItem; isOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(isOpen);
  const valid = isValidParams(item);

  useEffect(() => {
    if (isOpen) setOpen(true);
  }, [isOpen]);

  return (
    <Focusable style={{ width: "100%", padding: 0 }}>
      <Focusable>
        <DialogButton
          style={{
            width: "100%",
            padding: "6px 0",
            margin: 0,
            background: "transparent",
            border: "none",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
          }}
          onClick={(e: any) => { e?.stopPropagation?.(); setOpen((o) => !o); }}
          onOKButton={(e: any) => { e?.stopPropagation?.(); setOpen((o) => !o); }}
        >
          <div style={{ width: 12, height: 1, background: "rgba(255,255,255,0.2)", flexShrink: 0 }} />
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0, fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>
            {valid ? <CheckIcon /> : <XIcon />}
            {`Filter ${index + 1} - ${capitalizeFirst(getTypeLabel(item.type))}`}
          </div>
          <div style={{ flexGrow: 1, height: 1, background: "rgba(255,255,255,0.2)" }} />
          <ChevronIcon open={open} />
          <div style={{ width: 12, height: 1, background: "rgba(255,255,255,0.2)", flexShrink: 0 }} />
        </DialogButton>
      </Focusable>
      {open && children}
    </Focusable>
  );
}
