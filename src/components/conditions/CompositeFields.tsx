import type { FilterItem, FilterGroup, FilterItemType } from "../../types";
import { ConditionEditor } from "./ConditionEditor";
import type { SettingsController } from "../../features/settings/controller";
import i18n from "../../i18n";
import { DSSliderField } from "../ui";

function compositeHint(type: FilterItem["type"], t: (k: any) => string): string {
  if (type === "weightedFilter") return t("filter_weighted_hint");
  if (type === "priorityFilter") return t("filter_priority_hint");
  return t("filter_exclusion_hint");
}

export default function CompositeFields({
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
  const t = i18n.t.bind(i18n);
  const p = item.params ?? {};
  const children: FilterItem[] = Array.isArray(p.children) ? (p.children as FilterItem[]) : [];
  const isWeighted = item.type === "weightedFilter";
  const threshold = Math.max(1, Number(p.threshold ?? 1));

  const group: FilterGroup = { mode: "or", items: children };
  const setChildren = (g: FilterGroup) => onChange({ params: { ...p, children: g.items } });

  const hint = compositeHint(item.type, t);

  return (
    <div style={{ marginTop: 4, marginLeft: 8, paddingLeft: 8, borderLeft: "2px solid rgba(255,255,255,0.08)" }}>
      <div style={{ padding: "4px 0", color: "var(--ds-text-dim, #8b9ab5)", fontSize: 12, lineHeight: 1.4 }}>{hint}</div>
      {isWeighted && (
        <DSSliderField
          label={t("filter_weighted_threshold")}
          value={Math.min(threshold, Math.max(1, children.length || 1))}
          min={1}
          max={Math.max(1, children.length || 1)}
          step={1}
          bottomSeparator="none"
          onChange={(v: number) => onChange({ params: { ...p, threshold: v } })}
        />
      )}
      <ConditionEditor group={group} onChange={setChildren} controller={controller} allowOnlineFilters={allowOnlineFilters} onlineFeaturesOn={onlineFeaturesOn} onlyTypes={onlyTypes} hideMode />
    </div>
  );
}
