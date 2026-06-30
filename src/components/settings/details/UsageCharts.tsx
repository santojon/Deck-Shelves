import React from "react";
import type { UsageDailyPoint } from "../../../domain/usageStats";

/* Hand-rolled, dependency-free SVG/DOM usage charts. Time-series charts use a
   fixed viewBox + `width:100%` (so they're responsive) with
   `vector-effect="non-scaling-stroke"` so line widths stay crisp despite the
   non-uniform scaling. Colours are shared so legends match. */

export const SERIES_COLORS = { launches: "#1a9fff", views: "#43c06d", features: "#ffa23a" } as const;
export type SeriesKey = keyof typeof SERIES_COLORS;
const SERIES_ORDER: SeriesKey[] = ["launches", "views", "features"];

export function ChartLegend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6, fontSize: 11, opacity: 0.8 }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: it.color, flexShrink: 0 }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* Legend for the pie/donut charts — each row carries its colour, label and a
   single figure (`mode='pct'` → share-of-total, else the raw count) so the
   slice sizes are readable as numbers (a pie alone gives no sense of
   magnitude). The figure mode follows the same toggle as the bar charts. */
export function DonutLegend({ data, mode = "raw" }: { data: Array<{ label: string; value: number; color: string }>; mode?: "raw" | "pct" }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, minWidth: 0 }}>
      {data.map((d) => (
        <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: d.color, flexShrink: 0 }} />
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.85 }}>{d.label}</span>
          <span style={{ fontWeight: 700, minWidth: 30, textAlign: "right" }}>{mode === "pct" ? `${Math.round((d.value / total) * 100)}%` : d.value}</span>
        </div>
      ))}
    </div>
  );
}

const V = { W: 320, H: 110, pad: 6 };

/* Comparative multi-series line: launches / shelf-views / feature-use overlaid
   on one time axis. */
export function MultiLineChart({ points, activeKeys }: { points: UsageDailyPoint[]; activeKeys: SeriesKey[] }) {
  const { W, H, pad } = V;
  const iw = W - pad * 2, ih = H - pad * 2;
  const maxY = Math.max(1, ...points.flatMap((p) => activeKeys.map((k) => p[k])));
  const n = points.length;
  const xAt = (i: number) => pad + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const yAt = (v: number) => pad + ih - (v / maxY) * ih;
  const path = (k: SeriesKey) => points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(p[k]).toFixed(1)}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" style={{ display: "block", height: H }}>
      <line x1={pad} y1={pad + ih} x2={pad + iw} y2={pad + ih} stroke="rgba(255,255,255,0.12)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {SERIES_ORDER.filter((k) => activeKeys.includes(k)).map((k) => (
        <path key={k} d={path(k)} fill="none" stroke={SERIES_COLORS[k]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

/* Day-axis labels (DD) under a time-series chart (DOM, evenly spaced). Kept out
   of the SVG so the labels stay crisp regardless of chart scaling. */
export function DayAxis({ points }: { points: UsageDailyPoint[] }) {
  return (
    <div style={{ display: "flex", marginTop: 2 }}>
      {points.map((p) => (
        <span key={p.date} style={{ flex: 1, textAlign: "center", fontSize: 8, opacity: 0.45 }}>{p.date.slice(8)}</span>
      ))}
    </div>
  );
}

/* 3-point moving average — turns a jagged daily series into a readable trend
   line (endpoints clamp to themselves so the curve doesn't shrink). */
function smooth(values: number[]): number[] {
  return values.map((_, i) => {
    const a = values[i - 1] ?? values[i];
    const c = values[i + 1] ?? values[i];
    return (a + values[i] + c) / 3;
  });
}

/* Combo: total daily activity as faint bars (with value labels) + the three
   metric *trend* lines on top (smoothed, with their latest value labelled).
   Keeps the per-metric detail of the line chart while adding the bar/value
   context the single-metric view lost. Uniform scaling so text stays
   undistorted. */
export function ComboBarsTrend({ points }: { points: UsageDailyPoint[] }) {
  const W = 320, H = 130, top = 12, bot = H - 6;
  const ih = bot - top;
  const keys = SERIES_ORDER;
  const totals = points.map((p) => p.launches + p.views + p.features);
  const max = Math.max(1, ...totals);
  const n = points.length;
  const slot = W / Math.max(1, n);
  const bw = slot * 0.58;
  const yAt = (v: number) => bot - (v / max) * ih;
  const xAt = (i: number) => i * slot + slot / 2;
  const trend: Record<SeriesKey, number[]> = {
    launches: smooth(points.map((p) => p.launches)),
    views: smooth(points.map((p) => p.views)),
    features: smooth(points.map((p) => p.features)),
  };
  const linePath = (k: SeriesKey) => trend[k].map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" style={{ display: "block", width: "100%", height: "auto" }}>
      {totals.map((v, i) => {
        const by = yAt(v);
        return (
          <g key={i}>
            <rect x={i * slot + (slot - bw) / 2} y={by} width={bw} height={Math.max(0.6, bot - by)} rx={1} fill="rgba(255,255,255,0.10)" />
            {v > 0 ? <text x={xAt(i)} y={by - 2} fontSize={6} fill="rgba(255,255,255,0.5)" textAnchor="middle">{v}</text> : null}
          </g>
        );
      })}
      {keys.map((k) => <path key={k} d={linePath(k)} fill="none" stroke={SERIES_COLORS[k]} strokeWidth={1.6} strokeLinejoin="round" />)}
      {keys.map((k) => {
        const last = points[n - 1]?.[k] ?? 0;
        return last > 0 ? <text key={"v" + k} x={W - 1} y={yAt(trend[k][n - 1] ?? 0) - 1} fontSize={6.5} fontWeight={700} fill={SERIES_COLORS[k]} textAnchor="end">{last}</text> : null;
      })}
    </svg>
  );
}

/* Vertical bars over time (single metric per day). */
export function DailyBars({ values, color }: { values: number[]; color: string }) {
  const { W, H } = V;
  const max = Math.max(1, ...values);
  const n = values.length;
  const slot = W / Math.max(1, n);
  const bw = slot * 0.64;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" style={{ display: "block", height: H }}>
      {values.map((v, i) => {
        const bh = Math.max(0.8, (v / max) * (H - 4));
        return <rect key={i} x={i * slot + (slot - bw) / 2} y={H - bh} width={bw} height={bh} rx={1} fill={color} fillOpacity={v > 0 ? 0.85 : 0.16} />;
      })}
    </svg>
  );
}

/* Stacked bars over time — a composition-style comparison of the same series
   the line chart overlays (different lens: per-day totals + share). */
export function StackedBars({ points, keys }: { points: UsageDailyPoint[]; keys: SeriesKey[] }) {
  const W = 320, H = 120;
  const totals = points.map((p) => keys.reduce((a, k) => a + p[k], 0));
  const max = Math.max(1, ...totals);
  const n = points.length;
  const slot = W / Math.max(1, n);
  const bw = slot * 0.64;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" style={{ display: "block", width: "100%", height: "auto" }}>
      {points.map((p, i) => {
        let y = H;
        return (
          <g key={i}>
            {SERIES_ORDER.filter((k) => keys.includes(k)).map((k) => {
              const seg = (p[k] / max) * (H - 2);
              if (seg <= 0) return null;
              y -= seg;
              const yTop = y;
              return (
                <g key={k}>
                  <rect x={i * slot + (slot - bw) / 2} y={yTop} width={bw} height={seg} fill={SERIES_COLORS[k]} fillOpacity={0.85} />
                  {seg >= 8 ? <text x={i * slot + slot / 2} y={yTop + seg / 2 + 2} fontSize={6} fill="rgba(255,255,255,0.95)" textAnchor="middle">{p[k]}</text> : null}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

/* Filled cumulative area (running total over time), with the value at each
   step marked above its point. Uniform scaling (no `preserveAspectRatio`
   stretch) so the value text stays undistorted. */
export function AreaTrend({ values, color }: { values: number[]; color: string }) {
  const W = 320, H = 120, pad = 6, topPad = 12;
  const iw = W - pad * 2, ih = H - pad - topPad;
  const max = Math.max(1, ...values);
  const n = values.length;
  const xAt = (i: number) => pad + (n <= 1 ? iw : (i / (n - 1)) * iw);
  const yAt = (v: number) => topPad + ih - (v / max) * ih;
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ");
  const area = `${line} L${xAt(n - 1).toFixed(1)},${(topPad + ih).toFixed(1)} L${xAt(0).toFixed(1)},${(topPad + ih).toFixed(1)} Z`;
  // Label every step; on the cumulative (monotone) curve they spread upward so
  // they rarely collide. The last point is bold (the running total).
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" style={{ display: "block", width: "100%", height: "auto" }}>
      <path d={area} fill={color} fillOpacity={0.22} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {values.map((v, i) => (
        <g key={i}>
          <circle cx={xAt(i)} cy={yAt(v)} r={1.4} fill={color} />
          {v > 0 ? <text x={xAt(i)} y={yAt(v) - 3} fontSize={i === n - 1 ? 7.5 : 6} fontWeight={i === n - 1 ? 700 : 400} fill={i === n - 1 ? color : "rgba(255,255,255,0.6)"} textAnchor="middle">{v}</text> : null}
        </g>
      ))}
    </svg>
  );
}

/* Top-N horizontal bars (shelves, features, …) — DOM-based so labels stay
   crisp and ellipsize cleanly. `mode='pct'` relabels the trailing value as a
   share of the total (bars still scale to the largest row for readability). */
export function TopBarChart({ rows, color, mode = "raw" }: { rows: Array<[string, number]>; color: string; mode?: "raw" | "pct" }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  const total = rows.reduce((a, r) => a + r[1], 0) || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
      {rows.map(([label, v]) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
          <span style={{ width: 96, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.85 }}>{label}</span>
          <div style={{ flex: 1, height: 12, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${(v / max) * 100}%`, height: "100%", background: color, opacity: 0.85, borderRadius: 2 }} />
          </div>
          <span style={{ width: 34, textAlign: "right", flexShrink: 0, opacity: 0.6 }}>{mode === "pct" ? `${Math.round((v / total) * 100)}%` : v}</span>
        </div>
      ))}
    </div>
  );
}

/* KPI card body: a big current-period number, a smaller reference number for
   the previous period, and an up/down/flat arrow. Only the arrow carries
   colour (green up / red down) — the numbers follow the theme text colour.
   Presentational only — the caller wraps it in a focusable block. */
export function TrendKpi({ value, refValue }: { value: number; refValue: number }) {
  const dir = value > refValue ? 1 : value < refValue ? -1 : 0;
  const arrow = dir > 0 ? "▲" : dir < 0 ? "▼" : "—";
  const arrowColor = dir > 0 ? "#43c06d" : dir < 0 ? "#ef5777" : "rgba(255,255,255,0.4)";
  const pct = refValue > 0 ? Math.round(((value - refValue) / refValue) * 100) : null;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: "var(--ds-text, #fff)" }}>{value}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 700, color: arrowColor }}>
        {arrow}{pct != null ? `${Math.abs(pct)}%` : ""}
      </span>
      <span style={{ fontSize: 11, opacity: 0.45, marginLeft: "auto" }}>{refValue}</span>
    </div>
  );
}

/* Donut for categorical splits (card types, …). Arc paths computed by hand;
   each slice is capped just under a full turn so a single 100% slice still
   renders as a ring instead of degenerating to nothing. */
export function DonutChart({ data }: { data: Array<{ label: string; value: number; color: string }> }) {
  const S = 130, r = S / 2, ir = r * 0.56;
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  let angle = -Math.PI / 2;
  const pt = (rad: number, ang: number) => [r + rad * Math.cos(ang), r + rad * Math.sin(ang)] as const;
  const arcs = data.filter((d) => d.value > 0).map((d) => {
    const sweep = Math.min(d.value / total, 0.9999) * 2 * Math.PI;
    const a0 = angle, a1 = angle + sweep;
    angle = a1;
    const large = sweep > Math.PI ? 1 : 0;
    const [ox0, oy0] = pt(r, a0), [ox1, oy1] = pt(r, a1);
    const [ix0, iy0] = pt(ir, a0), [ix1, iy1] = pt(ir, a1);
    return { color: d.color, d: `M${ox0.toFixed(2)},${oy0.toFixed(2)} A${r},${r} 0 ${large} 1 ${ox1.toFixed(2)},${oy1.toFixed(2)} L${ix1.toFixed(2)},${iy1.toFixed(2)} A${ir},${ir} 0 ${large} 0 ${ix0.toFixed(2)},${iy0.toFixed(2)} Z` };
  });
  return (
    <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} role="img" style={{ display: "block" }}>
      {arcs.map((a, i) => <path key={i} d={a.d} fill={a.color} stroke="rgba(0,0,0,0.25)" strokeWidth={0.5} />)}
    </svg>
  );
}
