import { Focusable, Dropdown, DialogButton, type SingleDropdownOption } from "../../runtime/host/decky";
import { TrashIcon, ALL_FILTER_TYPES, canBeInverted, defaultParams, getTypeLabel, isOnlineFilterType } from "./utils";
import { OnlineIcon } from '../icons';
import type { FilterItem, FilterItemType } from "../../types";
import i18n from "../../i18n";
import { icons } from "../qam/icons";

const iconButtonStyle = {
  width: "100%",
  height: 36,
  minWidth: 0,
  padding: 8,
  display: "flex" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

export default function FilterEntry({ item, onChange, onDelete, allowOnlineFilters = false }: {
  index?: number;
  item: FilterItem;
  allItems?: FilterItem[];
  onChange: (updated: FilterItem) => void;
  onDelete: () => void;
  shouldFocus?: boolean;
  /** When false, online-only filter types (e.g. discount) are excluded from
   *  the picker — they rely on the price cache populated by online sources
   *  and have nothing to evaluate against in non-online contexts. */
  allowOnlineFilters?: boolean;
}) {
  const invertible = canBeInverted(item.type);

  // Localized labels (e.g. "Installed", "Favorites", "Combined", "Name contains")
  // sorted alphabetically by display label so the dropdown is browsable.
  const typeOptions: SingleDropdownOption[] = ALL_FILTER_TYPES
    .filter((type) => allowOnlineFilters || !isOnlineFilterType(type as FilterItemType))
    .map((type) => ({
      data: type,
      label: isOnlineFilterType(type as FilterItemType)
        ? (<span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><OnlineIcon size={13} style={{ opacity:0.7 }} />{getTypeLabel(type as FilterItemType)}</span>) as any
        : getTypeLabel(type as FilterItemType),
    }))
    .sort((a, b) => {
      const la = typeof a.label === 'string' ? a.label : getTypeLabel(a.data as FilterItemType);
      const lb = typeof b.label === 'string' ? b.label : getTypeLabel(b.data as FilterItemType);
      return la.localeCompare(lb);
    });

  const t = i18n.t.bind(i18n);

  const typeWidth = invertible ? "calc(100% - 110px)" : "calc(100% - 55px)";
  const inverted = !!item.inverted;

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
          <Focusable style={{ marginLeft: 10, width: 45 }}>
            <DialogButton
              style={iconButtonStyle}
              onClick={() => onChange({ ...item, inverted: !inverted })}
              onOKButton={() => onChange({ ...item, inverted: !inverted })}
              onOKActionDescription={t(inverted ? "filter_invert_label" : "filter_invert_default")}
            >
              {inverted ? icons.filterInvertOn : icons.filterInvertOff}
            </DialogButton>
          </Focusable>
        )}
        <Focusable style={{ marginLeft: 10, width: 45 }}>
          <DialogButton
            style={iconButtonStyle}
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
