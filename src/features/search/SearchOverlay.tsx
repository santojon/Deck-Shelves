import { devStamp, devCount } from "../../runtime/devStamps";
import { useCallback, useEffect, useRef, useState } from "react";
import { TextField } from "../../runtime/host/decky";
import { getExternalSearchProviders, type SearchHit } from "../../core/pluginApi";
import { isHomeRoute } from "../../components/home/mountUtils";
import { getCurrentSettings, subscribeSettings } from "../../settingsStore";
import { GamepadButton, subscribeHomeButton, subscribeHomeKey } from "../../runtime/homeInputBus";
import { createMatcherState, matchEvent, parseCombo, parseRawCombo, resolveBindings } from "../../runtime/buttonBindings";
import { resolveKeyboardBindings, parseKeyCombo, matchKeyEvent, createKeyMatcherState, isEditableKeyTarget } from "../../runtime/keyboardBindings";
import { trackFeature } from "../../steam/usageTracking";
import { subscribeControllerInput, Button as RawBtn } from "../../runtime/controllerInput";
import { getPreferredSteamDocument, getAllSteamDocuments } from "../../runtime/steamHost";
import { focusElement } from "../../core/focusRestore";
import { closeAmbientOverlays, lockOverlay, isOverlayLocked } from "../../runtime/closeOverlays";
import { getSessionState } from "../../runtime/sessionState";
import { applyVirtualKey } from "./virtualKeyEdit";

const MIN_CHARS = 3;
const SEARCH_LIMIT = 30;
const DEBOUNCE_MS = 1200;
const PAUSE_BEFORE_MOVE_MS = 800;
const MEMORY_TTL_MS = 30_000;

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

function blurActiveTextInputs(): void {
  try {
    for (const doc of getAllSteamDocuments()) {
      try {
        const ae = doc.activeElement as HTMLElement | null;
        if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) ae.blur();
      } catch {}
    }
  } catch {}
}

const inputApiOf = (owner: any) => owner?.SteamClient?.Input;

function candidateInputApis(): any[] {
  const g = globalThis as any;
  const view = g.SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow;
  return [inputApiOf(view?.opener), inputApiOf(g), inputApiOf(g.opener), inputApiOf(view)].filter(Boolean);
}

const KEYBOARD_DISMISS_METHODS = ["ModalKeyboardDismissed", "StandaloneKeyboardDismissed", "DismissGamepadKeyboard", "CloseGamepadKeyboard", "HideGamepadKeyboard"];

function dismissSteamKeyboard(): void {
  // ModalKeyboardDismissed only notifies and doesn't close the keyboard, so blur and call every dismiss method.
  blurActiveTextInputs();
  try {
    for (const Input of candidateInputApis()) {
      for (const m of KEYBOARD_DISMISS_METHODS) {
        try { Input[m]?.(); } catch {}
      }
    }
  } catch {}
}

function steamKeyboardManager(): any {
  try { return (globalThis as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance?.m_VirtualKeyboardManager ?? null; } catch { return null; }
}

// Steam injects on-screen keyboard keys natively; its text-entered override routes them here instead.
function routeVirtualKeyboard(input: HTMLInputElement, onValue: (v: string) => void, onEnter: () => void): () => void {
  const m = steamKeyboardManager();
  if (typeof m?.SetVRKeyboardOnTextEnteredOverride !== "function") return () => {};
  const handler = (key: unknown): void => {
    if (key === "Enter") { onEnter(); return; }
    const end = input.value.length;
    const edit = applyVirtualKey(input.value, input.selectionStart ?? end, input.selectionEnd ?? end, String(key ?? ""));
    if (!edit) return;
    onValue(edit.value);
    window.setTimeout(() => { try { input.setSelectionRange(edit.caret, edit.caret); } catch {} }, 0);
  };
  try { m.SetVRKeyboardOnTextEnteredOverride(handler); } catch { return () => {}; }
  return () => { try { if (m.m_fnVROnTextEnteredOverride === handler) m.SetVRKeyboardOnTextEnteredOverride(null); } catch {} };
}

function prepareSearchInput(input: HTMLInputElement): void {
  try {
    input.setAttribute("inputmode", "text");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("autocorrect", "off");
    input.setAttribute("autocapitalize", "none");
    input.setAttribute("spellcheck", "false");
    input.setAttribute("enterkeyhint", "search");
    if (!input.hasAttribute("tabindex")) input.setAttribute("tabindex", "0");
  } catch {}
}

// Steam only pops the keyboard for pointer-initiated focus.
function tapInputForKeyboard(input: HTMLInputElement): void {
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

function publishSearchFocusDiag(input: HTMLInputElement, n: number, kb: boolean): void {
  devStamp("__ds_search_active", {
    n,
    isInput: input === input.ownerDocument?.activeElement,
    activeTag: (input.ownerDocument?.activeElement as HTMLElement | null)?.tagName,
    type: input.type,
    tabIndex: input.tabIndex,
    kb,
  });
}

export function SearchOverlay() {
  devCount("__ds_search_mounted");
  const [enabled, setEnabled] = useState(() => {
    const s = getCurrentSettings() as any;
    return s?.enabled === true && s?.contextSearchEnabled === true && s?.lightModeEnabled !== true;
  });
  const [kbEnabled, setKbEnabled] = useState(() => (getCurrentSettings() as any)?.contextSearchKeyboardEnabled !== false);
  const [onEnter, setOnEnter] = useState(() => (getCurrentSettings() as any)?.contextSearchOnEnter === true);
  useEffect(() => subscribeSettings((s) => {
    setEnabled((s as any)?.enabled === true && (s as any)?.contextSearchEnabled === true && (s as any)?.lightModeEnabled !== true);
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
    // Dismiss while the input is still mounted; after unmount there is nothing to dismiss.
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
      // Wait for the overlay to unmount, or the input wins the focus race.
      window.setTimeout(() => {
        try { if (prior.isConnected) focusElement(prior); } catch {}
      }, 180);
    }
  }, [query]);

  const runQuery = useCallback(async (q: string) => {
    if (q.trim().length < MIN_CHARS) return;
    const myToken = ++searchAbort.current;
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
      // Close first so the focus-reclaim listener is gone before the card takes focus.
      close({ restorePrior: false, clearSession: true });
      requestAnimationFrame(() => {
        try { first.onActivate?.(); } catch {}
        // The keyboard can outlive the input, so dismiss it again.
        dismissSteamKeyboard();
      });
    } else {
      close();
    }
  }, [close]);

  const matcherStateRef = useRef(createMatcherState());
  const rawMatcherStateRef = useRef(createMatcherState());
  const lastOpenAtRef = useRef(0);
  const openSearch = useCallback(() => {
    // The Home route can stay current behind a running game.
    if (!isHomeRoute() || getSessionState().gameRunning) return;
    if (isOverlayLocked()) return;
    const now = Date.now();
    if (now - lastOpenAtRef.current < 350) return;
    lastOpenAtRef.current = now;
    lockOverlay();
    try {
      const doc = getPreferredSteamDocument() ?? document;
      const focused = doc.querySelector<HTMLElement>(".gpfocus[data-appid]");
      if (focused) priorFocusRef.current = focused;
    } catch {}
    void (async () => {
      await closeAmbientOverlays();
      setQuery(readSessionQuery());
      setOpen(true);
      trackFeature("search");
      window.setTimeout(tryOpenSteamKeyboard, 60);
    })();
  }, []);
  useEffect(() => {
    if (!enabled) return;
    devStamp("__ds_search_enabled", enabled);
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
  // Decky's button bus only fires while one of our cards has focus, so also listen to the raw stream.
  useEffect(() => {
    if (!enabled || open) return;
    return subscribeControllerInput((e) => {
      if (!e.pressed) return;
      const navSearch = resolveBindings(getCurrentSettings()?.buttonBindings as any, (getCurrentSettings() as any)?.buttonBindingsDisabled).navSearch;
      if (!navSearch) return;
      const combo = parseRawCombo(navSearch);
      if (!matchEvent({ button: e.button }, combo, rawMatcherStateRef.current)) return;
      openSearch();
    });
  }, [enabled, open, openSearch]);
  const keyMatcherStateRef = useRef(createKeyMatcherState());
  useEffect(() => {
    if (!enabled || open) return;
    return subscribeHomeKey((e) => {
      if (isEditableKeyTarget(e.tag)) return;
      const navSearchKey = resolveKeyboardBindings(getCurrentSettings()?.keyboardBindings as any, (getCurrentSettings() as any)?.keyboardBindingsDisabled).navSearch;
      if (!navSearchKey) return;
      if (!matchKeyEvent(e.code ?? null, parseKeyCombo(navSearchKey), keyMatcherStateRef.current, Date.now(), { ctrl: e.ctrl, shift: e.shift, alt: e.alt })) return;
      openSearch();
    });
  }, [enabled, open, openSearch]);

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

function focusSearchInput(input: HTMLInputElement, n: number, keyboardEnabled: boolean, first: boolean): void {
  prepareSearchInput(input);
  try { input.focus(); } catch {}
  if (n === 8 && keyboardEnabled) tapInputForKeyboard(input);
  if (first && input.value) { try { input.select(); } catch {} }
  publishSearchFocusDiag(input, n, keyboardEnabled);
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
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onEnterRef = useRef(onEnter);
  onEnterRef.current = onEnter;
  useEffect(() => {
    let cancelled = false;
    let captured: HTMLInputElement | null = null;
    let unroute: (() => void) | null = null;
    const tryFocus = (n: number) => {
      if (cancelled) return;
      const host = hostRef.current;
      const input = host?.querySelector<HTMLInputElement>("input");
      if (input && input.isConnected) {
        const first = !captured;
        captured = input;
        unroute ??= routeVirtualKeyboard(input, (v) => onChangeRef.current(v), () => onEnterRef.current?.());
        focusSearchInput(input, n, keyboardEnabled, first);
      }
      if (n > 0) window.setTimeout(() => tryFocus(n - 1), 120);
    };
    tryFocus(8);
    // Steam sometimes steals focus back shortly after the pill opens.
    const reclaim = (e: FocusEvent) => {
      if (cancelled) return;
      const host = hostRef.current;
      const input = host?.querySelector<HTMLInputElement>("input");
      if (!input) return;
      const next = (e.relatedTarget as HTMLElement | null) ?? input.ownerDocument?.activeElement as HTMLElement | null;
      if (next && host?.contains(next)) return;
      try { input.focus({ preventScroll: true }); } catch {}
    };
    const inputEl = hostRef.current?.querySelector<HTMLInputElement>("input");
    inputEl?.addEventListener("focusout", reclaim);
    return () => {
      cancelled = true;
      unroute?.();
      inputEl?.removeEventListener("focusout", reclaim);
      try { captured?.blur(); } catch {}
      dismissSteamKeyboard();
    };
  }, [keyboardEnabled]);

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
  const chars = Math.max(8, Math.min(40, query.length + 3));
  return (
    <>
      {/* Inline because the QAM stylesheet isn't mounted on the Home. */}
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
