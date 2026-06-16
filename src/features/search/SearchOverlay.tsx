import { useCallback, useEffect, useRef, useState } from "react";
import { TextField } from "../../runtime/host/decky";
import { getExternalSearchProviders, type SearchHit } from "../../core/pluginApi";
import { isHomeRoute } from "../../components/home/mountUtils";
import { getCurrentSettings, subscribeSettings } from "../../settingsStore";
import { GamepadButton, subscribeHomeButton } from "../../runtime/homeInputBus";
import { createMatcherState, matchEvent, parseCombo, parseRawCombo, resolveBindings } from "../../runtime/buttonBindings";
import { subscribeControllerInput, Button as RawBtn } from "../../runtime/controllerInput";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { focusElement } from "../../core/focusRestore";

const MIN_CHARS = 3;
const SEARCH_LIMIT = 30;
const DEBOUNCE_MS = 1200;
const PAUSE_BEFORE_MOVE_MS = 800;
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

function dismissSteamKeyboard(): void {
  try {
    const view = (globalThis as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow;
    const Input = view?.SteamClient?.Input ?? view?.opener?.SteamClient?.Input;
    Input?.ModalKeyboardDismissed?.();
    Input?.StandaloneKeyboardDismissed?.();
  } catch {}
}

export function SearchOverlay() {
  try { (globalThis as any).__ds_search_mounted = (((globalThis as any).__ds_search_mounted ?? 0) + 1); } catch {}
  const [enabled, setEnabled] = useState(() => (getCurrentSettings() as any)?.contextSearchEnabled === true);
  // Virtual-keyboard default is ON; opt-out via the new toggle.
  const [kbEnabled, setKbEnabled] = useState(() => (getCurrentSettings() as any)?.contextSearchKeyboardEnabled !== false);
  // Enter-only default is OFF (debounce mode).
  const [onEnter, setOnEnter] = useState(() => (getCurrentSettings() as any)?.contextSearchOnEnter === true);
  useEffect(() => subscribeSettings((s) => {
    setEnabled((s as any)?.contextSearchEnabled === true);
    setKbEnabled((s as any)?.contextSearchKeyboardEnabled !== false);
    setOnEnter((s as any)?.contextSearchOnEnter === true);
  }), []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounceRef = useRef<number | null>(null);
  const moveTimerRef = useRef<number | null>(null);
  const searchAbort = useRef(0);
  const priorFocusRef = useRef<HTMLElement | null>(null);

  const close = useCallback((opts?: { restorePrior?: boolean; clearSession?: boolean }) => {
    const restorePrior = opts?.restorePrior !== false;
    if (opts?.clearSession) {
      lastSessionQuery = "";
      lastSessionAt = 0;
    } else {
      lastSessionQuery = query;
      lastSessionAt = Date.now();
    }
    // Dismiss the on-screen keyboard explicitly BEFORE the unmount —
    // covers the match path, where the post-unmount cleanup runs but
    // Steam's keyboard sometimes sticks around because focus jumps to
    // the hit's card a beat later.
    dismissSteamKeyboard();
    setOpen(false);
    setQuery("");
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
    if (restorePrior && prior) {
      // Same delay as the match path — overlay unmounts, NavTree drops
      // the input node, THEN we land focus on the prior card. Without
      // the delay the input still wins the focus race.
      window.setTimeout(() => {
        try { if (prior.isConnected) focusElement(prior); } catch {}
      }, 180);
    }
  }, [query]);

  // Runner used by both debounce path AND the Enter-only path. Picks
  // the top hit across all providers and navigates to it (or closes
  // silently if nothing matched).
  const runQuery = useCallback(async (q: string) => {
    if (q.trim().length < MIN_CHARS) return;
    const myToken = ++searchAbort.current;
    // The built-in Quick Search provider is registered through the
    // public Plugin API (`internalRegistry.ts`) so it lives in the
    // same `getExternalSearchProviders()` list as third-party
    // providers. Ordering is by `priority` desc — the built-in's
    // priority of 100 keeps it first when ties on hit score appear.
    // Sprint 11 PR3 — drop providers the user explicitly disabled in
    // the Integrations detail panel (`integrationsEnabled[id] === false`).
    const integrationsEnabled = (getCurrentSettings() as any)?.integrationsEnabled ?? {};
    const providers = getExternalSearchProviders().filter((p) => integrationsEnabled[p.id] !== false);
    const settled = await Promise.allSettled(
      providers.map((p) => Promise.resolve(p.search(q, SEARCH_LIMIT)).catch(() => [])),
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
    if (first) {
      close({ restorePrior: false, clearSession: true });
      window.setTimeout(() => { try { first.onActivate?.(); } catch {} }, 180);
    } else {
      close();
    }
  }, [close]);

  // Open trigger driven by the configured navSearch combo. When OPEN,
  // any single CANCEL/L1/R1 closes (the close legend stays fixed so the
  // user always has a graceful out).
  const matcherStateRef = useRef(createMatcherState());
  const rawMatcherStateRef = useRef(createMatcherState());
  const openSearch = useCallback(() => {
    if (!isHomeRoute()) return;
    try {
      const doc = getPreferredSteamDocument() ?? document;
      const focused = doc.querySelector<HTMLElement>(".gpfocus[data-appid]");
      if (focused) priorFocusRef.current = focused;
    } catch {}
    setQuery(readSessionQuery());
    setOpen(true);
    window.setTimeout(tryOpenSteamKeyboard, 60);
  }, []);
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
      const combo = parseCombo(resolveBindings(getCurrentSettings()?.buttonBindings as any, (getCurrentSettings() as any)?.buttonBindingsDisabled).navSearch);
      if (!matchEvent({ button: e.button }, combo, matcherStateRef.current)) return;
      openSearch();
    });
  }, [enabled, open, close, openSearch]);
  // Parallel raw-stream trigger for navSearch combos that include a token
  // the Decky home-button bus doesn't forward (back-grip L4/L5/R4/R5).
  // Skips when the Decky-side combo can already fire so a single press
  // doesn't double-open the pill.
  useEffect(() => {
    if (!enabled || open) return;
    return subscribeControllerInput((e) => {
      if (!e.pressed) return;
      const navSearch = resolveBindings(getCurrentSettings()?.buttonBindings as any, (getCurrentSettings() as any)?.buttonBindingsDisabled).navSearch;
      if (!navSearch) return;
      const tokens = String(navSearch).toUpperCase().split("+");
      const rawOnly = tokens.some((t) => t === "L4" || t === "L5" || t === "R4" || t === "R5");
      if (!rawOnly) return;
      const combo = parseRawCombo(navSearch);
      if (!matchEvent({ button: e.button }, combo, rawMatcherStateRef.current)) return;
      openSearch();
    });
  }, [enabled, open, openSearch]);

  // While the pill is open, listen on the BP-polled controller bus
  // directly — it fires regardless of which element holds gpfocus, so
  // L1, R1 and B close even when the input has the NavTree focus.
  useEffect(() => {
    if (!open) return;
    return subscribeControllerInput((e) => {
      if (!e.pressed) return;
      if (
        e.button === RawBtn.L1
        || e.button === RawBtn.R1
        || e.button === RawBtn.B
      ) close();
    });
  }, [open, close]);

  // Auto-debounce path — only when the user did NOT opt into Enter-only.
  useEffect(() => {
    if (!open) return;
    if (onEnter) return;
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    if (moveTimerRef.current != null) window.clearTimeout(moveTimerRef.current);
    if (query.trim().length < MIN_CHARS) return;
    debounceRef.current = window.setTimeout(() => {
      moveTimerRef.current = window.setTimeout(() => {
        moveTimerRef.current = null;
        void runQuery(query);
      }, PAUSE_BEFORE_MOVE_MS);
    }, DEBOUNCE_MS);
  }, [query, open, onEnter, runQuery]);

  if (!open) return null;
  return (
    <SearchPill
      query={query}
      onChange={setQuery}
      keyboardEnabled={kbEnabled}
      onEnter={onEnter ? () => void runQuery(query) : undefined}
    />
  );
}

function SearchPill({ query, onChange, keyboardEnabled, onEnter }: {
  query: string;
  onChange: (q: string) => void;
  keyboardEnabled: boolean;
  onEnter?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onField = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e?.target?.value ?? "");
  };
  // Kick HTML focus + add the HTML5 attrs Steam Deck's on-screen
  // keyboard looks for. Synthetic pointer sequence ONLY when the
  // virtual-keyboard toggle is on — that's the trigger that pops the
  // Deck's keyboard. Cleanup blurs + fires Steam's dismissed
  // notifications so the keyboard exits with the overlay.
  useEffect(() => {
    let cancelled = false;
    let captured: HTMLInputElement | null = null;
    const tryFocus = (n: number) => {
      if (cancelled) return;
      const host = hostRef.current;
      const input = host?.querySelector<HTMLInputElement>("input");
      if (input && input.isConnected) {
        captured = input;
        try {
          input.setAttribute("inputmode", "text");
          input.setAttribute("autocomplete", "off");
          input.setAttribute("autocorrect", "off");
          input.setAttribute("autocapitalize", "none");
          input.setAttribute("spellcheck", "false");
          input.setAttribute("enterkeyhint", "search");
          if (!input.hasAttribute("tabindex")) input.setAttribute("tabindex", "0");
        } catch {}
        try { input.focus(); } catch {}
        if (n === 8 && keyboardEnabled) {
          try {
            const r = input.getBoundingClientRect();
            const x = r.left + r.width / 2;
            const y = r.top + r.height / 2;
            const PD = (typeof PointerEvent !== "undefined") ? PointerEvent : null;
            if (PD) {
              input.dispatchEvent(new PD("pointerdown", { bubbles: true, clientX: x, clientY: y, pointerType: "touch" }));
              input.dispatchEvent(new PD("pointerup",   { bubbles: true, clientX: x, clientY: y, pointerType: "touch" }));
            }
            input.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
          } catch {}
        }
        try {
          const g = globalThis as any;
          g.__ds_search_active = {
            n,
            isInput: input === input.ownerDocument?.activeElement,
            activeTag: (input.ownerDocument?.activeElement as HTMLElement | null)?.tagName,
            type: input.type,
            tabIndex: input.tabIndex,
            kb: keyboardEnabled,
          };
        } catch {}
      }
      if (n > 0) window.setTimeout(() => tryFocus(n - 1), 120);
    };
    tryFocus(8);
    return () => {
      cancelled = true;
      try { captured?.blur(); } catch {}
      dismissSteamKeyboard();
    };
  }, [keyboardEnabled]);

  // Enter handler (only when caller passed `onEnter` — i.e. when the
  // user opted into the "search only on Enter" toggle).
  useEffect(() => {
    if (!onEnter) return;
    const input = hostRef.current?.querySelector<HTMLInputElement>("input");
    if (!input) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onEnter();
      }
    };
    input.addEventListener("keydown", handler);
    return () => { input.removeEventListener("keydown", handler); };
  }, [onEnter]);
  // Width grows with the typed string, in ch units so it scales with
  // the (vw-clamped) font-size. Floor keeps a sensible empty width;
  // ceil prevents runaway growth on long queries.
  const chars = Math.max(8, Math.min(40, query.length + 3));
  return (
    <>
      {/* The styles below live inline because DeckQAMStyles only mounts
          in the QAM Settings tree, never on the home. The dark backdrop
          sits ONLY on the input itself — nothing wraps the field. */}
      <style>{`
        .ds-search-pill-host { background: transparent !important; border: none !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; width: 100%; }
        .ds-search-pill-host > div, .ds-search-pill-host > div > div { background: transparent !important; border: none !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; width: 100% !important; }
        .ds-search-pill-host input {
          background: rgba(0, 0, 0, 0.55) !important;
          border: none !important;
          outline: none !important;
          padding: 0.35em 0.9em !important;
          margin: 0 !important;
          width: 100% !important;
          min-width: 0 !important;
          color: white !important;
          font-size: inherit !important;
          font-weight: 700 !important;
          text-align: center !important;
          caret-color: white !important;
          border-radius: 0.5em !important;
          box-shadow: 0 0 18px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.10) !important;
          text-shadow: 0 1px 3px rgba(0,0,0,0.85);
        }
        .ds-search-pill-host input::placeholder { color: rgba(255,255,255,0.55) !important; }
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
          ref={hostRef}
          className="ds-search-pill-host"
          style={{
            width: `${chars}ch`,
            maxWidth: "70vw",
            background: "transparent",
            border: "none",
            boxShadow: "none",
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
