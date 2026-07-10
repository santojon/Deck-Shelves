import React, { useEffect, useMemo, useState } from "react";
import { Focusable, DialogButton } from "../../../runtime/host/decky";
import { getUsageSummary, getUsage, clearUsage, flushUsage } from "../../../steam/usageTracking";
import { dailyTotals } from "../../../domain/usageStats";
import { shelfTypeBreakdown, shelfSourceBreakdown, cardTypeComposition as cardTypeCompositionPure, cardComposition as cardCompositionPure } from "../../../domain/shelfStats";
import { ComboBarsTrend, DayAxis, StackedBars, AreaTrend, TopBarChart, DonutChart, ChartLegend, DonutLegend, TrendKpi, SERIES_COLORS } from "./UsageCharts";
import type { useSettingsController } from "../../../features/settings/controller";
import { getExternalStatisticsProviders, type StatisticsEntry } from "../../../core/pluginApi";
import { SettingsSection } from "../../ui/SettingsSection";
import { CollapsibleSection } from "../../ui/CollapsibleSection";
import { confirmAction } from "../../qam/modals/ConfirmActionModal";
import { TrashIcon, StackIcon, GamepadIcon, SlidersIcon, PlayIcon } from "../../icons";
import { BTN_COMPACT_STYLE } from "../../ui/buttonStyles";

export interface StatisticsDetailProps {
  controller: ReturnType<typeof useSettingsController>;
  t: (key: string) => string;
}

interface ProviderGroup { id: string; displayName: string; entries: StatisticsEntry[] }

const CATEGORY_ORDER = [
  "library", "status", "time", "compat",
  "shelves", "shelf_types", "card_types", "over_time", "other",
] as const;

const PROVIDER_KEY: Record<string, string> = {
  "deck-shelves.library": "settings_statistics_provider_library",
  "deck-shelves.shelf-stats": "settings_statistics_provider_shelf",
};

const STATS_STYLE = `
.ds-stat-block{background:var(--ds-surface,rgba(255,255,255,0.05));border:1px solid var(--ds-border,rgba(255,255,255,0.12));border-radius:10px;padding:10px 12px;flex:1 1 0;min-width:140px;box-sizing:border-box;display:flex;flex-direction:column;gap:4px}
.ds-stat-block-title{font-size:11px;opacity:.55;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px}
.ds-chart-block{background:var(--ds-surface,rgba(255,255,255,0.05));border:1px solid var(--ds-border,rgba(255,255,255,0.12));border-radius:10px;padding:10px 12px;flex:1 1 calc(50% - 10px);min-width:200px;box-sizing:border-box;display:flex;flex-direction:column;gap:4px}
.ds-chart-block.span-third{flex-basis:calc(33.333% - 10px)}
.ds-chart-block.span-full{flex-basis:100%}
.ds-chart-block.span-kpi{flex-basis:calc(25% - 10px);min-width:132px}
.ds-chart-block-title{font-size:12px;font-weight:600;opacity:.85;margin-bottom:4px}
`;

/* Stats areas reuse the shared CollapsibleSection (the same component
   Integrations uses) so collapse/expand looks identical across screens.
   `actions` maps to its `headerExtra` slot — any top-right control (e.g. the
   icon-only clear-usage button). */
function CollapsibleArea({ title, icon, actions, defaultCollapsed, children }: { title: string; icon?: React.ReactNode; actions?: React.ReactNode; defaultCollapsed?: boolean; children: React.ReactNode }) {
  return (
    <CollapsibleSection id={`stat-${title}`} title={title} count={0} icon={icon} initialOpen={!defaultCollapsed} headerExtra={actions}>
      {children}
    </CollapsibleSection>
  );
}

function UsageBlock({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  if (rows.length === 0) return null;
  return (
    <Focusable className="ds-stat-block" focusWithinClassName="gpfocuswithin" onActivate={() => {}}>
      <div className="ds-stat-block-title">{title}</div>
      <UsageRows rows={rows} />
    </Focusable>
  );
}

// Built-in stat ids carry a `stat_<id>` translation; external providers
// supply their own (already-localized) label, so fall back to it.
function localizeLabel(t: (k: string) => string, e: StatisticsEntry): string {
  const key = `stat_${e.id}`;
  const v = t(key);
  return v === key ? e.label : v;
}

function formatValue(e: StatisticsEntry): string {
  return e.unit ? `${e.value} ${e.unit}` : String(e.value);
}

function categoryOf(e: StatisticsEntry): string {
  return e.category && (CATEGORY_ORDER as readonly string[]).includes(e.category) ? e.category : "other";
}

function providerLabel(t: (k: string) => string, g: ProviderGroup): string {
  const key = PROVIDER_KEY[g.id];
  if (key) { const v = t(key); if (v !== key) return v; }
  return g.displayName;
}

const CELL_STYLE: React.CSSProperties = {
  flex: "1 1 120px", minWidth: 110, padding: "10px 12px",
  background: "var(--ds-surface, rgba(255,255,255,0.05))",
  border: "1px solid var(--ds-border, rgba(255,255,255,0.1))",
  borderRadius: 8,
};

// Gamepad nav skips passive Focusables — read-only cells need an
// activation handler to become focus stops the page can scroll to.
const NOOP = () => {};

function StatCell({ t, entry }: { t: (k: string) => string; entry: StatisticsEntry }) {
  return (
    <Focusable style={CELL_STYLE} focusWithinClassName="gpfocuswithin" onActivate={NOOP}>
      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{formatValue(entry)}</div>
      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>{localizeLabel(t, entry)}</div>
    </Focusable>
  );
}

function CategorySection({ t, cat, entries }: { t: (k: string) => string; cat: string; entries: StatisticsEntry[] }) {
  return (
    <SettingsSection title={t(`settings_statistics_cat_${cat}`)}>
      <Focusable style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {entries.map((e) => <StatCell key={e.id} t={t} entry={e} />)}
      </Focusable>
    </SettingsSection>
  );
}

function ProviderArea({ t, group }: { t: (k: string) => string; group: ProviderGroup }) {
  const cats = CATEGORY_ORDER.filter((c) => group.entries.some((e) => categoryOf(e) === c));
  return (
    <CollapsibleArea title={providerLabel(t, group)} icon={group.id.includes("library") ? <GamepadIcon size={14} /> : <StackIcon size={14} />}>
      {cats.map((cat) => (
        <CategorySection key={cat} t={t} cat={cat} entries={group.entries.filter((e) => categoryOf(e) === cat)} />
      ))}
    </CollapsibleArea>
  );
}

const LIB_COLORS = ["#1a9fff", "#43c06d", "#ffa23a", "#bd6bff", "#38d7c4", "#8a9098"];

function LibKpi({ title, value, unit }: { title: string; value: number; unit?: string }) {
  return (
    <Focusable className="ds-chart-block span-kpi" focusWithinClassName="gpfocuswithin" onActivate={() => {}} noFocusRing={false} style={{ outline: "none" }}>
      <div className="ds-chart-block-title">{title}</div>
      <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{value}{unit ? <span style={{ fontSize: 12, opacity: 0.6 }}> {unit}</span> : null}</div>
    </Focusable>
  );
}

/* Library trends: a KPI row + composition charts (donuts + bar charts) built
   from the library provider's live counts. Snapshot data — the plugin doesn't
   track library history — presented in the same style as the shelf trends. */
function LibraryTrendsSection({ t, groups }: { t: (k: string) => string; groups: ProviderGroup[] | null }) {
  const lib = useMemo(() => (groups ?? []).find((g) => g.id.includes("library")) ?? null, [groups]);
  const byId = useMemo(() => {
    const m: Record<string, StatisticsEntry> = {};
    for (const e of lib?.entries ?? []) m[e.id] = e;
    return m;
  }, [lib]);

  const num = (id: string) => { const n = byId[id] ? Number(byId[id].value) : 0; return Number.isFinite(n) ? n : 0; };
  const lbl = (id: string) => (byId[id] ? localizeLabel(t, byId[id]) : id);
  const total = num("total_games");
  if (total <= 0) return null;

  const sl = (id: string, color: string) => ({ label: lbl(id), value: num(id), color });
  const source = [sl("steam_games", LIB_COLORS[0]), sl("non_steam_games", LIB_COLORS[2])].filter((s) => s.value > 0);
  const compat = [sl("deck_verified", LIB_COLORS[1]), sl("deck_playable", LIB_COLORS[2]), sl("deck_unsupported", "#e0525b"), sl("deck_unknown", LIB_COLORS[5])].filter((s) => s.value > 0);
  const install: Array<[string, number]> = [[lbl("installed_games"), num("installed_games")], [t("settings_statistics_lib_not_installed"), Math.max(0, total - num("installed_games"))]];
  const activity: Array<[string, number]> = [[lbl("recently_played_7d"), num("recently_played_7d")], [lbl("recently_played_30d"), num("recently_played_30d")], [lbl("never_played_games"), num("never_played_games")]];
  const composition: Array<[string, number]> = [[lbl("favorite_games"), num("favorite_games")], [lbl("hidden_games"), num("hidden_games")], [lbl("updates_pending"), num("updates_pending")]];

  return (
    <CollapsibleArea title={t("settings_statistics_library_trends")} icon={<GamepadIcon size={14} />}>
      <Focusable style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <LibKpi title={lbl("total_games")} value={total} />
        <LibKpi title={lbl("installed_games")} value={num("installed_games")} />
        <LibKpi title={lbl("played_games")} value={num("played_games")} />
        <LibKpi title={lbl("total_playtime")} value={num("total_playtime")} unit="h" />
      </Focusable>
      <Focusable style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
        {source.length > 0 ? <ChartBlock title={t("settings_statistics_lib_source")} span="third"><DonutChart data={source} /><DonutLegend data={source} /></ChartBlock> : null}
        {compat.length > 0 ? <ChartBlock title={t("settings_statistics_lib_compat")} span="third"><DonutChart data={compat} /><DonutLegend data={compat} /></ChartBlock> : null}
        <ChartBlock title={t("settings_statistics_lib_install")} span="third"><TopBarChart rows={install} color={LIB_COLORS[1]} /></ChartBlock>
        <ChartBlock title={t("settings_statistics_lib_activity")} span="third"><TopBarChart rows={activity} color={LIB_COLORS[0]} /></ChartBlock>
        <ChartBlock title={t("settings_statistics_lib_composition")} span="third"><TopBarChart rows={composition} color={LIB_COLORS[3]} /></ChartBlock>
      </Focusable>
    </CollapsibleArea>
  );
}

export function StatisticsDetail({ controller, t }: StatisticsDetailProps) {
  const [groups, setGroups] = useState<ProviderGroup[] | null>(null);

  // Resolve each registered provider, grouped so every one renders its
  // own area. Same registry the public API exposes; once on mount.
  useEffect(() => {
    let cancelled = false;
    // Defer the heavy provider resolution (getAllAppOverviews library DOM walk)
    // off the mount commit so the tab paints immediately instead of freezing on
    // open; the stats render once resolved.
    const timer = setTimeout(() => {
      const providers = getExternalStatisticsProviders();
      Promise.all(
        providers.map(async (p) => {
          const entries = await Promise.resolve().then(() => p.resolve()).catch(() => [] as StatisticsEntry[]);
          return { id: p.id, displayName: p.displayName, entries: [...entries] };
        }),
      ).then((g) => { if (!cancelled) setGroups(g.filter((x) => x.entries.length > 0)); });
    }, 60);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  return (
    <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column" }}>
      <style>{STATS_STYLE}</style>
      <div style={{ fontSize: 12, opacity: 0.6, padding: "0 4px 8px" }}>{t("settings_statistics_desc")}</div>

      <TrendsSection t={t} controller={controller} />
      <LibraryTrendsSection t={t} groups={groups} />
      <UsageSection t={t} controller={controller} />

      {[...(groups ?? [])].sort((a, b) => (a.id.includes("library") ? 1 : 0) - (b.id.includes("library") ? 1 : 0)).map((g) => <ProviderArea key={g.id} t={t} group={g} />)}
    </Focusable>
  );
}

function UsageRows({ rows }: { rows: Array<[string, number]> }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 2 }}>
      {rows.map(([label, n]) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.85 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>{label}</span>
          <span style={{ opacity: 0.7, flexShrink: 0 }}>{n}</span>
        </div>
      ))}
    </div>
  );
}

const PIE_COLORS = ["#1a9fff", "#9c6ade", "#43c06d", "#ffa23a", "#ef5777", "#26c6da"];
// Launch-tracked content card types (mutually exclusive, one per launch).
const CONTENT_CARD_TYPES = ["game", "nonsteam", "store", "wishlist"] as const;
// Fixed colours per composition slice so the legend stays stable as slices
// drop in and out.
const COMPOSITION_COLORS: Record<string, string> = {
  normal: "#1a9fff", featured: "#ffa23a", decorative: "#9c6ade", hidden: "#ef5777",
};
// Raw-vs-percent toggle choice, persisted so it survives re-opening the page.
const PCT_MODE_KEY = "ds-stats-pct-mode";
const SHELFTYPE_KEY: Record<string, string> = {
  normal: "settings_statistics_shelftype_normal",
  smart: "settings_statistics_shelftype_smart",
};
// Source-type labels reuse the edit-modal `source_*` keys.
const SOURCE_KEY: Record<string, string> = {
  collection: "source_collection", tab: "source_tab", filter: "source_filter",
  external: "source_external", wishlist: "source_wishlist", store: "source_store",
  composite: "source_composite", smart: "source_smart",
};
const SOURCE_ORDER = ["collection", "tab", "filter", "wishlist", "store", "composite", "smart", "external"];
const CARD_TYPE_KEY: Record<string, string> = {
  game: "settings_statistics_cardtype_game",
  nonsteam: "settings_statistics_cardtype_nonsteam",
  store: "settings_statistics_cardtype_store",
  wishlist: "settings_statistics_cardtype_wishlist",
  featured: "settings_statistics_cardtype_featured",
  decorative: "settings_statistics_cardtype_decorative",
  hidden: "settings_statistics_cardtype_hidden",
  normal: "settings_statistics_cardtype_normal",
};
const FEATURE_KEY: Record<string, string> = {
  search: "settings_statistics_feature_search",
  sidenav: "settings_statistics_feature_sidenav",
  sidecar: "settings_statistics_feature_sidecar",
  refresh: "settings_statistics_feature_refresh",
  see_more: "settings_statistics_feature_see_more",
  profile: "settings_statistics_feature_profile",
  highlight: "settings_statistics_feature_highlight",
  hide: "settings_statistics_feature_hide",
  shelf_create: "settings_statistics_feature_shelf_create",
  shelf_delete: "settings_statistics_feature_shelf_delete",
  import: "settings_statistics_feature_import",
  export: "settings_statistics_feature_export",
};

/* Resolved card ids for a shelf — read from the per-shelf resolver cache the
   Shelf component already writes to localStorage (`ds-shelf-cache-<id>-…`).
   Excludes hidden cards (the resolver filters them). null when no cache yet. */
function resolvedShelfIds(shelfId: string): number[] | null {
  try {
    const prefix = `ds-shelf-cache-${shelfId}-`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        const { ids } = JSON.parse(localStorage.getItem(k) || "{}");
        if (Array.isArray(ids)) return ids as number[];
      }
    }
  } catch { /* best-effort */ }
  return null;
}

function resolvedShelfCount(shelfId: string): number | null {
  const ids = resolvedShelfIds(shelfId);
  return ids ? ids.length : null;
}

// Bound the pure breakdowns to this device's resolver cache + app overviews.
const isNonSteamApp = (appId: number): boolean =>
  (globalThis as any).appStore?.GetAppOverviewByAppID?.(appId)?.is_non_steam === true;
const cardTypeComposition = (settings: any) => cardTypeCompositionPure(settings, resolvedShelfIds, isNonSteamApp);
const cardComposition = (settings: any) => cardCompositionPure(settings, resolvedShelfCount);

function ChartBlock({ title, subtitle, span, children }: { title: string; subtitle?: string; span?: "half" | "third" | "full"; children: React.ReactNode }) {
  const cls = span === "third" ? "ds-chart-block span-third" : span === "full" ? "ds-chart-block span-full" : "ds-chart-block";
  return (
    <Focusable className={cls} focusWithinClassName="gpfocuswithin" onActivate={() => {}} noFocusRing={false} style={{ outline: "none" }}>
      <div className="ds-chart-block-title">{title}</div>
      {children}
      {subtitle ? <div style={{ fontSize: 10, opacity: 0.5, marginTop: 3 }}>{subtitle}</div> : null}
    </Focusable>
  );
}

// Trend-only block: a big current-period number with the previous period as
// reference and a direction arrow (UsageCharts.TrendKpi). 4-up on a row.
function KpiCard({ title, subtitle, value, refValue }: { title: string; subtitle: string; value: number; refValue: number }) {
  return (
    <Focusable className="ds-chart-block span-kpi" focusWithinClassName="gpfocuswithin" onActivate={() => {}} noFocusRing={false} style={{ outline: "none" }}>
      <div className="ds-chart-block-title">{title}</div>
      <TrendKpi value={value} refValue={refValue} />
      <div style={{ fontSize: 10, opacity: 0.5, marginTop: 3 }}>{subtitle}</div>
    </Focusable>
  );
}

// A donut chart + legend in a ChartBlock, shown only when the data has a
// non-zero total (covers both empty sets and all-zero catalogues).
function DonutBlock({ title, data, mode }: { title: string; data: Array<{ label: string; value: number; color: string }>; mode: "raw" | "pct" }) {
  if (data.reduce((a, d) => a + d.value, 0) <= 0) return null;
  return (
    <ChartBlock title={title} span="third">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <DonutChart data={data} />
        <DonutLegend data={data} mode={mode} />
      </div>
    </ChartBlock>
  );
}

// All the derived series/breakdowns the Trends section renders from — kept out
// of the component body so its complexity stays low.
function deriveBreakdowns(controller: StatisticsDetailProps["controller"], summary: any, t: (k: string) => string) {
  const hasData = summary.totalCardLaunches > 0 || summary.totalShelfViews > 0 || summary.totalFeatureUse > 0;
  // Every shelf (existing only — deleted ones drop out so the chart never shows
  // raw ids), with its view count, zeros included so the full set is visible.
  const allShelves = [...((controller.settings as any)?.shelves ?? []), ...((controller.settings as any)?.smartShelves ?? [])].filter((s: any) => s?.id);
  const topShelves = allShelves.map((s: any) => [String(s.title || s.id), summary.shelfViews[s.id] ?? 0] as [string, number])
    .sort((a, b) => b[1] - a[1]);
  // Show the full catalog (every known feature / content card type), counts
  // included even at zero, so the "other" ones the user hasn't triggered yet
  // still appear rather than dropping out of a top-N.
  const featureKeys = Array.from(new Set([...Object.keys(FEATURE_KEY), ...Object.keys(summary.featureUse)]));
  const topFeatures = featureKeys.map((k) => [FEATURE_KEY[k] ? t(FEATURE_KEY[k]) : k, summary.featureUse[k] ?? 0] as [string, number])
    .sort((a, b) => b[1] - a[1]);
  const cardTypeCounts = cardTypeComposition(controller.settings);
  const cardTypes = CONTENT_CARD_TYPES.map((k, i) => ({ label: t(CARD_TYPE_KEY[k]), value: cardTypeCounts[k] ?? 0, color: PIE_COLORS[i % PIE_COLORS.length] }));
  const composition = cardComposition(controller.settings).map((r) => ({ label: CARD_TYPE_KEY[r.key] ? t(CARD_TYPE_KEY[r.key]) : r.label, value: r.value, color: COMPOSITION_COLORS[r.key] ?? PIE_COLORS[0] }));
  const shelfTypes = Object.entries(shelfTypeBreakdown(controller.settings))
    .map(([k, v], i) => ({ label: SHELFTYPE_KEY[k] ? t(SHELFTYPE_KEY[k]) : k, value: v, color: PIE_COLORS[i % PIE_COLORS.length] }))
    .filter((d) => d.value > 0);
  const sourceCounts = shelfSourceBreakdown(controller.settings);
  const shelfSources = SOURCE_ORDER.filter((k) => (sourceCounts[k] ?? 0) > 0)
    .map((k, i) => ({ label: SOURCE_KEY[k] ? t(SOURCE_KEY[k]) : k, value: sourceCounts[k], color: PIE_COLORS[i % PIE_COLORS.length] }));
  return { hasData, topShelves, topFeatures, cardTypes, composition, shelfTypes, shelfSources };
}

function TrendsSection({ t, controller }: { t: (k: string) => string; controller: StatisticsDetailProps["controller"] }) {
  const [pctMode, setPctMode] = useState(() => { try { return localStorage.getItem(PCT_MODE_KEY) === "1"; } catch { return false; } });
  const togglePct = () => setPctMode((v) => { const n = !v; try { localStorage.setItem(PCT_MODE_KEY, n ? "1" : "0"); } catch {} return n; });
  const { series, summary } = useMemo(() => {
    flushUsage();
    return { series: dailyTotals(getUsage(), Date.now(), 14), summary: getUsageSummary() };
  }, []);
  const { hasData, topShelves, topFeatures, cardTypes, composition, shelfTypes, shelfSources } =
    deriveBreakdowns(controller, summary, t);

  let run = 0;
  const cumulative = series.map((p) => (run += p.launches + p.views + p.features));
  const periodLabel = t("settings_statistics_trends_window");
  const lineLegend = [
    { label: t("settings_statistics_usage_launches"), color: SERIES_COLORS.launches },
    { label: t("settings_statistics_trends_views"), color: SERIES_COLORS.views },
    { label: t("settings_statistics_usage_features"), color: SERIES_COLORS.features },
  ];

  // Recent half vs the half before it → the KPI cards' direction/percentage.
  const half = Math.floor(series.length / 2) || 1;
  const sumOf = (pts: typeof series, k: "launches" | "views" | "features") => pts.reduce((a, p) => a + p[k], 0);
  const totalOf = (pts: typeof series) => pts.reduce((a, p) => a + p.launches + p.views + p.features, 0);
  const recent = series.slice(half), prev = series.slice(0, half);
  const kpiSub = t("settings_statistics_trends_kpi_window");
  const mode = pctMode ? "pct" : "raw";
  const pctToggle = (
    <DialogButton
      onClick={togglePct}
      onOKButton={togglePct}
      style={{ ...BTN_COMPACT_STYLE, minWidth: 0, width: 34, padding: 0, justifyContent: "center", fontWeight: 800 }}
    >
      {pctMode ? "%" : "#"}
    </DialogButton>
  );

  return (
    <CollapsibleArea title={t("settings_statistics_trends")} icon={<SlidersIcon size={14} />} actions={hasData ? pctToggle : undefined}>
      {!hasData ? (
        <div style={{ fontSize: 12, opacity: 0.6 }}>{t("settings_statistics_usage_empty")}</div>
      ) : (
        <Focusable flow-children="horizontal" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <KpiCard title={t("settings_statistics_usage_launches")} subtitle={kpiSub} value={sumOf(recent, "launches")} refValue={sumOf(prev, "launches")} />
          <KpiCard title={t("settings_statistics_trends_views")} subtitle={kpiSub} value={sumOf(recent, "views")} refValue={sumOf(prev, "views")} />
          <KpiCard title={t("settings_statistics_usage_features")} subtitle={kpiSub} value={sumOf(recent, "features")} refValue={sumOf(prev, "features")} />
          <KpiCard title={t("settings_statistics_trends_total")} subtitle={kpiSub} value={totalOf(recent)} refValue={totalOf(prev)} />
          <ChartBlock title={t("settings_statistics_chart_activity")} subtitle={periodLabel} span="half">
            <ComboBarsTrend points={series} />
            <DayAxis points={series} />
            <ChartLegend items={lineLegend} />
          </ChartBlock>
          <ChartBlock title={t("settings_statistics_chart_breakdown")} subtitle={t("settings_statistics_chart_breakdown_sub")} span="half">
            <StackedBars points={series} keys={["launches", "views", "features"]} normalize />
            <DayAxis points={series} />
            <ChartLegend items={lineLegend} />
          </ChartBlock>
          <ChartBlock title={t("settings_statistics_chart_cumulative")} subtitle={periodLabel} span="third">
            <AreaTrend values={cumulative} color={SERIES_COLORS.launches} />
            <DayAxis points={series} />
          </ChartBlock>
          <DonutBlock title={t("settings_statistics_usage_card_types")} data={cardTypes} mode={mode} />
          <DonutBlock title={t("settings_statistics_card_composition")} data={composition} mode={mode} />
          <DonutBlock title={t("settings_statistics_shelf_types")} data={shelfTypes} mode={mode} />
          <DonutBlock title={t("settings_statistics_shelf_sources")} data={shelfSources} mode={mode} />
          {topShelves.length > 0 && (
            <ChartBlock title={t("settings_statistics_usage_top_shelves")} span="half">
              <TopBarChart rows={topShelves} color={SERIES_COLORS.views} mode={mode} />
            </ChartBlock>
          )}
          {topFeatures.length > 0 && (
            <ChartBlock title={t("settings_statistics_usage_features")} span="third">
              <TopBarChart rows={topFeatures} color={SERIES_COLORS.features} mode={mode} />
            </ChartBlock>
          )}
        </Focusable>
      )}
    </CollapsibleArea>
  );
}

// All entries of a count map as [label, value] rows, sorted high→low (no cap —
// the usage section is the full breakdown). Deleted shelves (null label) drop.
function allRows(rec: Record<string, number>, label: (k: string) => string | null): Array<[string, number]> {
  return Object.entries(rec)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => [label(k), n] as [string | null, number])
    .filter((r): r is [string, number] => r[0] != null);
}

function UsageSection({ t, controller }: { t: (k: string) => string; controller: StatisticsDetailProps["controller"] }) {
  const [tick, setTick] = useState(0);
  const summary = useMemo(() => { flushUsage(); return getUsageSummary(); }, [tick]);
  const settings = controller.settings;
  const shelfName = (id: string): string | null => {
    const all = [...((settings as any)?.shelves ?? []), ...((settings as any)?.smartShelves ?? [])];
    return all.find((s: any) => s?.id === id)?.title ?? null;
  };
  const hasUsage = summary.totalCardLaunches > 0 || summary.totalShelfViews > 0 || summary.totalFeatureUse > 0;
  const hasShelves = (((settings as any)?.shelves ?? []).length + ((settings as any)?.smartShelves ?? []).length) > 0;
  const clear = () => confirmAction({
    title: t("settings_statistics_usage_clear"),
    body: t("settings_confirm_irreversible"),
    okText: t("settings_statistics_usage_clear"),
    cancelText: t("cancel"),
    onConfirm: () => { clearUsage(); setTick((x) => x + 1); },
  });

  // Config-derived breakdowns (don't need usage) → label/value rows.
  const sourceCounts = shelfSourceBreakdown(settings);
  const sourceRows = SOURCE_ORDER.filter((k) => (sourceCounts[k] ?? 0) > 0).map((k) => [SOURCE_KEY[k] ? t(SOURCE_KEY[k]) : k, sourceCounts[k]] as [string, number]);
  const typeRows = allRows(shelfTypeBreakdown(settings), (k) => SHELFTYPE_KEY[k] ? t(SHELFTYPE_KEY[k]) : k);
  const compRows = cardComposition(settings).map((r) => [CARD_TYPE_KEY[r.key] ? t(CARD_TYPE_KEY[r.key]) : r.label, r.value] as [string, number]);

  return (
    <CollapsibleArea
      title={t("settings_statistics_usage")}
      icon={<PlayIcon size={14} />}
      actions={
        <DialogButton onClick={clear} onOKButton={clear} disabled={!hasUsage} style={{ ...BTN_COMPACT_STYLE, minWidth: 0, width: 34, padding: 0, justifyContent: "center" }}>
          <TrashIcon size={12} />
        </DialogButton>
      }
    >
      {!hasUsage && !hasShelves ? (
        <div style={{ fontSize: 12, opacity: 0.6 }}>{t("settings_statistics_usage_empty")}</div>
      ) : (
        <>
          {hasUsage && (
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
              {`${t("settings_statistics_usage_days")}: ${summary.totalDays} · ${t("settings_statistics_usage_launches")}: ${summary.totalCardLaunches} · ${t("settings_statistics_trends_views")}: ${summary.totalShelfViews} · ${t("settings_statistics_usage_features")}: ${summary.totalFeatureUse}`}
            </div>
          )}
          <Focusable flow-children="horizontal" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <UsageBlock title={t("settings_statistics_usage_top_shelves")} rows={allRows(summary.shelfViews, shelfName)} />
            <UsageBlock title={t("settings_statistics_usage_card_types")} rows={allRows(summary.cardLaunches, (k) => CARD_TYPE_KEY[k] ? t(CARD_TYPE_KEY[k]) : k)} />
            <UsageBlock title={t("settings_statistics_usage_features")} rows={allRows(summary.featureUse, (k) => FEATURE_KEY[k] ? t(FEATURE_KEY[k]) : k)} />
            <UsageBlock title={t("settings_statistics_shelf_types")} rows={typeRows} />
            <UsageBlock title={t("settings_statistics_shelf_sources")} rows={sourceRows} />
            <UsageBlock title={t("settings_statistics_card_composition")} rows={compRows} />
          </Focusable>
        </>
      )}
    </CollapsibleArea>
  );
}
