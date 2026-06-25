import React, { useMemo } from "react";
import { Focusable, ToggleField } from "../../../runtime/host/decky";
import type { useSettingsController } from "../../../features/settings/controller";
import {
  getExternalSources,
  getExternalSmartSources,
  getExternalFilterTypes,
  getExternalSortOptions,
  getExternalImportTypes,
  getExternalSearchProviders,
  getExternalSideMenuProviders,
  getExternalContextProviders,
  getExternalWidgetProviders,
  getExternalShelfRenderers,
  getExternalMetadataProviders,
  getExternalStatisticsProviders,
  getExternalRecommendationProviders,
  isInternalSearchProvider,
  isInternalShelfSource,
  isInternalSmartSource,
  isInternalFilterType,
  isInternalSortOption,
} from "../../../core/pluginApi";
import { CollapsibleSection } from "../../ui/CollapsibleSection";

export interface IntegrationsDetailProps {
  controller: ReturnType<typeof useSettingsController>;
  t: (key: string) => string;
}

const BUILTIN_CHIP: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, color: "rgba(180, 240, 180, 0.95)",
  background: "rgba(120, 220, 120, 0.18)", padding: "2px 6px",
  borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.5,
};

function IntegrationRow(
  { entry, enabled, onChange, builtInLabel }:
  { entry: any; enabled: boolean; onChange: (v: boolean) => void; builtInLabel: string },
) {
  return (
    <div style={{ padding: "6px 8px" }}>
      <ToggleField
        label={
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontWeight: 500 }}>{entry.name}</span>
              {entry.builtIn ? <span style={BUILTIN_CHIP}>{builtInLabel}</span> : null}
            </div>
            <div style={{ opacity: 0.55, fontSize: 11 }}>
              {entry.id}{entry.version ? ` · v${entry.version}` : ""}{entry.meta ? ` · ${entry.meta}` : ""}
            </div>
          </div>
        }
        checked={enabled}
        onChange={onChange}
      />
    </div>
  );
}

interface IntegrationEntry {
  id: string;
  name: string;
  group: string;
  builtIn: boolean;
  version?: string | number;
  meta?: string;
}

// Per-group legacy key prefixes — existing translations for smart
// templates / filter types / sort options ship under these across 19
// locales, so falling through avoids duplicate keys.
const LEGACY_PREFIX: Record<string, string> = {
  smart: "smart_template_",
  filters: "filter_type_",
  sorts: "sort_",
};

function descriptorFallbackName(d: any, id: string): string {
  return d?.displayName || d?.label || id;
}

// Single lookup convention (`integration_<id>`) → legacy prefix → the
// descriptor's own displayName (how third-party plugins localise).
function resolveIntegrationName(t: (k: string) => string, d: any, group?: string): string {
  const id = String(d?.id || "");
  const candidates = [`integration_${id}`];
  const legacy = group ? LEGACY_PREFIX[group] : "";
  if (legacy) candidates.push(`${legacy}${id}`);
  for (const key of candidates) {
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }
  return descriptorFallbackName(d, id);
}

export function IntegrationsDetail({ controller, t }: IntegrationsDetailProps) {
  const settings = controller.settings;
  const enabledMap: Record<string, boolean> = (settings as any)?.integrationsEnabled ?? {};
  const sources       = useMemo(() => getExternalSources(),                []);
  const smartSources  = useMemo(() => getExternalSmartSources(),           []);
  const filterTypes   = useMemo(() => getExternalFilterTypes(),            []);
  const sortOptions   = useMemo(() => getExternalSortOptions(),            []);
  const importTypes   = useMemo(() => getExternalImportTypes(),            []);
  const searches      = useMemo(() => getExternalSearchProviders(),        []);
  const sideMenus     = useMemo(() => getExternalSideMenuProviders(),      []);
  const contexts      = useMemo(() => getExternalContextProviders(),       []);
  const widgets       = useMemo(() => getExternalWidgetProviders(),        []);
  const renderers     = useMemo(() => getExternalShelfRenderers(),         []);
  const metadata      = useMemo(() => getExternalMetadataProviders(),      []);
  const statistics    = useMemo(() => getExternalStatisticsProviders(),    []);
  const recommends    = useMemo(() => getExternalRecommendationProviders(), []);

  const targetLabel = (target?: string) => {
    if (target === "smart_shelves") return t("settings_integration_target_smart");
    return t("settings_integration_target_shelves");
  };
  const localizedName = (d: any, group?: string): string => resolveIntegrationName(t, d, group);

  const entries: IntegrationEntry[] = [
    ...sources.map((d: any) => ({
      id: d.id,
      name: localizedName(d, 'sources'),
      group: t("settings_integration_sources"),
      builtIn: isInternalShelfSource(d.id),
      version: d.version,
    })),
    ...smartSources.map((d: any) => ({
      id: d.id,
      name: localizedName(d, 'smart'),
      group: t("settings_integration_smart"),
      builtIn: isInternalSmartSource(d.id),
      meta: d.category,
    })),
    ...filterTypes.map((d: any) => ({
      id: d.id,
      name: localizedName(d, 'filters'),
      group: t("settings_integration_filters"),
      builtIn: isInternalFilterType(d.id),
      meta: d.invertible === false ? undefined : t("settings_integration_invertible"),
    })),
    ...sortOptions.map((d: any) => ({
      id: d.id,
      name: localizedName(d, 'sorts'),
      group: t("settings_integration_sorts"),
      builtIn: isInternalSortOption(d.id),
    })),
    ...importTypes.map((d: any) => ({
      id: d.id,
      name: localizedName(d, 'imports'),
      group: t("settings_integration_imports"),
      builtIn: false,
      meta: targetLabel(d.target),
    })),
    ...searches.map((d: any) => ({
      id: d.id,
      name: localizedName(d, 'search'),
      group: t("settings_integration_search"),
      builtIn: isInternalSearchProvider(d.id),
      meta: typeof d.priority === "number" ? t("settings_integration_priority").replace("{{n}}", String(d.priority)) : undefined,
    })),
    ...sideMenus.map((d: any) => ({
      id: d.id,
      name: localizedName(d, 'side_menus'),
      group: t("settings_integration_side_menus"),
      builtIn: false,
      version: d.version,
    })),
    ...contexts.map((d: any) => ({
      id: d.id,
      name: localizedName(d, 'contexts'),
      group: t("settings_integration_contexts"),
      builtIn: false,
      version: d.version,
    })),
    ...widgets.map((d: any) => ({
      id: d.id,
      name: localizedName(d, 'widgets'),
      group: t("settings_integration_widgets"),
      builtIn: false,
      version: d.version,
    })),
    ...renderers.map((d: any) => ({
      id: d.id,
      name: localizedName(d, 'renderers'),
      group: t("settings_integration_renderers"),
      builtIn: false,
      version: d.version,
    })),
    ...metadata.map((d: any) => ({
      id: d.id,
      name: localizedName(d, 'metadata'),
      group: t("settings_integration_metadata"),
      builtIn: false,
      version: d.version,
    })),
    ...statistics.map((d: any) => ({
      id: d.id,
      name: localizedName(d, 'statistics'),
      group: t("settings_integration_statistics"),
      builtIn: false,
      version: d.version,
      meta: d.category,
    })),
    ...recommends.map((d: any) => ({
      id: d.id,
      name: localizedName(d, 'recommendations'),
      group: t("settings_integration_recommendations"),
      builtIn: false,
      version: d.version,
      meta: d.category,
    })),
  ];

  if (entries.length === 0) {
    return <div style={{ opacity: 0.55, padding: 12, fontStyle: "italic" }}>{t("settings_empty_integrations")}</div>;
  }

  // Group by section, preserving in-section insertion order.
  const grouped = new Map<string, IntegrationEntry[]>();
  for (const e of entries) {
    if (!grouped.has(e.group)) grouped.set(e.group, []);
    grouped.get(e.group)!.push(e);
  }

  const handleToggle = (id: string) => (value: boolean) => {
    (controller.actions as any).setIntegrationEnabled?.(id, value);
  };

  const builtInLabel = t("settings_integration_builtin");
  return (
    <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column" }}>
      {Array.from(grouped.entries()).map(([group, items], i) => (
        <CollapsibleSection key={group} id={`integ-${group}`} title={group} count={items.length} initialOpen={i === 0}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {items.map((entry) => (
              <IntegrationRow
                key={entry.id}
                entry={entry}
                enabled={enabledMap[entry.id] !== false}
                onChange={handleToggle(entry.id)}
                builtInLabel={builtInLabel}
              />
            ))}
          </div>
        </CollapsibleSection>
      ))}
    </Focusable>
  );
}
