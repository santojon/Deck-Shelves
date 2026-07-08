import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getCurrentSettings } from "../settingsStore";
import { getAllSteamDocuments } from "../runtime/steamHost";

interface PerShelf { id: string; title: string; nodes: number }
interface Stats { fps: number; frameMs: number; shelves: number; nodes: number; focusables: number; perShelf: PerShelf[] }

function cornerStyle(corner: string): React.CSSProperties {
  const v: React.CSSProperties = { position: "fixed", zIndex: 99999 };
  if (corner === "tl") { v.top = 8; v.left = 8; }
  else if (corner === "tr") { v.top = 8; v.right = 8; }
  else if (corner === "bl") { v.bottom = 8; v.left = 8; }
  else { v.bottom = 8; v.right = 8; }
  return v;
}

function panelStyle(corner: string, vertical: boolean, transparent: boolean): React.CSSProperties {
  return {
    ...cornerStyle(corner),
    pointerEvents: "none",
    background: transparent ? "rgba(12,14,18,0.6)" : "rgba(10,12,16,0.97)",
    color: "#dfe6ee",
    font: "11px/1.45 monospace",
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid rgba(255,255,255,0.12)",
    display: "flex",
    flexDirection: vertical ? "column" : "row",
    gap: vertical ? 2 : 16,
    alignItems: vertical ? "flex-start" : "center",
    flexWrap: "wrap",
    maxWidth: vertical ? 260 : "94vw",
    maxHeight: "46vh",
    overflow: "hidden",
  };
}

/* Outline targets: shelves + every DS descendant + the search / Side Nav /
   friend / badge roots. Light: toggle each element's own `outline` (no boxes,
   no per-element getBoundingClientRect reflow), swept across every Steam doc so
   the Side Nav + search overlays (separate docs) get outlined too. Follows the
   element's border-radius (may look rounded) — accepted; keeps badges intact. */
const OUTLINE_SEL = '.ds-shelf, .ds-shelf [class*="ds-"], [class*="ds-search"], [class*="ds-sidenav"], [class*="ds-friend"], [class*="ds-card-badge"], [class*="ds-new-badge"]';
const OUTLINE_CAP = 800;
const OUTLINE_MARK = "data-ds-outline";

/** Render-weight colour ramp by descendant count (cheaper → heavier):
    light blue < green < orange < red. */
function weightColor(n: number): string {
  if (n < 8) return "#5aa9ff";
  if (n < 30) return "#3ddc84";
  if (n < 80) return "#ffa23a";
  return "#ff5a5a";
}

function clearOutlines(): void {
  try {
    for (const doc of getAllSteamDocuments()) {
      try {
        for (const el of Array.from(doc.querySelectorAll<HTMLElement>(`[${OUTLINE_MARK}]`))) {
          el.style.outline = "";
          el.removeAttribute(OUTLINE_MARK);
        }
      } catch { /* gone */ }
    }
  } catch { /* best effort */ }
}

/** Toggle each matched element's own 1px `outline`, weight-coloured, across every
    Steam doc. Cheap: no boxes, no getBoundingClientRect reflow — just an inline
    style + marker (so clearOutlines can strip them). */
function drawOutlines(): void {
  for (const doc of getAllSteamDocuments()) {
    try {
      for (const el of Array.from(doc.querySelectorAll<HTMLElement>(OUTLINE_SEL)).slice(0, OUTLINE_CAP)) {
        el.style.outline = `1px solid ${weightColor(el.querySelectorAll("*").length)}`;
        el.setAttribute(OUTLINE_MARK, "1");
      }
    } catch { /* best effort */ }
  }
}

function applyOutlines(on: boolean): void {
  if (on) drawOutlines(); else clearOutlines();
}

function readFocusChain(doc: Document): string[] {
  const out: string[] = [];
  try {
    let el: Element | null = doc.querySelector(".gpfocus") ?? doc.querySelector(".gpfocuswithin");
    let depth = 0;
    while (el && el !== doc.documentElement && depth < 12) {
      const cls = typeof el.className === "string" && el.className
        ? "." + el.className.trim().split(/\s+/).slice(0, 1).join(".") : "";
      out.push(`${el.tagName.toLowerCase()}${cls}`);
      el = el.parentElement; depth++;
    }
  } catch { /* best effort */ }
  return out;
}

function buildStats(mountEl: HTMLElement | null, titleOf: (id: string) => string, fps: number, frameMs: number): Stats {
  const shelfEls = mountEl ? Array.from(mountEl.querySelectorAll<HTMLElement>(".ds-shelf[data-shelfid]")) : [];
  return {
    fps, frameMs,
    shelves: shelfEls.length,
    nodes: mountEl ? mountEl.querySelectorAll("*").length : 0,
    focusables: mountEl ? mountEl.querySelectorAll("[tabindex]").length : 0,
    perShelf: shelfEls.map((el) => ({ id: el.getAttribute("data-shelfid") ?? "?", title: titleOf(el.getAttribute("data-shelfid") ?? ""), nodes: el.querySelectorAll("*").length })),
  };
}

function PerShelfBlock({ rows, vertical }: { rows: PerShelf[]; vertical: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: vertical ? "column" : "row", flexWrap: "wrap", gap: vertical ? 0 : 12, opacity: 0.85 }}>
      {rows.map((s) => (
        <div key={s.id} style={vertical ? { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 240 } : { whiteSpace: "nowrap" }}>{s.title}: {s.nodes}</div>
      ))}
    </div>
  );
}

function FocusBlock({ chain, vertical }: { chain: string[]; vertical: boolean }) {
  return (
    <div style={vertical ? { opacity: 0.85, maxWidth: 240, overflow: "hidden" } : { opacity: 0.85 }}>
      <span style={{ opacity: 0.6 }}>focus </span>
      {chain.length ? chain.map((f, i) => <span key={i} style={{ marginRight: 4 }}>{i === 0 ? "▸" : "›"}{f}</span>) : <span>—</span>}
    </div>
  );
}

function DebugPanel({ stats, focusChain }: { stats: Stats; focusChain: string[] }) {
  const o = (getCurrentSettings() as any) ?? {};
  const corner = ["tl", "tr", "bl", "br"].includes(o.debugOverlayCorner) ? o.debugOverlayCorner : "br";
  const vertical = o.debugOverlayVertical !== false;
  return (
    <div style={panelStyle(corner, vertical, o.debugOverlayTransparent === true)}>
      <div style={{ fontWeight: 700, opacity: 0.7 }}>DS·debug</div>
      {o.debugOverlayFps !== false ? <div>{stats.fps} fps · {stats.frameMs} ms</div> : null}
      {o.debugOverlayStats !== false ? <div>shelves {stats.shelves} · nodes {stats.nodes} · focus {stats.focusables}</div> : null}
      {o.debugOverlayPerShelf !== false && stats.perShelf.length > 0 ? <PerShelfBlock rows={stats.perShelf} vertical={vertical} /> : null}
      {o.debugOverlayFocus === true ? <FocusBlock chain={focusChain} vertical={vertical} /> : null}
    </div>
  );
}

/** Dev overlay — read-only shelf/perf/render readout on the home. rAF sampler +
    DOM counts scoped to the DS mount; live-configurable (corner, orientation,
    transparency, content, weight-coloured render outlines, reactive focus).
    Mounted only when enabled; rAF + outlines cleaned up on unmount;
    `pointerEvents:none` keeps it inert to input. */
export function DebugOverlay({ mountEl, shelves }: { mountEl: HTMLElement | null; shelves: any[] }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [focusChain, setFocusChain] = useState<string[]>([]);
  const rafRef = useRef(0);
  const shelvesRef = useRef(shelves);
  shelvesRef.current = shelves;

  useEffect(() => {
    let frames = 0;
    let acc = 0;
    let last = performance.now();
    let lastFocusKey = "";
    const titleOf = (id: string) => shelvesRef.current.find((s) => s.id === id)?.title ?? id;
    const tick = (now: number) => {
      acc += now - last; last = now; frames++;
      const doc = mountEl?.ownerDocument ?? null;
      const opts = (getCurrentSettings() as any) ?? {};
      // Reactive focus chain: re-read every frame, re-render only when it changes.
      if (doc && opts.debugOverlayFocus === true) {
        const fc = readFocusChain(doc);
        const key = fc.join(">");
        if (key !== lastFocusKey) { lastFocusKey = key; setFocusChain(fc); }
      } else if (lastFocusKey) { lastFocusKey = ""; setFocusChain([]); }
      if (acc >= 500) {
        applyOutlines(opts.debugOverlayOutlines === true);
        setStats(buildStats(mountEl, titleOf, Math.round((frames * 1000) / acc), Math.round((acc / frames) * 10) / 10));
        frames = 0; acc = 0;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(rafRef.current); applyOutlines(false); };
  }, [mountEl]);

  if (!stats) return null;
  const targetBody = mountEl?.ownerDocument?.body ?? (typeof document !== "undefined" ? document.body : null);
  if (!targetBody) return null;
  return createPortal(<DebugPanel stats={stats} focusChain={focusChain} />, targetBody);
}
