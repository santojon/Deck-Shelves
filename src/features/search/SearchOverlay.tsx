import { useCallback, useEffect, useRef, useState } from "react";
import { TextField } from "../../runtime/host/decky";
import { getExternalSearchProviders, type SearchHit } from "../../core/pluginApi";
import { BUILT_IN_SHELF_SEARCH } from "./builtInProvider";
import { isHomeRoute } from "../../components/home/mountUtils";
import { getCurrentSettings, subscribeSettings } from "../../settingsStore";
import { GamepadButton, subscribeHomeButton } from "../../runtime/homeInputBus";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { focusElement } from "../../core/focusRestore";

const MIN_CHARS = 3;
const SEARCH_LIMIT = 30;
const DEBOUNCE_MS = 1200;
const PAUSE_BEFORE_MOVE_MS = 800;
const CHORD_WINDOW_MS = 350;
const MEMORY_TTL_MS = 30_000;

// Session memory: last typed query lives MEMORY_TTL_MS, then resets.
let lastSessionQuery = "";
let lastSessionAt = 0;

function readSessionQuery(): string {
  if (!lastSessionQuery) return "";
  if (Date.now() - lastSessionAt > MEMORY_TTL_MS) {
    lastSessionQuery = "";
    return "";
  }
  return lastSessionQuery;
}

function tryOpenSteamKeyboard(): void {
  const g = globalThis as any;
  const attempts: Array<() => any> = [
    () => g.SteamClient?.Input?.OpenGamepadKeyboard?.(0),
    () => g.SteamClient?.Input?.ShowGamepadKeyboard?.(),
    () => g.opener?.SteamClient?.Input?.OpenGamepadKeyboard?.(0),
    () => g.opener?.SteamClient?.Input?.ShowGamepadKeyboard?.(),
    () => g.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow?.SteamClient?.Input?.OpenGamepadKeyboard?.(0),
  ];
  for (const a of attempts) {
    try { const r = a(); if (r !== undefined) return; } catch {}
  }
}

export function SearchOverlay() {
  try { (globalThis as any).__ds_search_mounted = (((globalThis as any).__ds_search_mounted ?? 0) + 1); } catch {}
  const [enabled, setEnabled] = useState(() => (getCurrentSettings() as any)?.contextSearchEnabled === true);
  useEffect(() => subscribeSettings((s) => setEnabled((s as any)?.contextSearchEnabled === true)), []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounceRef = useRef<number | null>(null);
  const moveTimerRef = useRef<number | null>(null);
  const searchAbort = useRef(0);
  const priorFocusRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    lastSessionQuery = query;
    lastSessionAt = Date.now();
    setOpen(false);
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (moveTimerRef.current != null) {
      window.clearTimeout(moveTimerRef.current);
      moveTimerRef.current = null;
    }
    const prior = priorFocusRef.current;
    priorFocusRef.current = null;
    if (prior && prior.isConnected) {
      try { focusElement(prior); } catch {}
    }
  }, [query]);

  // L1+R1 chord TOGGLES. When OPEN, any single L1, R1, or B closes —
  // chord-only-to-close was unreliable because controller poll latency
  // sometimes pushed the two presses past the 350 ms window.
  const heldRef = useRef<{ l1: number; r1: number }>({ l1: 0, r1: 0 });
  useEffect(() => {
    if (!enabled) return;
    try { (globalThis as any).__ds_search_enabled = enabled; } catch {}
    return subscribeHomeButton((e) => {
      if (open) {
        if (
          e.button === GamepadButton.CANCEL
          || e.button === GamepadButton.BUMPER_LEFT
          || e.button === GamepadButton.BUMPER_RIGHT
        ) { close(); return; }
        return;
      }
      const now = Date.now();
      if (e.button === GamepadButton.BUMPER_LEFT) heldRef.current.l1 = now;
      else if (e.button === GamepadButton.BUMPER_RIGHT) heldRef.current.r1 = now;
      else return;
      const { l1, r1 } = heldRef.current;
      if (l1 && r1 && Math.abs(l1 - r1) <= CHORD_WINDOW_MS) {
        heldRef.current.l1 = 0;
        heldRef.current.r1 = 0;
        if (!isHomeRoute()) return;
        try {
          const doc = getPreferredSteamDocument() ?? document;
          const focused = doc.querySelector<HTMLElement>(".gpfocus[data-appid]");
          if (focused) priorFocusRef.current = focused;
        } catch {}
        setQuery(readSessionQuery());
        setOpen(true);
        window.setTimeout(tryOpenSteamKeyboard, 60);
      }
    });
  }, [enabled, open, close]);

  // Search 5 s after the last keystroke, then pause 5 s before moving.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    if (moveTimerRef.current != null) window.clearTimeout(moveTimerRef.current);
    if (query.trim().length < MIN_CHARS) return;
    const myToken = ++searchAbort.current;
    debounceRef.current = window.setTimeout(async () => {
      const providers = [BUILT_IN_SHELF_SEARCH, ...getExternalSearchProviders()];
      const settled = await Promise.allSettled(
        providers.map((p) => Promise.resolve(p.search(query, SEARCH_LIMIT)).catch(() => [])),
      );
      if (myToken !== searchAbort.current) return;
      const merged: SearchHit[] = [];
      const seen = new Set<string>();
      for (const result of settled) {
        if (result.status !== "fulfilled") continue;
        for (const hit of result.value) {
          if (seen.has(hit.id)) continue;
          seen.add(hit.id);
          merged.push(hit);
        }
      }
      merged.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      const first = merged[0];
      if (!first) return;
      moveTimerRef.current = window.setTimeout(() => {
        moveTimerRef.current = null;
        if (myToken !== searchAbort.current) return;
        try { first.onActivate?.(); } catch {}
        close();
      }, PAUSE_BEFORE_MOVE_MS);
    }, DEBOUNCE_MS);
  }, [query, open, close]);

  if (!open) return null;
  return <SearchPill query={query} onChange={setQuery} />;
}

function SearchPill({ query, onChange }: { query: string; onChange: (q: string) => void }) {
  const onField = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e?.target?.value ?? "");
  };
  // Width grows with the typed string, in ch units so it scales with
  // the (vw-clamped) font-size. Floor keeps a sensible empty width;
  // ceil prevents runaway growth on long queries.
  const chars = Math.max(8, Math.min(40, query.length + 3));
  return (
    <>
      {/* Inline styles for the TextField — DeckQAMStyles is only mounted
          in the QAM Settings tree, never on the home, so anything that
          relies on it (chrome stripping, input width-100%) has to live
          here. Heavy text-shadow makes the white text legible over
          bright backdrops too. */}
      <style>{`
        .ds-search-pill-host { background: transparent !important; border: none !important; padding: 0 !important; margin: 0 !important; width: 100%; }
        .ds-search-pill-host input { background: transparent !important; border: none !important; outline: none !important; padding: 0 !important; margin: 0 !important; width: 100% !important; min-width: 0 !important; color: white !important; font-size: inherit !important; font-weight: 700 !important; text-align: center !important; caret-color: white !important; text-shadow: 0 2px 6px rgba(0,0,0,0.85), 0 0 18px rgba(0,0,0,0.6); }
        .ds-search-pill-host input::placeholder { color: rgba(255,255,255,0.65) !important; }
        .ds-search-pill-host > div, .ds-search-pill-host > div > div { background: transparent !important; border: none !important; padding: 0 !important; margin: 0 !important; width: 100% !important; }
      `}</style>
      <div
        className="ds-search-overlay"
        style={{
          position: "fixed",
          top: "38%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 9_999,
          display: "inline-flex",
          pointerEvents: "auto",
        }}
      >
        <div
          className="ds-search-pill-host"
          style={{
            width: `${chars}ch`,
            maxWidth: "70vw",
            padding: 0,
            background: "transparent",
            border: "none",
            color: "white",
            fontSize: "clamp(20px, 3vw, 30px)",
            fontWeight: 700,
            letterSpacing: 0.3,
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "width 140ms ease",
          }}
        >
          <TextField
            value={query}
            onChange={onField}
            focusOnMount={true}
            bShowClearAction={false}
          />
        </div>
      </div>
    </>
  );
}
