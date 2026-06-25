import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Focusable, ToggleField, DialogButton } from "../../../runtime/host/decky";
import { getUsageSummary, getUsage, clearUsage, flushUsage } from "../../../steam/usageTracking";
import { dailyTotals } from "../../../domain/usageStats";
import { ComboBarsTrend, DayAxis, StackedBars, AreaTrend, TopBarChart, DonutChart, ChartLegend, SERIES_COLORS } from "./UsageCharts";
import type { useSettingsController } from "../../../features/settings/controller";
import { getExternalStatisticsProviders, type StatisticsEntry } from "../../../core/pluginApi";
import { SettingsSection } from "../../ui/SettingsSection";
import { CollapsibleSection } from "../../ui/CollapsibleSection";
import { deriveSuggestions, deriveRemovalSuggestions, type StatSuggestion } from "../../../domain/statistics";
import { confirmAction } from "../../qam/modals/ConfirmActionModal";
import { SHELF_TEMPLATES, coveredTemplateIds } from "../../../domain/templates";
import { SHELF_TPL_ICON, SMART_TPL_ICON } from "../../qam/modals/templateIcons";
import { PlusCircleIcon, StackIcon, CheckIcon, RefreshIcon, SparkleIcon, TrashIcon } from "../../icons";
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

const SUGGESTION_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  first_shelf: PlusCircleIcon, backlog: StackIcon, deck_verified: CheckIcon, updates: RefreshIcon,
};

const SUGGESTION_STYLE = `
.ds-stat-sg{background:var(--ds-surface,rgba(255,255,255,0.05));border:1px solid var(--ds-border,rgba(255,255,255,0.12));border-radius:10px;padding:14px 10px;flex:1 1 calc(20% - 8px);max-width:calc(20% - 8px);min-width:120px;min-height:128px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:5px;cursor:pointer;box-sizing:border-box;transition:transform .12s,border-color .12s,background .12s}
.ds-stat-sg:hover{border-color:var(--ds-accent,#1a9fff);background:var(--ds-surface-hi,rgba(255,255,255,0.10))}
.ds-stat-sg[aria-disabled="true"]{opacity:.55}
.ds-stat-block{background:var(--ds-surface,rgba(255,255,255,0.05));border:1px solid var(--ds-border,rgba(255,255,255,0.12));border-radius:10px;padding:10px 12px;flex:1 1 0;min-width:140px;box-sizing:border-box;display:flex;flex-direction:column;gap:4px}
.ds-stat-block-title{font-size:11px;opacity:.55;text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px}
.ds-chart-block{background:var(--ds-surface,rgba(255,255,255,0.05));border:1px solid var(--ds-border,rgba(255,255,255,0.12));border-radius:10px;padding:10px 12px;flex:1 1 calc(50% - 10px);min-width:220px;box-sizing:border-box;display:flex;flex-direction:column;gap:4px}
.ds-chart-block-title{font-size:12px;font-weight:600;opacity:.85;margin-bottom:4px}
`;

/* Stats areas reuse the shared CollapsibleSection (the same component
   Integrations uses) so collapse/expand looks identical across screens.
   `actions` maps to its `headerExtra` slot — any top-right control (e.g. the
   icon-only clear-usage button). */
function CollapsibleArea({ title, actions, defaultCollapsed, children }: { title: string; actions?: React.ReactNode; defaultCollapsed?: boolean; children: React.ReactNode }) {
  return (
    <CollapsibleSection id={`stat-${title}`} title={title} count={0} initialOpen={!defaultCollapsed} headerExtra={actions}>
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

function entriesFor(groups: ProviderGroup[], id: string): StatisticsEntry[] {
  return groups.find((g) => g.id === id)?.entries ?? [];
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
    <CollapsibleArea title={providerLabel(t, group)}>
      {cats.map((cat) => (
        <CategorySection key={cat} t={t} cat={cat} entries={group.entries.filter((e) => categoryOf(e) === cat)} />
      ))}
    </CollapsibleArea>
  );
}

// Prefer the shelf/smart template's own line icon (monochrome, follows
// text colour); fall back to a generic glyph only when none is mapped.
function suggestionIcon(sg: StatSuggestion): React.ReactNode {
  if (sg.removeShelfId) return <TrashIcon size={24} />;
  const tplIcon = sg.templateId ? SHELF_TPL_ICON[sg.templateId] : sg.smartMode ? SMART_TPL_ICON[sg.smartMode] : undefined;
  if (tplIcon) return React.cloneElement(tplIcon as React.ReactElement<React.SVGProps<SVGSVGElement>>, { width: 26, height: 26 });
  const Fallback = SUGGESTION_ICON[sg.id] ?? (sg.smartMode ? SparkleIcon : PlusCircleIcon);
  return <Fallback size={26} />;
}

// eslint-disable-next-line complexity
function SuggestionBlock(
  { t, sg, why, applied, onApply }:
  { t: (k: string) => string; sg: StatSuggestion; why: string; applied: boolean; onApply: () => void },
) {
  const tpl = sg.templateId ? SHELF_TEMPLATES.find((x) => x.id === sg.templateId) : undefined;
  const name = tpl ? t(tpl.titleKey) : sg.smartMode ? t(`smart_template_${sg.smartMode}`) : sg.removeShelfId ? String(sg.params.name ?? "") : "";
  const actionKey = sg.removeShelfId ? "settings_statistics_suggestion_remove" : "settings_statistics_suggestion_apply";
  const doneKey = sg.removeShelfId ? "settings_statistics_suggestion_removed" : "settings_statistics_suggestion_added";
  return (
    <Focusable
      className="ds-stat-sg"
      focusWithinClassName="gpfocuswithin"
      aria-disabled={applied ? "true" : "false"}
      onActivate={onApply}
      onOKButton={onApply}
      onOKActionDescription={t(actionKey)}
    >
      {suggestionIcon(sg)}
      <div style={{ fontSize: 12, fontWeight: 700 }}>
        {applied ? t(doneKey) : t(actionKey)}
      </div>
      {name ? <div style={{ fontSize: 12, opacity: 0.9 }}>{name}</div> : null}
      <div style={{ fontSize: 10, opacity: 0.55, lineHeight: 1.2 }}>{why}</div>
    </Focusable>
  );
}

export function StatisticsDetail({ controller, t }: StatisticsDetailProps) {
  const [groups, setGroups] = useState<ProviderGroup[] | null>(null);
  const [applied, setApplied] = useState<Set<string>>(() => new Set());

  // Resolve each registered provider, grouped so every one renders its
  // own area. Same registry the public API exposes; once on mount.
  useEffect(() => {
    let cancelled = false;
    const providers = getExternalStatisticsProviders();
    Promise.all(
      providers.map(async (p) => {
        const entries = await Promise.resolve().then(() => p.resolve()).catch(() => [] as StatisticsEntry[]);
        return { id: p.id, displayName: p.displayName, entries: [...entries] };
      }),
    ).then((g) => { if (!cancelled) setGroups(g.filter((x) => x.entries.length > 0)); });
    return () => { cancelled = true; };
  }, []);

  const suggestions = useMemo<StatSuggestion[]>(() => {
    if (!groups) return [];
    const seed = Math.floor(Date.now() / 86_400_000); // day index → daily rotation
    const smartEnabled = (controller.settings as any)?.smartShelvesEnabled === true;
    const exclude = coveredTemplateIds(
      (controller.settings as any)?.shelves ?? [],
      ((controller.settings as any)?.smartShelves ?? []).map((s: any) => s.mode),
    );
    return deriveSuggestions(
      entriesFor(groups, "deck-shelves.library"),
      entriesFor(groups, "deck-shelves.shelf-stats"),
      { seed, smartEnabled, exclude },
    );
  }, [groups, controller]);

  // Usage-derived "remove this unused shelf" suggestions — opt-in, only once
  // there's enough tracked usage to tell "unused" from "no data yet".
  const removalSuggestions = useMemo<StatSuggestion[]>(() => {
    if (!groups || (controller.settings as any)?.removalSuggestionsEnabled !== true) return [];
    flushUsage();
    const summary = getUsageSummary();
    const shelves = [...((controller.settings as any)?.shelves ?? []), ...((controller.settings as any)?.smartShelves ?? [])]
      .filter((s: any) => s?.id).map((s: any) => ({ id: s.id, title: s.title }));
    return deriveRemovalSuggestions(shelves, summary.shelfViews, { trackedDays: summary.totalDays });
  }, [groups, controller]);

  const applySuggestion = useCallback((sg: StatSuggestion) => {
    if (applied.has(sg.id)) return;
    const done = () => setApplied((prev) => new Set(prev).add(sg.id));
    if (sg.removeShelfId) {
      const shelfId = sg.removeShelfId;
      const name = String(sg.params.name ?? "");
      confirmAction({
        title: t("settings_statistics_remove_confirm_title"),
        body: name ? `${name}\n\n${t("settings_statistics_remove_confirm_body")}` : t("settings_statistics_remove_confirm_body"),
        okText: t("settings_statistics_suggestion_remove"),
        cancelText: t("cancel"),
        onConfirm: () => { void Promise.resolve((controller.actions as any).removeShelf?.(shelfId)).then(done).catch(() => {}); },
      });
      return;
    }
    if (sg.smartMode) {
      void Promise.resolve(controller.actions.addSmartShelf(sg.smartMode as any, t(`smart_template_${sg.smartMode}`))).then(done).catch(() => {});
      return;
    }
    const tpl = sg.templateId ? SHELF_TEMPLATES.find((x) => x.id === sg.templateId) : undefined;
    if (!tpl) return;
    void Promise.resolve(controller.actions.addShelfWith(t(tpl.titleKey), tpl.source)).then(done).catch(() => {});
  }, [applied, controller, t]);

  const whyOf = useCallback((sg: StatSuggestion) => {
    return (controller.t as unknown as (k: string, o?: any) => string)(sg.messageKey, sg.params);
  }, [controller]);

  if (groups && groups.length === 0 && suggestions.length === 0) {
    return <div style={{ fontSize: 12, opacity: 0.6, padding: "8px 4px" }}>{t("settings_statistics_empty")}</div>;
  }

  return (
    <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column" }}>
      <style>{SUGGESTION_STYLE}</style>
      <div style={{ fontSize: 12, opacity: 0.6, padding: "0 4px 8px" }}>{t("settings_statistics_desc")}</div>

      {groups && (
        <CollapsibleArea title={t("settings_statistics_suggestions")}>
          <ToggleField
            label={t("settings_statistics_suggest_on_create")}
            checked={(controller.settings as any)?.templateSuggestionsEnabled === true}
            onChange={(v: boolean) => (controller.actions as any).setTemplateSuggestionsEnabled?.(v)}
          />
          {suggestions.length > 0 && (
            <Focusable flow-children="horizontal" style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              {suggestions.map((sg) => (
                <SuggestionBlock
                  key={sg.id}
                  t={t}
                  sg={sg}
                  why={whyOf(sg)}
                  applied={applied.has(sg.id)}
                  onApply={() => applySuggestion(sg)}
                />
              ))}
            </Focusable>
          )}
          <ToggleField
            label={t("settings_statistics_suggest_removal")}
            checked={(controller.settings as any)?.removalSuggestionsEnabled === true}
            onChange={(v: boolean) => (controller.actions as any).setRemovalSuggestionsEnabled?.(v)}
          />
          {removalSuggestions.length > 0 && (
            <Focusable flow-children="horizontal" style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              {removalSuggestions.map((sg) => (
                <SuggestionBlock
                  key={sg.id}
                  t={t}
                  sg={sg}
                  why={whyOf(sg)}
                  applied={applied.has(sg.id)}
                  onApply={() => applySuggestion(sg)}
                />
              ))}
            </Focusable>
          )}
        </CollapsibleArea>
      )}

      <TrendsSection t={t} controller={controller} />
      <UsageSection t={t} controller={controller} />

      {(groups ?? []).map((g) => <ProviderArea key={g.id} t={t} group={g} />)}
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
const CARD_TYPE_KEY: Record<string, string> = {
  game: "settings_statistics_cardtype_game",
  nonsteam: "settings_statistics_cardtype_nonsteam",
  store: "settings_statistics_cardtype_store",
  wishlist: "settings_statistics_cardtype_wishlist",
};
const FEATURE_KEY: Record<string, string> = {
  search: "settings_statistics_feature_search",
  sidenav: "settings_statistics_feature_sidenav",
  sidecar: "settings_statistics_feature_sidecar",
  refresh: "settings_statistics_feature_refresh",
  see_more: "settings_statistics_feature_see_more",
  profile: "settings_statistics_feature_profile",
};

function ChartBlock({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Focusable className="ds-chart-block" focusWithinClassName="gpfocuswithin" onActivate={() => {}} noFocusRing={false} style={{ outline: "none" }}>
      <div className="ds-chart-block-title">{title}</div>
      {children}
      {subtitle ? <div style={{ fontSize: 10, opacity: 0.5, marginTop: 3 }}>{subtitle}</div> : null}
    </Focusable>
  );
}

function TrendsSection({ t, controller }: { t: (k: string) => string; controller: StatisticsDetailProps["controller"] }) {
  const { series, summary } = useMemo(() => {
    flushUsage();
    return { series: dailyTotals(getUsage(), Date.now(), 14), summary: getUsageSummary() };
  }, []);
  const hasData = summary.totalCardLaunches > 0 || summary.totalShelfViews > 0 || summary.totalFeatureUse > 0;

  const shelfTitle = (id: string): string | null => {
    const all = [...((controller.settings as any)?.shelves ?? []), ...((controller.settings as any)?.smartShelves ?? [])];
    return all.find((s: any) => s?.id === id)?.title ?? null;
  };
  const top = (rec: Record<string, number>, n = 6): Array<[string, number]> =>
    Object.entries(rec).sort((a, b) => b[1] - a[1]).slice(0, n);
  // Drop views for shelves that no longer exist (deleted) so the chart never
  // shows raw ids like "s_xxxx".
  const topShelves = top(summary.shelfViews).map(([id, v]) => [shelfTitle(id), v] as [string | null, number])
    .filter((r): r is [string, number] => r[0] != null);
  const topFeatures = top(summary.featureUse).map(([k, v]) => [FEATURE_KEY[k] ? t(FEATURE_KEY[k]) : k, v] as [string, number]);
  const cardTypes = top(summary.cardLaunches).map(([k, v], i) => ({ label: CARD_TYPE_KEY[k] ? t(CARD_TYPE_KEY[k]) : k, value: v, color: PIE_COLORS[i % PIE_COLORS.length] }));

  let run = 0;
  const cumulative = series.map((p) => (run += p.launches + p.views + p.features));
  const periodLabel = t("settings_statistics_trends_window");
  const lineLegend = [
    { label: t("settings_statistics_usage_launches"), color: SERIES_COLORS.launches },
    { label: t("settings_statistics_trends_views"), color: SERIES_COLORS.views },
    { label: t("settings_statistics_usage_features"), color: SERIES_COLORS.features },
  ];

  return (
    <CollapsibleArea title={t("settings_statistics_trends")}>
      {!hasData ? (
        <div style={{ fontSize: 12, opacity: 0.6 }}>{t("settings_statistics_usage_empty")}</div>
      ) : (
        <Focusable flow-children="horizontal" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <ChartBlock title={t("settings_statistics_chart_activity")} subtitle={periodLabel}>
            <ComboBarsTrend points={series} />
            <DayAxis points={series} />
            <ChartLegend items={lineLegend} />
          </ChartBlock>
          <ChartBlock title={t("settings_statistics_chart_breakdown")} subtitle={periodLabel}>
            <StackedBars points={series} keys={["launches", "views", "features"]} />
            <DayAxis points={series} />
            <ChartLegend items={lineLegend} />
          </ChartBlock>
          <ChartBlock title={t("settings_statistics_chart_cumulative")} subtitle={periodLabel}>
            <AreaTrend values={cumulative} color={SERIES_COLORS.launches} />
            <DayAxis points={series} />
          </ChartBlock>
          {cardTypes.length > 0 && (
            <ChartBlock title={t("settings_statistics_usage_card_types")}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <DonutChart data={cardTypes} />
                <ChartLegend items={cardTypes.map((d) => ({ label: d.label, color: d.color }))} />
              </div>
            </ChartBlock>
          )}
          {topShelves.length > 0 && (
            <ChartBlock title={t("settings_statistics_usage_top_shelves")}>
              <TopBarChart rows={topShelves} color={SERIES_COLORS.views} />
            </ChartBlock>
          )}
          {topFeatures.length > 0 && (
            <ChartBlock title={t("settings_statistics_usage_features")}>
              <TopBarChart rows={topFeatures} color={SERIES_COLORS.features} />
            </ChartBlock>
          )}
        </Focusable>
      )}
    </CollapsibleArea>
  );
}

function UsageSection({ t, controller }: { t: (k: string) => string; controller: StatisticsDetailProps["controller"] }) {
  const [tick, setTick] = useState(0);
  const summary = useMemo(() => { flushUsage(); return getUsageSummary(); }, [tick]);
  const shelfName = useCallback((id: string): string | null => {
    const all = [ ...((controller.settings as any)?.shelves ?? []), ...((controller.settings as any)?.smartShelves ?? []) ];
    return all.find((s: any) => s?.id === id)?.title ?? null;
  }, [controller]);
  const top = (rec: Record<string, number>, n = 5): Array<[string, number]> =>
    Object.entries(rec).sort((a, b) => b[1] - a[1]).slice(0, n);
  const hasData = summary.totalCardLaunches > 0 || summary.totalShelfViews > 0 || summary.totalFeatureUse > 0;
  const clear = () => confirmAction({
    title: t("settings_statistics_usage_clear"),
    body: t("settings_confirm_irreversible"),
    okText: t("settings_statistics_usage_clear"),
    cancelText: t("cancel"),
    onConfirm: () => { clearUsage(); setTick((x) => x + 1); },
  });
  return (
    <CollapsibleArea
      title={t("settings_statistics_usage")}
      actions={
        <DialogButton onClick={clear} onOKButton={clear} disabled={!hasData} style={{ ...BTN_COMPACT_STYLE, minWidth: 0, width: 34, padding: 0, justifyContent: "center" }}>
          <TrashIcon size={12} />
        </DialogButton>
      }
    >
      {!hasData ? (
        <div style={{ fontSize: 12, opacity: 0.6 }}>{t("settings_statistics_usage_empty")}</div>
      ) : (
        <>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
            {`${t("settings_statistics_usage_days")}: ${summary.totalDays} · ${t("settings_statistics_usage_launches")}: ${summary.totalCardLaunches}`}
          </div>
          <Focusable flow-children="horizontal" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <UsageBlock title={t("settings_statistics_usage_top_shelves")} rows={top(summary.shelfViews).map(([id, n]) => [shelfName(id), n] as [string | null, number]).filter((r): r is [string, number] => r[0] != null)} />
            <UsageBlock title={t("settings_statistics_usage_card_types")} rows={top(summary.cardLaunches).map(([k, n]) => [CARD_TYPE_KEY[k] ? t(CARD_TYPE_KEY[k]) : k, n] as [string, number])} />
            <UsageBlock title={t("settings_statistics_usage_features")} rows={top(summary.featureUse).map(([k, n]) => [FEATURE_KEY[k] ? t(FEATURE_KEY[k]) : k, n] as [string, number])} />
          </Focusable>
        </>
      )}
    </CollapsibleArea>
  );
}
