import { useState } from "react";
import { DialogButton, Focusable } from "../../../runtime/host/decky";
import { CollapsibleSection } from "../../ui/CollapsibleSection";
import { getPerfSnapshot, type PerfSnapshot } from "../../../core/perfMetrics";
import { GaugeIcon, RefreshIcon } from "../../icons";
import { BTN_ICON_STYLE } from "../../ui/buttonStyles";

const DASH = "—";
const NOOP = () => { /* leaf — focus only */ };
type Tr = (key: string) => string;

function msText(v: number | null): string {
  return v === null ? DASH : `${v.toFixed(0)} ms`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Focusable onActivate={NOOP} focusWithinClassName="gpfocuswithin"
      style={{ display: "flex", flexDirection: "column", gap: 2, padding: "6px 8px", borderRadius: 6, background: "rgba(255,255,255,0.03)", minWidth: 0 }}>
      <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.55 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, wordBreak: "break-word" }}>{value}</span>
    </Focusable>
  );
}

/** Developer tab → Performance: a read-only snapshot of the Home mount/patch
    layer's churn. Pull-based like DiagnosticsSection — no auto-refresh
    timer, Refresh re-reads the live counters on click. */
export function PerformanceSection({ t }: { t: Tr }) {
  const [snapshot, setSnapshot] = useState<PerfSnapshot>(() => getPerfSnapshot());
  const refresh = () => setSnapshot(getPerfSnapshot());

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
        <Stat label={t("perf_boot_critical")} value={msText(snapshot.bootCriticalMs)} />
        <Stat label={t("perf_mount")} value={msText(snapshot.mountMs)} />
      </Focusable>
      <Focusable flow-children="horizontal" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, marginBottom: 6 }}>
        <Stat label={t("perf_mount_cards")} value={String(snapshot.mountCardsProcessed)} />
        <Stat label={t("perf_mount_fetches")} value={String(snapshot.mountFetches)} />
      </Focusable>
      <Focusable flow-children="horizontal" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, marginBottom: 6 }}>
        <Stat label={t("perf_active_timers")} value={String(snapshot.activeTimers)} />
        <Stat label={t("perf_active_observers")} value={String(snapshot.activeObservers)} />
        <Stat label={t("perf_remount_tries")} value={String(snapshot.remountTries)} />
      </Focusable>
      <Focusable flow-children="horizontal" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, marginBottom: 6 }}>
        <Stat label={t("perf_reconciles_min")} value={String(snapshot.reconcilesPerMin)} />
        <Stat label={t("perf_dom_callbacks_min")} value={String(snapshot.domCallbacksPerMin)} />
        <Stat label={t("perf_renders_min")} value={String(snapshot.rendersPerMin)} />
      </Focusable>
      <Focusable flow-children="horizontal" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
        <Stat label={t("perf_long_tasks")} value={String(snapshot.longTaskCount)} />
        <Stat label={t("perf_long_tasks_ms")} value={`${snapshot.longTaskTotalMs.toFixed(0)} ms`} />
      </Focusable>
    </CollapsibleSection>
  );
}
