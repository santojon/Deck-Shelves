import React, { useCallback } from "react";
import {
  ConfirmModal,
  DialogButton,
  DropdownItem,
  Field,
  Focusable,
  Menu,
  MenuItem,
  SingleDropdownOption,
  SliderField,
  TextField,
  ToggleField,
  showContextMenu,
  showModal,
} from "@decky/ui";
import type { FilterGroup, FilterItem, FilterItemType } from "../types";
import i18n from "../i18n";

const COMPAT_LEVELS = ["verified", "playable", "unsupported", "unknown"] as const;

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
];

/** Filter types that support the invert toggle */
const INVERTIBLE_TYPES: FilterItemType[] = [
  "installed",
  "favorites",
  "nonSteam",
  "updatePending",
  "playedWithinDays",
  "playtimeRange",
  "nameIncludes",
  "nameRegex",
];

function canBeInverted(type: FilterItemType): boolean {
  return INVERTIBLE_TYPES.includes(type);
}

function defaultParams(type: FilterItemType): Record<string, any> {
  switch (type) {
    case "hidden": return { mode: "exclude" };
    case "deckCompatibility": return { levels: ["verified", "playable"] };
    case "playedWithinDays": return { days: 30 };
    case "playtimeRange": return { minHours: undefined, maxHours: undefined };
    case "nameIncludes": return { text: "" };
    case "nameRegex": return { pattern: "" };
    default: return {};
  }
}

function icon(paths: React.ReactNode, size = 16) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths}
    </svg>
  );
}

const trashIcon = icon(<><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M10 10v6" /><path d="M14 10v6" /><path d="M6 6l1 14h10l1-14" /></>);
const addIcon = icon(<><path d="M12 5v14" /><path d="M5 12h14" /></>);

// --- Helpers ---

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
  };
  return map[type] ?? type;
}

function getSummary(item: FilterItem): string {
  const t = i18n.t.bind(i18n);
  const p = item.params ?? {};
  const inv = item.inverted ? ` (${t("filter_inverted")})` : "";
  switch (item.type) {
    case "installed":
    case "favorites":
    case "nonSteam":
    case "updatePending":
      return getTypeLabel(item.type) + inv;
    case "hidden": {
      const modeLabel =
        p.mode === "only" ? t("filter_hidden_only") :
        p.mode === "exclude" ? t("filter_hidden_exclude") :
        t("filter_hidden_any");
      return `${getTypeLabel(item.type)}: ${modeLabel}`;
    }
    case "deckCompatibility": {
      const levels: string[] = Array.isArray(p.levels) ? p.levels : [];
      return levels.length ? `${getTypeLabel(item.type)}: ${levels.map((l) => t(`compat_${l}`)).join(", ")}` : getTypeLabel(item.type);
    }
    case "playedWithinDays":
      return `${getTypeLabel(item.type)}: ${p.days ?? 30}d${inv}`;
    case "playtimeRange": {
      const min = p.minHours != null ? `${p.minHours}h` : null;
      const max = p.maxHours != null ? `${p.maxHours}h` : null;
      if (min && max) return `${getTypeLabel(item.type)}: ${min}–${max}${inv}`;
      if (min) return `${getTypeLabel(item.type)}: ≥${min}${inv}`;
      if (max) return `${getTypeLabel(item.type)}: ≤${max}${inv}`;
      return getTypeLabel(item.type) + inv;
    }
    case "nameIncludes":
      return p.text ? `${getTypeLabel(item.type)}: "${p.text}"${inv}` : getTypeLabel(item.type) + inv;
    case "nameRegex":
      return p.pattern ? `${getTypeLabel(item.type)}: /${p.pattern}/${inv}` : getTypeLabel(item.type) + inv;
    default:
      return getTypeLabel(item.type) + inv;
  }
}

// --- Filter Item Options sub-component ---

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
        <DropdownItem
          label={t("filter_type_hidden")}
          rgOptions={HIDDEN_OPTIONS}
          selectedOption={p.mode ?? "exclude"}
          onChange={(opt: any) => patchParams({ mode: (opt?.data ?? opt) as string })}
          bottomSeparator="none"
        />
      );

    case "deckCompatibility": {
      const levels: string[] = Array.isArray(p.levels) ? p.levels : [];
      const compatSet = new Set(levels);
      return (
        <div>
          {COMPAT_LEVELS.map((key) => (
            <ToggleField
              key={key}
              label={t(`compat_${key}`)}
              checked={compatSet.has(key)}
              onChange={(val: boolean) => {
                const next = new Set(compatSet);
                if (val) next.add(key); else next.delete(key);
                patchParams({ levels: Array.from(next) });
              }}
              bottomSeparator="none"
            />
          ))}
        </div>
      );
    }

    case "playedWithinDays":
      return (
        <Field label={`${t("filter_days")}: ${p.days ?? 30}d`}>
          <SliderField
            label=""
            value={p.days ?? 30}
            min={1}
            max={365}
            step={1}
            onChange={(v: number) => patchParams({ days: v })}
          />
        </Field>
      );

    case "playtimeRange": {
      const minH = p.minHours ?? 0;
      const maxH = p.maxHours ?? 0;
      return (
        <div>
          <Field label={`${t("filter_playtime_min")}: ${minH}h`}>
            <SliderField
              label=""
              value={minH}
              min={0}
              max={500}
              step={5}
              onChange={(v: number) => patchParams({ minHours: v > 0 ? v : undefined })}
            />
          </Field>
          <Field label={`${t("filter_playtime_max")}: ${maxH > 0 ? maxH + "h" : t("filter_playtime_any")}`}>
            <SliderField
              label=""
              value={maxH}
              min={0}
              max={500}
              step={5}
              onChange={(v: number) => patchParams({ maxHours: v > 0 ? v : undefined })}
            />
          </Field>
        </div>
      );
    }

    case "nameIncludes":
      return (
        <Field description={
          <div className="deck-shelves-extra-wide-field deck-shelves-filter-text-field">
            <TextField
              value={p.text ?? ""}
              onChange={(val: any) => {
                const text = typeof val === "string" ? val : (val as any)?.target?.value ?? (val as any)?.value ?? "";
                patchParams({ text });
              }}
            />
          </div>
        } />
      );

    case "nameRegex":
      return (
        <Field description={
          <div className="deck-shelves-extra-wide-field deck-shelves-filter-text-field">
            <TextField
              value={p.pattern ?? ""}
              onChange={(val: any) => {
                const pattern = typeof val === "string" ? val : (val as any)?.target?.value ?? (val as any)?.value ?? "";
                patchParams({ pattern });
              }}
            />
          </div>
        } />
      );

    default:
      return null;
  }
}

// --- Add Filter modal ---

function AddFilterModal({
  closeModal,
  onAdd,
  existing,
}: {
  closeModal?: () => void;
  onAdd: (type: FilterItemType) => void;
  existing: FilterItemType[];
}) {
  const t = i18n.t.bind(i18n);
  return (
    <ConfirmModal
      strTitle={t("filter_add")}
      bHideCloseIcon
      onCancel={closeModal}
      onEscKeypress={closeModal}
      bAlertDialog
    >
      <Focusable>
        {ALL_FILTER_TYPES.map((type) => {
          const already = existing.filter((e) => e === type).length;
          return (
            <DialogButton
              key={type}
              disabled={["installed", "favorites", "nonSteam", "updatePending"].includes(type) && already > 0}
              style={{ marginBottom: 4, textAlign: "left" }}
              onClick={() => { closeModal?.(); onAdd(type); }}
            >
              {getTypeLabel(type)}
            </DialogButton>
          );
        })}
      </Focusable>
    </ConfirmModal>
  );
}

// --- Single filter item row ---

function FilterItemRow({
  item,
  index,
  total,
  onChange,
  onRemove,
}: {
  item: FilterItem;
  index: number;
  total: number;
  onChange: (updated: FilterItem) => void;
  onRemove: () => void;
}) {
  const t = i18n.t.bind(i18n);
  const invertible = canBeInverted(item.type);

  const typeOptions: SingleDropdownOption[] = ALL_FILTER_TYPES.map((type) => ({
    data: type,
    label: getTypeLabel(type),
  }));

  const onOpenMenu = () => {
    showContextMenu(
      <Menu label={getSummary(item)}>
        {invertible && (
          <MenuItem onSelected={() => onChange({ ...item, inverted: !item.inverted })}>
            {item.inverted ? t("filter_not_inverted") : t("filter_invert")}
          </MenuItem>
        )}
        <MenuItem onSelected={onRemove}>{t("filter_remove")}</MenuItem>
      </Menu>
    );
  };

  return (
    <div style={{ marginBottom: 4, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "6px 8px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
        <div style={{ flex: 1 }}>
          <DropdownItem
            label=""
            rgOptions={typeOptions}
            selectedOption={item.type}
            onChange={(opt: any) => {
              const newType = (opt?.data ?? opt) as FilterItemType;
              if (newType !== item.type) {
                onChange({ type: newType, inverted: false, params: defaultParams(newType) });
              }
            }}
            bottomSeparator="none"
          />
        </div>
        {invertible && (
          <ToggleField
            label={t("filter_invert")}
            checked={!!item.inverted}
            onChange={(val: boolean) => onChange({ ...item, inverted: val })}
            bottomSeparator="none"
          />
        )}
        <DialogButton
          style={{ height: 36, width: 36, minWidth: 0, padding: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          onClick={onRemove}
          onOKButton={onRemove}
          onOKActionDescription={t("filter_remove")}
        >
          {trashIcon}
        </DialogButton>
      </div>
      <FilterItemOptions
        item={item}
        onChange={(patch) => onChange({ ...item, ...patch })}
      />
    </div>
  );
}

// --- Main FilterPanel ---

export type FilterPanelProps = {
  group: FilterGroup;
  onChange: (group: FilterGroup) => void;
};

export function FilterPanel({ group, onChange }: FilterPanelProps) {
  const t = i18n.t.bind(i18n);
  const items = group.items ?? [];
  const mode = group.mode ?? "and";

  const updateItem = useCallback((index: number, updated: FilterItem) => {
    const next = items.slice();
    next[index] = updated;
    onChange({ ...group, items: next });
  }, [group, items, onChange]);

  const removeItem = useCallback((index: number) => {
    const next = items.filter((_, i) => i !== index);
    onChange({ ...group, items: next });
  }, [group, items, onChange]);

  const addItem = useCallback((type: FilterItemType) => {
    const newItem: FilterItem = { type, inverted: false, params: defaultParams(type) };
    onChange({ ...group, items: [...items, newItem] });
  }, [group, items, onChange]);

  const openAddModal = () => {
    let handle: any = null;
    const close = () => {
      try {
        if (typeof handle === "function") handle();
        else if (handle?.Close) handle.Close();
        else if (handle?.closeModal) handle.closeModal();
      } catch {}
    };
    handle = showModal(
      <AddFilterModal
        closeModal={close}
        onAdd={addItem}
        existing={items.map((i) => i.type)}
      />
    );
  };

  const MODE_OPTIONS: SingleDropdownOption[] = [
    { data: "and", label: t("filter_group_mode_and") },
    { data: "or", label: t("filter_group_mode_or") },
  ];

  return (
    <div>
      {items.length > 1 && (
        <DropdownItem
          label={t("filter_group_mode_label")}
          rgOptions={MODE_OPTIONS}
          selectedOption={mode}
          onChange={(opt: any) => onChange({ ...group, mode: (opt?.data ?? opt) as "and" | "or" })}
          bottomSeparator="thick"
        />
      )}
      {items.length === 0 && (
        <div style={{ padding: "8px 0", fontSize: 12, color: "rgba(255,255,255,0.4)", textAlign: "center" }}>
          {t("filter_no_items")}
        </div>
      )}
      {items.map((item, index) => (
        <FilterItemRow
          key={index}
          item={item}
          index={index}
          total={items.length}
          onChange={(updated) => updateItem(index, updated)}
          onRemove={() => removeItem(index)}
        />
      ))}
      <Focusable style={{ marginTop: 8 }}>
        <DialogButton
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px" }}
          onClick={openAddModal}
          onOKButton={openAddModal}
          onOKActionDescription={t("filter_add")}
        >
          {addIcon}
          <span>{t("filter_add")}</span>
        </DialogButton>
      </Focusable>
    </div>
  );
}
