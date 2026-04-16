import { PanelSectionRow, DropdownItem, Field, SliderField, TextField, ToggleField } from "@decky/ui";
import type { FilterItem } from "../../types";
import i18n from "../../i18n";
import DeveloperFilterOptions from "./DeveloperFilterOptions";
import { COMPAT_LEVELS } from "./utils";

export default function FilterItemOptions({ item, onChange }: { item: FilterItem; onChange: (patch: Partial<FilterItem>) => void }) {
  const t = i18n.t.bind(i18n);
  const p = item.params ?? {};
  const patchParams = (patch: Record<string, any>) => onChange({ params: { ...p, ...patch } });

  const HIDDEN_OPTIONS = [
    { data: "any", label: t("filter_hidden_any") },
    { data: "only", label: t("filter_hidden_only") },
    { data: "exclude", label: t("filter_hidden_exclude") },
  ];

  switch (item.type) {
    case "installed":
    case "favorites":
    case "nonSteam":
    case "updatePending":
    case "isNew":
      return null;

    case "hidden":
      return (
        <PanelSectionRow>
          <DropdownItem
            label={t("filter_type_hidden")}
            rgOptions={HIDDEN_OPTIONS}
            selectedOption={p.mode ?? "exclude"}
            onChange={(opt: any) => patchParams({ mode: (opt?.data ?? opt) as string })}
            bottomSeparator="none"
          />
        </PanelSectionRow>
      );

    case "deckCompatibility": {
      const levels: string[] = Array.isArray(p.levels) ? p.levels : [];
      const compatSet = new Set(levels);
      return (
        <>
          {COMPAT_LEVELS.map((key) => (
            <PanelSectionRow key={key}>
              <ToggleField
                label={t(`compat_${key}`)}
                checked={compatSet.has(key)}
                onChange={(val: boolean) => {
                  const next = new Set(compatSet);
                  if (val) next.add(key); else next.delete(key);
                  patchParams({ levels: Array.from(next) });
                }}
                bottomSeparator="none"
              />
            </PanelSectionRow>
          ))}
        </>
      );
    }

    case "playedWithinDays": {
      const days = Number(p.days ?? 30);
      return (
        <PanelSectionRow>
          <Field label={`${t("filter_days")}: ${days}d`} bottomSeparator="none">
            <SliderField
              label=""
              value={days}
              min={1}
              max={365}
              step={1}
              onChange={(v: number) => patchParams({ days: v })}
            />
          </Field>
        </PanelSectionRow>
      );
    }

    case "playtimeRange": {
      const minH = Number(p.minHours ?? 0);
      const maxH = Number(p.maxHours ?? 0);
      return (
        <>
          <PanelSectionRow>
            <Field label={`${t("filter_playtime_min")}: ${minH}h`} bottomSeparator="none">
              <SliderField
                label=""
                value={minH}
                min={0}
                max={500}
                step={5}
                onChange={(v: number) => patchParams({ minHours: v > 0 ? v : undefined })}
              />
            </Field>
          </PanelSectionRow>
          <PanelSectionRow>
            <Field label={`${t("filter_playtime_max")}: ${maxH > 0 ? maxH + "h" : t("filter_playtime_any")}`} bottomSeparator="none">
              <SliderField
                label=""
                value={maxH}
                min={0}
                max={500}
                step={5}
                onChange={(v: number) => patchParams({ maxHours: v > 0 ? v : undefined })}
              />
            </Field>
          </PanelSectionRow>
        </>
      );
    }

    case "nameIncludes":
      return (
        <PanelSectionRow>
          <Field label={t("filter_type_nameIncludes")} bottomSeparator="none">
            <TextField
              value={String(p.text ?? "")}
              onChange={(val: any) => {
                const text = typeof val === "string" ? val : (val as any)?.target?.value ?? (val as any)?.value ?? "";
                patchParams({ text });
              }}
            />
          </Field>
        </PanelSectionRow>
      );

    case "nameRegex":
      return (
        <PanelSectionRow>
          <Field label={t("filter_type_nameRegex")} bottomSeparator="none">
            <TextField
              value={String(p.pattern ?? "")}
              onChange={(val: any) => {
                const pattern = typeof val === "string" ? val : (val as any)?.target?.value ?? (val as any)?.value ?? "";
                patchParams({ pattern });
              }}
            />
          </Field>
        </PanelSectionRow>
      );

    case "collection":
      return (
        <PanelSectionRow>
          <Field label={t("filter_collection_label")} bottomSeparator="none">
            <TextField
              value={String(p.collectionId ?? "")}
              onChange={(val: any) => {
                const collectionId = typeof val === "string" ? val : (val as any)?.target?.value ?? (val as any)?.value ?? "";
                patchParams({ collectionId });
              }}
            />
          </Field>
        </PanelSectionRow>
      );

    case "storeTag": {
      const tags: string[] = Array.isArray(p.tags) ? p.tags : [];
      return (
        <PanelSectionRow>
          <Field label={t("filter_type_storeTag")} description={t("filter_tags_hint")} bottomSeparator="none">
            <TextField
              value={tags.join(", ")}
              onChange={(val: any) => {
                const raw = typeof val === "string" ? val : (val as any)?.target?.value ?? (val as any)?.value ?? "";
                patchParams({ tags: raw.split(",").map((s: string) => s.trim()).filter(Boolean) });
              }}
            />
          </Field>
        </PanelSectionRow>
      );
    }

    case "developer":
      return <DeveloperFilterOptions selected={Array.isArray(p.developers) ? p.developers : []} onChange={(devs) => patchParams({ developers: devs })} />;

    case "friends":
    case "achievements":
      return (
        <PanelSectionRow>
          <div style={{ padding: "6px 0", color: "#8b9ab5", fontSize: 12, lineHeight: 1.4 }}>
            {t(item.type === "friends" ? "filter_friends_info" : "filter_achievements_info")}
          </div>
        </PanelSectionRow>
      );

    case "merge": {
      const subItems: FilterItem[] = Array.isArray(p.items) ? (p.items as FilterItem[]) : [];
      const subMode: string = p.mode ?? "and";
      return (
        <PanelSectionRow>
          <div style={{ padding: "4px 0", color: "#8b9ab5", fontSize: 12, lineHeight: 1.4 }}>
            {t("filter_merge_info", { count: subItems.length, mode: subMode.toUpperCase() })}
          </div>
        </PanelSectionRow>
      );
    }

    default:
      return null;
  }
}
