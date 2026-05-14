import type { FilterItem, FilterGroup } from "../../types";
import { FilterPanel } from "../FilterPanel";
import { SavedFiltersBar } from "../qam/modals/editShelf/SavedFiltersBar";
import type { SettingsController } from "../../features/settings/controller";

export default function MergeFilterOptions({
  item,
  onChange,
  controller,
  allowOnlineFilters = false,
}: {
  item: FilterItem;
  onChange: (patch: Partial<FilterItem>) => void;
  controller?: SettingsController;
  allowOnlineFilters?: boolean;
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
        />
      )}
      <FilterPanel group={group} onChange={setGroup} controller={controller} allowOnlineFilters={allowOnlineFilters} />
    </div>
  );
}
