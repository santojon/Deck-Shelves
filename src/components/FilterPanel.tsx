import { Fragment, useCallback, useRef, useEffect } from "react";
import { DialogButton, Field, Focusable, Dropdown, type SingleDropdownOption } from "../runtime/host/decky";
import type { FilterGroup, FilterItem } from "../types";
import i18n from "../i18n";
import FilterItemOptions from "./filter/FilterItemOptions";
import FilterSectionAccordion from "./filter/FilterSectionAccordion";
import FilterEntry from "./filter/FilterEntry";
import { isValidParams, defaultParams } from "./filter/utils";

// ---------- constants ----------


// ---------- icons (inline SVG, no external deps) ----------

// icons moved to filter/utils

// DeveloperFilterOptions implemented in ./filter/DeveloperFilterOptions.tsx

// ---------- FilterOptions: params UI per type ----------

// FilterItemOptions moved to src/components/filter/FilterItemOptions.tsx

// ---------- FilterSectionAccordion ----------

// FilterSectionAccordion moved to src/components/filter/FilterSectionAccordion.tsx

// ---------- FilterEntry (per-filter row: type dropdown + invert dropdown + trash) ----------

// FilterEntry moved to src/components/filter/FilterEntry.tsx

// ---------- Main FilterPanel (matches CustomTabs' FiltersPanel) ----------

export type FilterPanelProps = {
  group: FilterGroup;
  onChange: (group: FilterGroup) => void;
  /** When provided, nested `merge` filters render their own SavedFiltersBar
   *  so users can apply saved filter groups to a merge's sub-filters. The
   *  top-level SavedFiltersBar lives outside this component (it owns the
   *  whole shelf's group) — this prop only enables the inner one. */
  controller?: import("../features/settings/controller").SettingsController;
  /** Allow online-only filter types (e.g. discount) in the picker. Only
   *  meaningful for wishlist/store child filters where the price cache
   *  actually has data; defaults to false elsewhere. Propagates to nested
   *  merge groups via MergeFilterOptions → FilterPanel. */
  allowOnlineFilters?: boolean;
};

export function FilterPanel({ group, onChange, controller, allowOnlineFilters = false }: FilterPanelProps) {
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
    const newItem: FilterItem = { type: "nameIncludes", inverted: false, params: defaultParams("nameIncludes") };
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
    <div style={{ marginTop: 8 }}>
      <div>
        <div>
          <Field
            label={t("filter_group_mode_label")}
            childrenLayout="inline"
            childrenContainerWidth="min"
            inlineWrap="keep-inline"
          >
            <div style={{ minWidth: 150 }}>
              <Dropdown
                rgOptions={modeOptions}
                selectedOption={mode}
                onChange={(opt: any) => onChange({ ...group, mode: (opt?.data ?? opt) as "and" | "or" })}
                focusable
              />
            </div>
          </Field>
        </div>

        <div>
          {items.map((item, index) => {
            const isNewlyAdded = newFilterIdx.current === index;
            const isRestoredFocus =
              deletedFilterIdx.current !== -1 &&
              (deletedFilterIdx.current !== items.length
                ? index === deletedFilterIdx.current
                : index === items.length - 1);
            const isOpen = isNewlyAdded || isRestoredFocus || !items.length;

            return (
              <Fragment key={index}>
                <FilterSectionAccordion index={index} item={item} isOpen={isOpen}>
                  <div>
                    <FilterEntry
                      index={index}
                      item={item}
                      allItems={items}
                      onChange={(updated) => updateItem(index, updated)}
                      onDelete={() => removeItem(index)}
                      shouldFocus={isNewlyAdded || isRestoredFocus}
                      allowOnlineFilters={allowOnlineFilters}
                    />
                    <FilterItemOptions
                      item={item}
                      onChange={(patch) => updateItem(index, { ...item, ...patch })}
                      controller={controller}
                      allowOnlineFilters={allowOnlineFilters}
                    />
                  </div>
                </FilterSectionAccordion>
                {index === items.length - 1 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ height: 1, background: "rgba(255,255,255,0.1)" }} />
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>

        <div style={{ marginTop: 8, marginLeft: -42, marginRight: -42 }}>
          {!canAddFilter && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", lineHeight: 1.3, padding: "0 0 6px", textAlign: "left" }}>
              {t("filter_finish_before_adding")}
            </div>
          )}
          <Focusable>
            <DialogButton onClick={addItem} disabled={!canAddFilter} style={{ width: "100%" }}>
              + {t("filter_add")}
            </DialogButton>
          </Focusable>
        </div>
      </div>
    </div>
  );
}
