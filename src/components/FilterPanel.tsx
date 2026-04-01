import React, { useCallback, useRef, useEffect, useState } from "react";
import {
  ButtonItem,
  DialogButton,
  Dropdown,
  DropdownItem,
  Field,
  Focusable,
  PanelSection,
  PanelSectionRow,
  SingleDropdownOption,
  SliderField,
  TextField,
  ToggleField,
} from "@decky/ui";
import type { FilterGroup, FilterItem, FilterItemType } from "../types";
import i18n from "../i18n";

// ---------- constants ----------

const ALL_FILTER_TYPES: FilterItemType[] = [
  "installed",
  "favorites",
  "nonSteam",
  "hidden",
  "updatePending",
  "deckCompatibility",
  "playedWithinDays",
  "playtimeRange",
  "nameIncludes",
  "nameRegex",
  "friends",
  "storeTag",
  "achievements",
  "collection",
  "merge",
];

const COMPAT_LEVELS = ["verified", "playable", "unsupported", "unknown"] as const;

// Types that support the "Invert" dropdown (mirrors CustomTabs)
const INVERTIBLE_SET = new Set<FilterItemType>([
  "favorites",
  "deckCompatibility",
  "playedWithinDays",
  "playtimeRange",
  "nameIncludes",
  "nameRegex",
]);

function canBeInverted(type: FilterItemType): boolean {
  return INVERTIBLE_SET.has(type);
}

function defaultParams(type: FilterItemType): Record<string, any> {
  switch (type) {
    case "hidden": return { mode: "exclude" };
    case "deckCompatibility": return { levels: ["verified", "playable"] };
    case "playedWithinDays": return { days: 30 };
    case "playtimeRange": return { minHours: undefined, maxHours: undefined };
    case "nameIncludes": return { text: "" };
    case "nameRegex": return { pattern: "" };
    case "friends": return { friends: [] };
    case "storeTag": return { tags: [] };
    case "achievements": return {};
    case "collection": return { collectionId: "" };
    case "merge": return { mode: "and", items: [] };
    default: return {};
  }
}

function isValidParams(item: FilterItem): boolean {
  const p = item.params ?? {};
  switch (item.type) {
    case "installed":
    case "favorites":
    case "nonSteam":
    case "updatePending":
      return true;
    case "hidden":
      return !!p.mode;
    case "deckCompatibility":
      return Array.isArray(p.levels) && p.levels.length > 0;
    case "playedWithinDays":
      return Number(p.days ?? 0) > 0;
    case "playtimeRange":
      return true;
    case "nameIncludes":
      return String(p.text ?? "").length > 0;
    case "nameRegex": {
      const pat = String(p.pattern ?? "");
      if (!pat) return false;
      try { new RegExp(pat); return true; } catch { return false; }
    }
    case "friends":
      return Array.isArray(p.friends) && p.friends.length > 0;
    case "storeTag":
      return Array.isArray(p.tags) && p.tags.length > 0;
    case "achievements":
      return true;
    case "collection":
      return Boolean(p.collectionId);
    case "merge":
      return Array.isArray(p.items) && p.items.length > 0;
    default:
      return true;
  }
}

function getTypeLabel(type: FilterItemType): string {
  const t = i18n.t.bind(i18n);
  const map: Record<FilterItemType, string> = {
    installed: t("filter_type_installed"),
    favorites: t("filter_type_favorites"),
    nonSteam: t("filter_type_nonSteam"),
    hidden: t("filter_type_hidden"),
    updatePending: t("filter_type_updatePending"),
    deckCompatibility: t("filter_type_deckCompatibility"),
    playedWithinDays: t("filter_type_playedWithinDays"),
    playtimeRange: t("filter_type_playtimeRange"),
    nameIncludes: t("filter_type_nameIncludes"),
    nameRegex: t("filter_type_nameRegex"),
    friends: t("filter_type_friends"),
    storeTag: t("filter_type_storeTag"),
    achievements: t("filter_type_achievements"),
    collection: t("filter_type_collection"),
    merge: t("filter_type_merge"),
  };
  return map[type] ?? type;
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- icons (inline SVG, no external deps) ----------

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 3, flexShrink: 0 }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f44336" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 3, flexShrink: 0 }}>
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transition: "transform 0.2s ease-in-out", transform: open ? "rotate(0deg)" : "rotate(-90deg)", flexShrink: 0 }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M10 10v6" /><path d="M14 10v6" /><path d="M6 6l1 14h10l1-14" />
  </svg>
);

// ---------- FilterOptions: params UI per type ----------

function FilterItemOptions({
  item,
  onChange,
}: {
  item: FilterItem;
  onChange: (patch: Partial<FilterItem>) => void;
}) {
  const t = i18n.t.bind(i18n);
  const p = item.params ?? {};
  const patchParams = (patch: Record<string, any>) => onChange({ params: { ...p, ...patch } });

  const HIDDEN_OPTIONS: SingleDropdownOption[] = [
    { data: "any", label: t("filter_hidden_any") },
    { data: "only", label: t("filter_hidden_only") },
    { data: "exclude", label: t("filter_hidden_exclude") },
  ];

  switch (item.type) {
    case "installed":
    case "favorites":
    case "nonSteam":
    case "updatePending":
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

// ---------- FilterSectionAccordion ----------

function FilterSectionAccordion({
  index,
  item,
  isOpen,
  children,
}: {
  index: number;
  item: FilterItem;
  isOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(isOpen);
  const valid = isValidParams(item);

  // Sync open state when parent requests it (e.g. new filter added)
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
          {/* left line */}
          <div style={{ width: 12, height: 1, background: "rgba(255,255,255,0.2)", flexShrink: 0 }} />
          {/* label */}
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0, fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>
            {valid ? <CheckIcon /> : <XIcon />}
            {`Filter ${index + 1} - ${capitalizeFirst(getTypeLabel(item.type))}`}
          </div>
          {/* right line */}
          <div style={{ flexGrow: 1, height: 1, background: "rgba(255,255,255,0.2)" }} />
          <ChevronIcon open={open} />
          <div style={{ width: 12, height: 1, background: "rgba(255,255,255,0.2)", flexShrink: 0 }} />
        </DialogButton>
      </Focusable>
      {open && children}
    </Focusable>
  );
}

// ---------- FilterEntry (per-filter row: type dropdown + invert dropdown + trash) ----------

function FilterEntry({
  index,
  item,
  allItems,
  onChange,
  onDelete,
  shouldFocus,
}: {
  index: number;
  item: FilterItem;
  allItems: FilterItem[];
  onChange: (updated: FilterItem) => void;
  onDelete: () => void;
  shouldFocus: boolean;
}) {
  const t = i18n.t.bind(i18n);
  const invertible = canBeInverted(item.type);

  const typeOptions: SingleDropdownOption[] = ALL_FILTER_TYPES.map((type) => ({
    data: type,
    label: getTypeLabel(type),
  }));

  const invertOptions: SingleDropdownOption[] = [
    { data: false, label: t("filter_invert_default") },
    { data: true, label: t("filter_invert_label") },
  ];

  // width mirrors CustomTabs: full - 55px (trash) - 120px (invert) - 10px gap - 10px gap
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
            onOKActionDescription={t("filter_remove")}
          >
            <TrashIcon />
          </DialogButton>
        </Focusable>
      </Focusable>
    </div>
  );
}

// ---------- Main FilterPanel (matches CustomTabs' FiltersPanel) ----------

export type FilterPanelProps = {
  group: FilterGroup;
  onChange: (group: FilterGroup) => void;
};

export function FilterPanel({ group, onChange }: FilterPanelProps) {
  const t = i18n.t.bind(i18n);
  const items = group.items ?? [];
  const mode = group.mode ?? "and";

  // Track newly added index so accordion auto-opens it
  const newFilterIdx = useRef(-1);
  const deletedFilterIdx = useRef(-1);

  const modeOptions: SingleDropdownOption[] = [
    { data: "and", label: t("filter_group_mode_and") },
    { data: "or", label: t("filter_group_mode_or") },
  ];

  const updateItem = useCallback((index: number, updated: FilterItem) => {
    const next = items.slice();
    next[index] = updated;
    onChange({ ...group, items: next });
  }, [group, items, onChange]);

  const removeItem = useCallback((index: number) => {
    deletedFilterIdx.current = index;
    const next = items.filter((_, i) => i !== index);
    onChange({ ...group, items: next });
  }, [group, items, onChange]);

  const addItem = useCallback(() => {
    newFilterIdx.current = items.length;
    const newItem: FilterItem = { type: "installed", inverted: false, params: {} };
    onChange({ ...group, items: [...items, newItem] });
  }, [group, items, onChange]);

  // canAddFilter: all existing items must have valid params
  const canAddFilter = items.every(isValidParams);

  // after each render, reset the tracking refs
  useEffect(() => {
    newFilterIdx.current = -1;
    deletedFilterIdx.current = -1;
  });

  return (
    <Focusable style={{ marginTop: 8 }}>
      <PanelSection title={t("filter_section_title")}>
        {/* Group Combination Logic — always visible */}
        <PanelSectionRow>
          <Field
            label={t("filter_group_mode_label")}
            childrenLayout="inline"
            childrenContainerWidth="min"
            inlineWrap="keep-inline"
          >
            <div style={{ width: 100 }}>
              <Dropdown
                rgOptions={modeOptions}
                selectedOption={mode}
                onChange={(opt: any) => onChange({ ...group, mode: (opt?.data ?? opt) as "and" | "or" })}
                focusable
              />
            </div>
          </Field>
        </PanelSectionRow>

        {/* Filter list */}
        <PanelSectionRow>
          {items.map((item, index) => {
            const isNewlyAdded = newFilterIdx.current === index;
            const isRestoredFocus =
              deletedFilterIdx.current !== -1 &&
              (deletedFilterIdx.current !== items.length
                ? index === deletedFilterIdx.current
                : index === items.length - 1);
            const isOpen = isNewlyAdded || isRestoredFocus || !items.length;

            return (
              <React.Fragment key={index}>
                <FilterSectionAccordion index={index} item={item} isOpen={isOpen}>
                  <div>
                    <Field
                      label={t("filter_type_label")}
                      description={
                        <FilterEntry
                          index={index}
                          item={item}
                          allItems={items}
                          onChange={(updated) => updateItem(index, updated)}
                          onDelete={() => removeItem(index)}
                          shouldFocus={isNewlyAdded || isRestoredFocus}
                        />
                      }
                    />
                    <FilterItemOptions
                      item={item}
                      onChange={(patch) => updateItem(index, { ...item, ...patch })}
                    />
                  </div>
                </FilterSectionAccordion>
                {index === items.length - 1 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ height: 1, background: "rgba(255,255,255,0.1)" }} />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </PanelSectionRow>

        {/* Add filter */}
        <PanelSectionRow>
          <div>
            {!canAddFilter && (
              <div style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                {t("filter_finish_before_adding")}
              </div>
            )}
            <ButtonItem onClick={addItem} disabled={!canAddFilter}>
              {t("filter_add")}
            </ButtonItem>
          </div>
        </PanelSectionRow>
      </PanelSection>
    </Focusable>
  );
}
