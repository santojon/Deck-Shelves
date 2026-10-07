import { useState } from "react";
import { DialogButton, Focusable } from "../../../runtime/host/decky";
import { CollapsibleSection } from "../../ui/CollapsibleSection";
import { getPerfSnapshot, type PerfSnapshot } from "../../../core/perfMetrics";
import { getLearnedTimeoutsSummary } from "../../../core/adaptiveTimeout";
import { getSmartShelfCacheStats } from "../../../steam/smartShelves";
import { DonutChart, DonutLegend, TopBarChart } from "./UsageCharts";
import { GaugeIcon, RefreshIcon } from "../../icons";
import { BTN_ICON_STYLE } from "../../ui/buttonStyles";

const DASH = "—";
const NOOP = () => { /* leaf — focus only */ };
type Tr = (key: string) => string;

// Mirrors the debug overlay's weightColor ramp (blue/green = good, orange =
// watch, red = investigate). `invert` is for metrics where higher is better
// (e.g. a cache hit rate).
const COLOR_GOOD = "#3ddc84";
const COLOR_WARN = "#ffa23a";
const COLOR_BAD = "#ff5a5a";
function qualityColor(value: number, warn: number, fail: number, invert = false): string {
  const isBad = invert ? value < fail : value >= fail;
  if (isBad) return COLOR_BAD;
  const isWarn = invert ? value < warn : value >= warn;
  return isWarn ? COLOR_WARN : COLOR_GOOD;
}

function msText(v: number | null): string {
  return v === null ? DASH : `${v.toFixed(0)} ms`;
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Focusable onActivate={NOOP} focusWithinClassName="gpfocuswithin"
      style={{ display: "flex", flexDirection: "column", gap: 2, padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.03)", minWidth: 0 }}>
      <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.55 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, wordBreak: "break-word", color }}>{value}</span>
    </Focusable>
  );
}

function ChartBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Focusable onActivate={NOOP} focusWithinClassName="gpfocuswithin"
      style={{ flex: "1 1 160px", minWidth: 150, padding: "8px 10px", borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.55, marginBottom: 4 }}>{title}</div>
      {children}
    </Focusable>
  );
}

function DonutStat({ title, usedLabel, used, freeLabel, free, color }: {
  title: string; usedLabel: string; used: number; freeLabel: string; free: number; color: string;
}) {
  const data = [
    { label: usedLabel, value: used, color },
    { label: freeLabel, value: Math.max(0, free), color: "rgba(255,255,255,0.12)" },
  ];
  return (
    <ChartBlock title={title}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ transform: "scale(0.7)", transformOrigin: "left center", width: 91 }}>
          <DonutChart data={data} />
        </div>
        <DonutLegend data={data} mode="pct" />
      </div>
    </ChartBlock>
  );
}

/** Developer tab → Performance: a read-only snapshot of the Home mount/patch
    layer's churn. Pull-based like DiagnosticsSection — no auto-refresh
    timer, Refresh re-reads the live counters on click. */
export function PerformanceSection({ t }: { t: Tr }) {
  const [snapshot, setSnapshot] = useState<PerfSnapshot>(() => getPerfSnapshot());
  const [learned, setLearned] = useState(() => getLearnedTimeoutsSummary());
  const [cacheStats, setCacheStats] = useState(() => getSmartShelfCacheStats());
  const refresh = () => {
    setSnapshot(getPerfSnapshot());
    setLearned(getLearnedTimeoutsSummary());
    setCacheStats(getSmartShelfCacheStats());
  };

  const cacheTotal = cacheStats.hits + cacheStats.misses;
  const cacheHitPct = cacheTotal > 0 ? (cacheStats.hits / cacheTotal) * 100 : null;
  // Mount reuses perf:bench's own mount_ms_warn/fail budget; the other
  // bands are heuristic (no established budget), kept wide on the green side.
  const activityRows: Array<[string, number, string]> = [
    [t("perf_reconciles_min"), snapshot.reconcilesPerMin, qualityColor(snapshot.reconcilesPerMin, 20, 60)],
    [t("perf_dom_callbacks_min"), snapshot.domCallbacksPerMin, qualityColor(snapshot.domCallbacksPerMin, 20, 60)],
    [t("perf_renders_min"), snapshot.rendersPerMin, qualityColor(snapshot.rendersPerMin, 20, 60)],
  ];
  const liveRows: Array<[string, number, string]> = [
    [t("perf_active_timers"), snapshot.activeTimers, qualityColor(snapshot.activeTimers, 6, 13)],
    [t("perf_active_observers"), snapshot.activeObservers, qualityColor(snapshot.activeObservers, 6, 13)],
    [t("perf_active_subscriptions"), snapshot.activeSubscriptions, qualityColor(snapshot.activeSubscriptions, 6, 13)],
  ];

  return (
    <CollapsibleSection
      id="adv-performance"
      title={t("perf_title")}
      count={0}
      icon={<GaugeIcon size={14} />}
      headerExtra={
        <Focusable flow-children="horizontal" style={{ display: "flex", gap: 6 }}>
          <DialogButton onClick={refresh} onOKButton={refresh} style={BTN_ICON_STYLE} aria-label={t("diag_refresh")}>
            <RefreshIcon size={12} />
          </DialogButton>
        </Focusable>
      }
    >
      <div style={{ fontSize: 12, opacity: 0.6, margin: "2px 0 8px" }}>{t("perf_desc")}</div>
      <Focusable flow-children="horizontal" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, marginBottom: 6 }}>
        <Stat label={t("perf_boot_critical")} value={msText(snapshot.bootCriticalMs)}
          color={snapshot.bootCriticalMs === null ? undefined : qualityColor(snapshot.bootCriticalMs, 100, 500)} />
        <Stat label={t("perf_mount")} value={msText(snapshot.mountMs)}
          color={snapshot.mountMs === null ? undefined : qualityColor(snapshot.mountMs, 3000, 6000)} />
      </Focusable>
      <Focusable flow-children="horizontal" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, marginBottom: 10 }}>
        <Stat label={t("perf_mount_cards")} value={String(snapshot.mountCardsProcessed)} />
        <Stat label={t("perf_mount_fetches")} value={String(snapshot.mountFetches)} />
        <Stat label={t("perf_remount_tries")} value={String(snapshot.remountTries)}
          color={qualityColor(snapshot.remountTries, 2, 5)} />
      </Focusable>
      <Focusable flow-children="horizontal" style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
        <ChartBlock title={t("perf_active_title")}>
          <TopBarChart rows={liveRows} color="#1a9fff" />
        </ChartBlock>
        <ChartBlock title={t("perf_activity_title")}>
          <TopBarChart rows={activityRows} color="#43c06d" />
        </ChartBlock>
      </Focusable>
      <Focusable flow-children="horizontal" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, marginBottom: 10 }}>
        <Stat label={t("perf_long_tasks")} value={String(snapshot.longTaskCount)}
          color={qualityColor(snapshot.longTaskCount, 1, 4)} />
        <Stat label={t("perf_long_tasks_ms")} value={`${snapshot.longTaskTotalMs.toFixed(0)} ms`}
          color={qualityColor(snapshot.longTaskTotalMs, 200, 800)} />
      </Focusable>
      <Focusable flow-children="horizontal" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {snapshot.usedJSHeapMB !== null && snapshot.totalJSHeapMB !== null && (
          <DonutStat
            title={t("perf_heap_used")}
            usedLabel={t("perf_heap_used_legend")}
            used={snapshot.usedJSHeapMB}
            freeLabel={t("perf_heap_free_legend")}
            free={snapshot.totalJSHeapMB - snapshot.usedJSHeapMB}
            color={qualityColor((snapshot.usedJSHeapMB / snapshot.totalJSHeapMB) * 100, 60, 85)}
          />
        )}
        {cacheTotal >= 10 && cacheHitPct !== null && (
          <DonutStat
            title={t("perf_cache_hit_rate")}
            usedLabel={t("perf_cache_hits_legend")}
            used={cacheStats.hits}
            freeLabel={t("perf_cache_misses_legend")}
            free={cacheStats.misses}
            color={qualityColor(cacheHitPct, 40, 70, true)}
          />
        )}
        {learned.length > 0 && (
          <ChartBlock title={t("perf_learned_timeouts")}>
            <TopBarChart
              rows={learned.map((l) => [l.key, l.p90Ms, qualityColor(l.p90Ms, 1000, 4000)] as [string, number, string])}
              color="#ef5777"
            />
          </ChartBlock>
        )}
      </Focusable>
    </CollapsibleSection>
  );
}
