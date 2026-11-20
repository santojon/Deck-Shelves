import type { FilterItem, FilterGroup, FilterItemType } from "../../types";
import { ConditionEditor } from "./ConditionEditor";
import { holdsOnlyTypes } from "./ConditionRow";
import { SavedFiltersBar } from "../qam/modals/editShelf/SavedFiltersBar";
import type { SettingsController } from "../../features/settings/controller";

export default function NestedConditionEditor({
  item,
  onChange,
  controller,
  allowOnlineFilters = false,
  onlineFeaturesOn = false,
  onlyTypes,
}: {
  item: FilterItem;
  onChange: (patch: Partial<FilterItem>) => void;
  controller?: SettingsController;
  allowOnlineFilters?: boolean;
  onlineFeaturesOn?: boolean;
  onlyTypes?: readonly FilterItemType[];
}) {
  const p = item.params ?? {};
  const items: FilterItem[] = Array.isArray(p.items) ? (p.items as FilterItem[]) : [];
  const mode: "and" | "or" = (p.mode as "and" | "or") ?? "and";
  const group: FilterGroup = { mode, items };
  const setGroup = (g: FilterGroup) => onChange({ params: { ...p, mode: g.mode, items: g.items } });
  return (
    <div
      style={{
        marginTop: 4,
        marginLeft: 8,
        paddingLeft: 8,
        borderLeft: "2px solid rgba(255,255,255,0.08)",
      }}
    >
      {controller && (
        <SavedFiltersBar
          controller={controller}
          currentGroup={group}
          onApply={(applied) => setGroup({ mode: applied.mode, items: applied.items.slice() })}
          accepts={onlyTypes ? (saved) => holdsOnlyTypes(saved, onlyTypes) : undefined}
        />
      )}
      <ConditionEditor group={group} onChange={setGroup} controller={controller} allowOnlineFilters={allowOnlineFilters} onlineFeaturesOn={onlineFeaturesOn} onlyTypes={onlyTypes} />
    </div>
  );
}
