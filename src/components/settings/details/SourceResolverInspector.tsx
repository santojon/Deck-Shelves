import { useMemo, useState } from "react";
import { DialogButton, Dropdown, Focusable, type SingleDropdownOption } from "../../../runtime/host/decky";
import { CollapsibleSection } from "../../ui/CollapsibleSection";
import { resolveShelfAppIds, getAllAppOverviews, evaluateFilterGroup } from "../../../steam";
import { PlayIcon, FunnelIcon } from "../../icons";
import { BTN_COMPACT_STYLE } from "../../ui/buttonStyles";
import type { useSettingsController } from "../../../features/settings/controller";
import type { FilterItem } from "../../../types";

interface StepCount { type: string; inverted: boolean; count: number | null; }
interface RunResult { total: number; final: number; sort: string; steps: StepCount[]; }

function formatSort(sort: unknown): string {
  return Array.isArray(sort) ? sort.join(" → ") : String(sort ?? "default");
}

/** How many library apps each filter item matches on its own (read-only). */
function countFilterSteps(items: FilterItem[], all: Parameters<typeof evaluateFilterGroup>[1]): StepCount[] {
  return items.map((item) => {
    let count: number | null = null;
    try { count = evaluateFilterGroup({ mode: "and", items: [item] }, all).length; } catch { count = null; }
    return { type: String(item.type), inverted: item.inverted === true, count };
  });
}

async function evaluateShelf(shelf: any): Promise<RunResult> {
  let total = 0;
  const ids = await resolveShelfAppIds(
    shelf.source, shelf.limit ?? 20, shelf.sort, shelf.id, shelf.sortReverse,
    { hiddenAppIds: shelf.hiddenAppIds, onResolveTotal: (n: number) => { total = n; } },
  );
  const items: FilterItem[] = shelf.filterGroup?.items ?? [];
  const all = items.length ? await getAllAppOverviews() : [];
  return { total, final: ids.length, sort: formatSort(shelf.sort), steps: countFilterSteps(items, all) };
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ flex: 1, fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 12, opacity: 0.85, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

/** Advanced → Source resolver: pick a shelf and live-evaluate it. Reuses the
    real resolver + filter engine read-only (resolveShelfAppIds returns ids and
    never persists; per-filter counts run evaluateFilterGroup over the library).
    Observes only — nothing here mutates shelves or Steam state. */
export function SourceResolverInspector({ controller, t }: { controller: ReturnType<typeof useSettingsController>; t: (k: string) => string }) {
  const shelves: any[] = (controller.settings as any)?.shelves ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(shelves[0]?.id ?? null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  const options: SingleDropdownOption[] = useMemo(
    () => shelves.map((s) => ({ data: s.id, label: s.title })),
    [shelves],
  );

  const run = async () => {
    const shelf = shelves.find((s) => s.id === selectedId);
    if (!shelf || running) return;
    setRunning(true);
    setResult(null);
    try {
      setResult(await evaluateShelf(shelf));
    } catch {
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  return (
    <CollapsibleSection id="adv-resolver" title={t("resolver_title")} count={0} icon={<FunnelIcon size={14} />}>
      <div style={{ fontSize: 12, opacity: 0.6, margin: "2px 0 8px" }}>{t("resolver_desc")}</div>
      {shelves.length === 0 ? (
        <div style={{ opacity: 0.55, fontStyle: "italic", padding: 8 }}>{t("resolver_no_shelves")}</div>
      ) : (
        <Focusable flow-children="vertical" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Focusable flow-children="horizontal" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Dropdown rgOptions={options} selectedOption={selectedId} onChange={(o: any) => setSelectedId(o.data)} />
            </div>
            <DialogButton disabled={running} onClick={run} onOKButton={run} style={{ ...BTN_COMPACT_STYLE, minWidth: 0, width: "auto" }}>
              <PlayIcon size={12} /><span>{running ? t("resolver_running") : t("resolver_run")}</span>
            </DialogButton>
          </Focusable>
          {result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <InfoRow label={t("resolver_total")} value={String(result.total)} />
              <InfoRow label={t("resolver_final")} value={String(result.final)} />
              <InfoRow label={t("resolver_sort")} value={result.sort} />
              {result.steps.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 13 }}>{t("resolver_filters")}</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                    {result.steps.map((s, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                        <span style={{ flex: 1, opacity: 0.85 }}>
                          {s.type}
                          {s.inverted ? <span style={{ marginLeft: 6, opacity: 0.6 }}>({t("resolver_inverted")})</span> : null}
                        </span>
                        <span style={{ opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>{s.count == null ? "—" : s.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Focusable>
      )}
    </CollapsibleSection>
  );
}
