import React from "react";
import { Focusable, Dropdown, DialogButton } from "@decky/ui";
import { TrashIcon, ALL_FILTER_TYPES, canBeInverted, defaultParams, getTypeLabel } from "./utils";
import type { FilterItem, FilterItemType } from "../../types";
import type { SingleDropdownOption } from "@decky/ui";
import i18n from "../../i18n";

export default function FilterEntry({ index, item, allItems, onChange, onDelete, shouldFocus }: {
  index: number;
  item: FilterItem;
  allItems: FilterItem[];
  onChange: (updated: FilterItem) => void;
  onDelete: () => void;
  shouldFocus: boolean;
}) {
  const invertible = canBeInverted(item.type);

  const typeOptions: SingleDropdownOption[] = ALL_FILTER_TYPES.map((type) => ({ data: type, label: String(type) }));

  const t = i18n.t.bind(i18n);
  const invertOptions: SingleDropdownOption[] = [
    { data: false, label: t("filter_invert_default") },
    { data: true, label: t("filter_invert_label") },
  ];

  const typeWidth = invertible ? "calc(100% - 185px)" : "calc(100% - 55px)";

  return (
    <div>
      <Focusable style={{ width: "100%", display: "flex", flexDirection: "row", alignItems: "center" }}>
        <Focusable style={{ width: typeWidth }}>
          <Dropdown
            rgOptions={typeOptions}
            selectedOption={item.type}
            onChange={(opt: any) => {
              const newType = (opt?.data ?? opt) as FilterItemType;
              if (newType !== item.type) {
                onChange({ type: newType, inverted: false, params: defaultParams(newType) });
              }
            }}
            focusable
          />
        </Focusable>
        {invertible && (
          <Focusable style={{ marginLeft: 10, width: 120 }}>
            <Dropdown
              rgOptions={invertOptions}
              selectedOption={item.inverted ?? false}
              onChange={(opt: any) => onChange({ ...item, inverted: (opt?.data ?? opt) as boolean })}
              focusable
            />
          </Focusable>
        )}
        <Focusable style={{ marginLeft: 10, width: 45 }}>
          <DialogButton
            style={{ width: "100%", height: 36, minWidth: 0, padding: 8, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={onDelete}
            onOKButton={onDelete}
            onOKActionDescription={"Remove"}
          >
            <TrashIcon />
          </DialogButton>
        </Focusable>
      </Focusable>
    </div>
  );
}
