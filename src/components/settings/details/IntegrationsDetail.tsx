import { useMemo } from "react";
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
import { SettingsSection } from "../../ui/SettingsSection";

export interface IntegrationsDetailProps {
  controller: ReturnType<typeof useSettingsController>;
  t: (key: string) => string;
}

interface IntegrationEntry {
  id: string;
  name: string;
  group: string;
  builtIn: boolean;
  version?: string | number;
  meta?: string;
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
  // Single lookup convention (`integration_<id>`) with fallback to the
  // established legacy key patterns. The legacy patterns ship existing
  // translations for smart-shelf templates / filter types / sort options
  // across 19 locales — falling through to them avoids duplicate keys.
  // Third-party plugins are localised via their own descriptor
  // `displayName`. Missing localizations land on the descriptor value.
  const localizedName = (d: any, group?: string): string => {
    const id: string = String(d?.id ?? "");
    const candidates: string[] = [`integration_${id}`];
    if (group === "smart") candidates.push(`smart_template_${id}`);
    else if (group === "filters") candidates.push(`filter_type_${id}`);
    else if (group === "sorts") candidates.push(`sort_${id}`);
    for (const key of candidates) {
      const translated = t(key as any);
      if (translated && translated !== key) return translated;
    }
    return d?.displayName ?? d?.label ?? id;
  };

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

  return (
    <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column" }}>
      {Array.from(grouped.entries()).map(([group, items]) => (
        <SettingsSection key={group} title={group}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {items.map((entry) => {
              const enabled = enabledMap[entry.id] !== false;
              return (
                <div key={entry.id} style={{ padding: "4px 0" }}>
                  <ToggleField
                    label={
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontWeight: 500 }}>{entry.name}</span>
                          {entry.builtIn ? (
                            <span style={{
                              fontSize: 9,
                              fontWeight: 700,
                              color: "rgba(180, 240, 180, 0.95)",
                              background: "rgba(120, 220, 120, 0.18)",
                              padding: "2px 6px",
                              borderRadius: 999,
                              textTransform: "uppercase",
                              letterSpacing: 0.5,
                            }}>{t("settings_integration_builtin")}</span>
                          ) : null}
                        </div>
                        <div style={{ opacity: 0.55, fontSize: 11 }}>
                          {entry.id}
                          {entry.version ? ` · v${entry.version}` : ""}
                          {entry.meta ? ` · ${entry.meta}` : ""}
                        </div>
                      </div>
                    }
                    checked={enabled}
                    onChange={handleToggle(entry.id)}
                  />
                </div>
              );
            })}
          </div>
        </SettingsSection>
      ))}
    </Focusable>
  );
}
