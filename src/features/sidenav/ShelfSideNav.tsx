import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Focusable } from "../../runtime/host/decky";
import { getCurrentSettings, subscribeSettings } from "../../settingsStore";
import { getExternalSideMenuProviders, type SideMenuContext, type SideMenuEntry } from "../../core/pluginApi";
import type { Settings, Shelf, SmartShelf } from "../../types";
import { focusElement } from "../../core/focusRestore";
import { GamepadButton, dispatchHomeButtonDown, subscribeHomeButton } from "../../runtime/homeInputBus";
import { createMatcherState, matchEvent, parseCombo, parseRawCombo, resolveBindings } from "../../runtime/buttonBindings";
import { subscribeControllerInput } from "../../runtime/controllerInput";
import { trackFeature } from "../../steam/usageTracking";
import { isHomeRoute } from "../../components/home/mountUtils";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { evalVisibility } from "../../steam/smartShelves";
import { interleaveSmartShelves, pickFirstVisibleShelfId } from "../../domain/shelfOrder";
import { closeAmbientOverlays, lockOverlay, isOverlayLocked } from "../../runtime/closeOverlays";

type Anchor = {
  shelfId: string;
  focusedAppid: number | null;
};

export function ShelfSideNav() {
  try { (globalThis as any).__ds_sidenav_mounted = (((globalThis as any).__ds_sidenav_mounted ?? 0) + 1); } catch {}
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [settings, setSettings] = useState<Settings | null>(() => getCurrentSettings());

  useEffect(() => subscribeSettings(setSettings), []);

  // Light mode strips advanced features for simplicity / battery — the
  // side nav is one of them. User toggle stays untouched.
  const lightMode = (settings as any)?.lightModeEnabled === true;
  // Gate on the master "enabled" too — when the plugin is off, the home should
  // behave as if it isn't there (no side nav), like shelves + recents already do.
  const enabled = (settings as any)?.enabled === true && !lightMode && (settings as any)?.sideNavEnabled === true;

  const lastFirstCardRef = useRef<{ shelfId: string; appid: number | null } | null>(null);
  const lastOpenAtRef = useRef(0);
  const priorFocusRef = useRef<HTMLElement | null>(null);
  const enabledRef = useRef<boolean>(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      setAnchor(null);
    }
  }, [enabled]);

  const closeAndRestore = () => {
    const prior = priorFocusRef.current;
    priorFocusRef.current = null;
    setAnchor(null);
    if (prior && prior.isConnected) {
      try { focusElement(prior); } catch {}
    }
  };

  useEffect(() => {
    if (!enabled) return;
    const doc = getPreferredSteamDocument() ?? document;
    // Track the LAST focused card on any DS shelf so the side menu can
    // remember which shelf the user was browsing when they triggered it.
    const update = () => {
      const focused = doc.querySelector<HTMLElement>(".gpfocus[data-appid]");
      if (!focused) return;
      const appidAttr = focused.getAttribute("data-appid");
      const appid = appidAttr ? Number(appidAttr) : null;
      const shelfEl = focused.closest<HTMLElement>("[data-shelfid]");
      const shelfId = shelfEl?.getAttribute("data-shelfid") ?? null;
      if (!shelfId) return;
      lastFirstCardRef.current = { shelfId, appid: Number.isFinite(appid) ? appid : null };
    };
    update();
    if (!doc.body) return;
    const obs = new MutationObserver(update);
    obs.observe(doc.body, { attributes: true, subtree: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, [enabled]);

  /* Dev-only screenshot hook: opens the side nav without a real gamepad
     chord (SteamClient.Input can't be driven over CDP). Resolves the anchor
     from the last-focused card, an explicit shelfId arg, or the first DS
     shelf in the DOM. Stripped from release builds via `if (!__DEV__)`. */
  useEffect(() => {
    if (!__DEV__) return;
    const g = globalThis as any;
    g.__ds_dev_open_sidenav = (shelfId?: string, appid?: number) => {
      let sid = shelfId ?? lastFirstCardRef.current?.shelfId;
      if (!sid) {
        const doc = getPreferredSteamDocument() ?? document;
        sid = doc.querySelector<HTMLElement>(".ds-shelf[data-shelfid]")?.getAttribute("data-shelfid") ?? undefined;
      }
      if (!sid) return false;
      const aid = appid ?? lastFirstCardRef.current?.appid ?? null;
      setAnchor({ shelfId: sid, focusedAppid: Number.isFinite(aid as number) ? (aid as number) : null });
      return true;
    };
    g.__ds_dev_close_sidenav = () => setAnchor(null);
    return () => { try { delete g.__ds_dev_open_sidenav; delete g.__ds_dev_close_sidenav; } catch {} };
  }, []);

  useEffect(() => {
    try { (globalThis as any).__ds_sidenav_enabled = enabled; } catch {}
    if (!enabled) return;
    const tryOpen = () => {
      if (anchor || !isHomeRoute()) return;
      const { shelfId, appid } = resolveAnchorFromFocus();
      if (!shelfId || isOverlayLocked()) return;
      const now = Date.now();
      if (now - lastOpenAtRef.current < 350) return;
      lastOpenAtRef.current = now;
      lockOverlay();
      void (async () => {
        await closeAmbientOverlays();
        try { (globalThis as any).__ds_sidenav_open = { shelfId, appid, t: now }; } catch {}
        setAnchor({ shelfId, focusedAppid: Number.isFinite(appid) ? (appid as number) : null });
        trackFeature("sidenav");
      })();
    };
    const matcherState = createMatcherState();
    const rawMatcherState = createMatcherState();
    const unsubBtn = subscribeHomeButton((e) => {
      if (!enabledRef.current) return;
      try { (globalThis as any).__ds_sidenav_last_btn = { b: e.button, t: Date.now() }; } catch {}
      const combo = parseCombo(resolveBindings(getCurrentSettings()?.buttonBindings as any, (getCurrentSettings() as any)?.buttonBindingsDisabled).navSideNav);
      if (matchEvent({ button: e.button }, combo, matcherState)) {
        try { (globalThis as any).__ds_sidenav_fired = Date.now(); } catch {}
        tryOpen();
      }
    });
    /* Parallel raw stream so the combo fires regardless of where focus
       sits (QAM, Steam menu, context menu, native recents). Decky's
       home-button bus only fires when a DS card holds focus; the raw bus
       listens globally. `tryOpen` debounces so the two paths can both
       fire without double-opening. */
    const unsubRaw = subscribeControllerInput((e) => {
      if (!enabledRef.current || !e.pressed) return;
      const navSideNav = resolveBindings(getCurrentSettings()?.buttonBindings as any, (getCurrentSettings() as any)?.buttonBindingsDisabled).navSideNav;
      if (!navSideNav) return;
      if (matchEvent({ button: e.button }, parseRawCombo(navSideNav), rawMatcherState)) tryOpen();
    });
    return () => { unsubBtn(); unsubRaw(); };
  }, [anchor, enabled]);

  if (!enabled || !anchor || !settings) return null;
  // Inline render (no portal) keeps the overlay inside Steam's NavTree
  // so B closes it via `onCancelButton`.
  return (
    <SideNavShell
      anchor={anchor}
      settings={settings}
      onClose={closeAndRestore}
    />
  );
}

interface UnifiedShelf { id: string; title: string }

/* Resolve which shelf the sidenav should anchor to, based on the
   currently-focused element. DS card → its shelf; native recents card →
   NATIVE_RECENTS_ID; nothing focused → first visible shelf (DOM, then
   settings fallback). */
function shelfIdForFocused(doc: Document, focused: HTMLElement): string | null {
  const card = focused.closest<HTMLElement>(".ds-card");
  const shelfEl = (card ?? focused).closest<HTMLElement>(".ds-shelf[data-shelfid]");
  const dsShelf = shelfEl?.getAttribute("data-shelfid") ?? null;
  if (dsShelf) return dsShelf;
  const nativeEl = findNativeRecentsEl(doc);
  return nativeEl && nativeEl.contains(focused) ? NATIVE_RECENTS_ID : null;
}

function resolveAnchorFromFocus(): { shelfId: string | null; appid: number | null } {
  let shelfId: string | null = null;
  let appid: number | null = null;
  try {
    const doc = getPreferredSteamDocument() ?? document;
    const focused = doc.querySelector<HTMLElement>(".gpfocus[data-appid]")
      ?? doc.querySelector<HTMLElement>(".gpfocus");
    if (focused) {
      appid = appidForFocused(focused);
      shelfId = shelfIdForFocused(doc, focused);
    }
    shelfId = shelfId
      ?? doc.querySelector<HTMLElement>(".ds-shelf[data-shelfid]")?.getAttribute("data-shelfid")
      ?? null;
  } catch {}
  return { shelfId: shelfId ?? firstVisibleShelfFromSettings(), appid };
}

function appidForFocused(focused: HTMLElement): number | null {
  const card = focused.closest<HTMLElement>(".ds-card");
  const ap = focused.getAttribute("data-appid") ?? card?.getAttribute("data-appid");
  return ap ? Number(ap) : null;
}

function firstVisibleShelfFromSettings(): string | null {
  const s = getCurrentSettings();
  const visibleRegular = (s?.shelves ?? []).filter((x: any) => x.enabled && !x.hidden && evalVisibility(x));
  if (visibleRegular.length > 0) return visibleRegular[0].id;
  const visibleSmart = s?.smartShelvesEnabled
    ? (s?.smartShelves ?? []).filter((x: any) =>
        x.enabled !== false && !x.hidden && evalVisibility(x))
    : [];
  return visibleSmart.length > 0 ? visibleSmart[0].id : null;
}

// Settings-derived shelf list, used when the BP DOM isn't readable yet.
/* Mirrors the home's interleave / normal-first ordering.
   BTakeFocus registers with Steam's NavTree but scrolls the home (the
   sidenav Focusables are indexed in the home scroll container even though
   the panel is position:fixed). Save + restore scroll (sync + rAF) so the
   home viewport stays put. */
function focusRowPreservingScroll(el: HTMLElement, isCancelled: () => boolean): void {
  const doc = el.ownerDocument;
  const savedTop = doc?.documentElement?.scrollTop ?? 0;
  const savedLeft = doc?.documentElement?.scrollLeft ?? 0;
  const restore = () => {
    try { if (doc && !isCancelled()) { doc.documentElement.scrollTop = savedTop; doc.documentElement.scrollLeft = savedLeft; } } catch {}
  };
  try { focusElement(el); } catch {}
  restore();
  requestAnimationFrame(restore);
}

function visibleSmartShelves(settings: Settings): SmartShelf[] {
  if (!settings.smartShelvesEnabled) return [];
  return (settings.smartShelves ?? []).filter((s: SmartShelf) =>
    (s as any).enabled !== false && !(s as any).hidden
    && evalVisibility(s as any));
}

function shelvesFromSettings(settings: Settings): UnifiedShelf[] {
  const regulars = (settings.shelves ?? []).filter((s: Shelf) => s.enabled && !s.hidden);
  const smart = visibleSmartShelves(settings);
  const normalFirst = settings.smartShelvesAtBottom || settings.hideRecents === true;
  const combined: any[] = normalFirst ? [...regulars, ...smart] : [...smart, ...regulars];
  const interleave = settings.hideRecents === true && !settings.smartShelvesAtBottom;
  const firstVisible = pickFirstVisibleShelfId(combined as any, new Set<string>()) ?? combined[0]?.id ?? null;
  const ordered = interleave ? interleaveSmartShelves(combined as any, firstVisible) : combined;
  return (ordered as any[]).map((s) => ({ id: s.id, title: s.title || "—" }));
}

function SideNavShell({ anchor, settings, onClose }: { anchor: Anchor; settings: Settings; onClose: () => void }) {
  const { t } = useTranslation();

  /* Source of truth: the actual rendered DOM. Sorting by visual `top`
     honours CSS `order` (interleave), and the data-shelfid filter limits
     us to DS shelves currently mounted on the home — so we list EXACTLY
     what the user sees, in the order they see it. Falls back to a
     settings-derived list if the BP DOM isn't readable yet. */
  const computedShelves = useMemo(() => {
    const doc = getPreferredSteamDocument();
    // Gate on hideRecents: when the user explicitly hid the native
    // recents row, don't show it regardless of what the DOM contains.
    const nativeEntry = settings.hideRecents === true
      ? null
      : readNativeRecentsEntry(doc, t("sidenav_recents_fallback_label"));
    const fromDom = readVisibleShelvesFromDom();
    const base = fromDom.length > 0 ? fromDom : shelvesFromSettings(settings);
    return nativeEntry ? [nativeEntry, ...base] : base;
  }, [
    anchor.shelfId,
    settings.shelves,
    settings.smartShelves,
    settings.smartShelvesEnabled,
    settings.smartShelvesAtBottom,
    settings.hideRecents,
  ]);

  /* Freeze the row list at first paint so async shelf re-resolves
     (composite online sources that finish loading after sidenav open)
     don't shuffle row positions under the user's focus. Captures the
     first non-empty list and never updates within a single sidenav
     session. */
  const frozenShelvesRef = useRef<UnifiedShelf[] | null>(null);
  if (frozenShelvesRef.current == null && computedShelves.length > 0) {
    frozenShelvesRef.current = computedShelves;
  }
  const orderedShelves: UnifiedShelf[] = frozenShelvesRef.current ?? computedShelves;

  const ctx: SideMenuContext = { shelfId: anchor.shelfId, focusedAppid: anchor.focusedAppid };
  const [pluginEntries, setPluginEntries] = useState<SideMenuEntry[]>([]);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  /* Map of shelfId → row element. A callback ref attached to every row
     populates this; the focus effect looks up by anchor.shelfId. Robust
     when the current shelf IS the first (the previous conditional ref
     double-attribution left firstBtnRef empty in that case). */
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const firstShelfIdRef = useRef<string | null>(null);

  /* Push NavTree focus into the user's current shelf row (or the first
     row as fallback) after Steam settles the new Focusable tree.
     Drive focus into the target row after the NavTree has indexed the
     new Focusable children. We use el.focus({ preventScroll: true }) */
  /* rather than focusElement (BTakeFocus) because BTakeFocus on a
     position:fixed panel node triggers a home-scroll since Steam
     translates the viewport rect back to scroll-container coords.
     Plain .focus() hands control to Decky's Focusable which registers
     with the gamepad tree without scrolling the parent doc. */
  useEffect(() => {
    let cancelled = false;
    const targetId = anchor.shelfId;
    const tryAt = (delay: number) => {
      window.setTimeout(() => {
        if (cancelled) return;
        const el = rowRefs.current.get(targetId)
          ?? (firstShelfIdRef.current ? rowRefs.current.get(firstShelfIdRef.current) : null);
        try { (globalThis as any).__ds_sidenav_focus = { delay, targetId, found: !!el }; } catch {}
        if (el) focusRowPreservingScroll(el, () => cancelled);
      }, delay);
    };
    tryAt(80);
    tryAt(250);
    tryAt(500);
    return () => { cancelled = true; };
  }, [anchor.shelfId]);

  useEffect(() => {
    let alive = true;
    const providers = getExternalSideMenuProviders();
    Promise.all(providers.map((p) => Promise.resolve(p.resolve(ctx)).catch(() => [] as SideMenuEntry[])))
      .then((lists) => {
        if (!alive) return;
        setPluginEntries(lists.flat());
      });
    return () => { alive = false; };
  }, [anchor.shelfId, anchor.focusedAppid]);

  const jumpToShelf = (shelfId: string) => {
    // The home root lives in BP — `document.querySelector` here would
    // be SharedJSContext's empty document. Walk the preferred Steam
    // doc to find the real card.
    const doc = getPreferredSteamDocument() ?? document;
    onClose();
    if (shelfId === NATIVE_RECENTS_ID) {
      focusNativeRecentsFirstCard(doc);
      return;
    }
    const target = doc.querySelector<HTMLElement>(
      `[data-shelfid="${cssEscape(shelfId)}"] [data-ds-card-index="0"]`,
    );
    if (target) {
      try { focusElement(target); } catch {}
    }
  };

  // Auto-close after 5s of no user interaction (focus / button / scroll).
  // Auto-close after 30s of no interaction. The 5s timer was too
  /* aggressive — it fired before focus settled (especially during the
     BTakeFocus + scroll-restore window, ~350ms). The drift-close
     (focusout listener) was even worse: el.focus() at 80ms causes a
     focusout on the previous element, which fired the 120ms close
     timer before BTakeFocus at 250ms had a chance to stabilise focus. */
  const idleTimerRef = useRef<number | null>(null);
  const resetIdleTimer = () => {
    if (idleTimerRef.current != null) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => { try { onClose(); } catch {} }, 30_000);
  };
  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current != null) window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    };
  }, []);

  return (
    <div
      className="ds-sidenav-overlay"
      onClick={onClose}
      onFocus={resetIdleTimer}
      onMouseMove={resetIdleTimer}
      style={{
        position: "fixed",
        inset: 0,
        // Deeper black wash with stronger blur so the column sits over
        // a really dark backdrop — easier to read at any home wallpaper.
        background: "linear-gradient(to right, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.55) 38%, rgba(0,0,0,0) 62%)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        zIndex: 9_998,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
      }}
    >
      <Focusable
        ref={panelRef}
        flow-children="vertical"
        noFocusRing
        onCancelButton={onClose}
        onButtonDown={(evt: any) => {
          resetIdleTimer();
          try { dispatchHomeButtonDown(evt); } catch {}
          try {
            if (evt?.detail?.button === GamepadButton.CANCEL) onClose();
          } catch {}
        }}
        onGamepadDirection={(evt: any) => {
          resetIdleTimer();
          /* Absorb the event so Steam's NavTree doesn't ALSO process it
             and scroll the background mount. preventDefault alone isn't
             enough — Steam's listener runs in capture; stopImmediate
             blocks the rest of the chain so the home doesn't scroll
             behind the sidenav. */
          const absorb = () => {
            try { evt?.preventDefault?.(); } catch {}
            try { evt?.stopPropagation?.(); } catch {}
            try { evt?.stopImmediatePropagation?.(); } catch {}
            try { evt?.detail?.event?.preventDefault?.(); } catch {}
            try { evt?.detail?.event?.stopPropagation?.(); } catch {}
          };
          // Right exits the panel — close so the overlay doesn't linger.
          try {
            if (evt?.detail?.button === GamepadButton.DIR_RIGHT) { absorb(); onClose(); return; }
          } catch {}
          // DPAD up/down at the boundaries naturally tries to escape the
          // panel into the home tree, which strands the user. Block
          // vertical escape by wrapping focus inside the panel.
          try {
            const dir = evt?.detail?.button;
            if (dir !== GamepadButton.DIR_DOWN && dir !== GamepadButton.DIR_UP) return;
            const keys = Array.from(rowRefs.current.keys());
            if (keys.length === 0) return;
            const doc = panelRef.current?.ownerDocument;
            const focused = doc?.querySelector<HTMLElement>(".ds-sidenav-overlay .gpfocus")
              ?? doc?.activeElement as HTMLElement | null;
            let curIdx = -1;
            for (let i = 0; i < keys.length; i++) {
              const el = rowRefs.current.get(keys[i]);
              if (el && focused && (el === focused || el.contains(focused))) { curIdx = i; break; }
            }
            const isFirst = curIdx === 0;
            const isLast = curIdx === keys.length - 1;
            if (dir === GamepadButton.DIR_UP && isFirst) {
              const el = rowRefs.current.get(keys[keys.length - 1]);
              if (el) { focusElement(el); absorb(); }
            } else if (dir === GamepadButton.DIR_DOWN && isLast) {
              const el = rowRefs.current.get(keys[0]);
              if (el) { focusElement(el); absorb(); }
            } else {
              // Interior navigation — absorb anyway so the underlying
              // home mount doesn't auto-scroll on each DPAD press.
              absorb();
            }
          } catch {}
        }}
        onSecondaryActionDescription={t("close" as any) || "Close"}
        onClick={(e) => e.stopPropagation()}
        style={{
          // Tighter column anchored to the left. Dimensions in vw / vh
          // / rem so the panel scales across handheld, docked TV, 4K.
          width: "clamp(180px, 22vw, 280px)",
          marginLeft: "1vw",
          maxHeight: "78vh",
          display: "flex",
          flexDirection: "column",
          gap: "0.15rem",
          overflowY: "auto",
          padding: "0.2rem 0",
        }}
      >
        {orderedShelves.length === 0 ? (
          <Hint text={t("sidenav_no_shelves" as any)} />
        ) : (
          orderedShelves.map((s, idx) => {
            if (idx === 0) firstShelfIdRef.current = s.id;
            const isCurrent = s.id === anchor.shelfId;
            return (
              <ShelfButton
                key={s.id}
                label={s.title}
                active={isCurrent}
                // preferredFocus intentionally OFF — Steam's BTakeFocus
                /* triggered by preferredFocus scrolls the home viewport
                   because the sidenav Focusables are indexed relative to
                   the home scroll container even though the panel is
                   position:fixed. We drive focus explicitly via the
                   focus-restore effect (tryAt delays) instead. */
                preferredFocus={false}
                focused={focusedKey === s.id}
                onActivate={() => jumpToShelf(s.id)}
                onFocusChange={(f) => {
                  if (f) setFocusedKey(s.id);
                  else setFocusedKey((cur) => (cur === s.id ? null : cur));
                }}
                hoverFocusTimeoutMs={3000}
                ref={(el) => {
                  if (el) rowRefs.current.set(s.id, el);
                  else rowRefs.current.delete(s.id);
                }}
              />
            );
          })
        )}
        {pluginEntries.length > 0 && (
          <>
            <Header>{t("sidenav_plugins" as any)}</Header>
            {pluginEntries.map((entry) => (
              <ShelfButton
                key={entry.id}
                label={entry.label}
                active={false}
                focused={focusedKey === `plugin:${entry.id}`}
                disabled={entry.disabled}
                icon={entry.icon}
                onActivate={() => {
                  try { entry.onActivate(); } catch {}
                  onClose();
                }}
                onFocusChange={(f) => {
                  const key = `plugin:${entry.id}`;
                  if (f) setFocusedKey(key);
                  else setFocusedKey((cur) => (cur === key ? null : cur));
                }}
              />
            ))}
          </>
        )}
      </Focusable>
    </div>
  );
}

const ShelfButton = forwardRef<HTMLDivElement, {
  label: string;
  active: boolean;
  focused?: boolean;
  preferredFocus?: boolean;
  disabled?: boolean;
  icon?: unknown;
  onActivate: () => void;
  onFocusChange?: (focused: boolean) => void;
  hoverFocusTimeoutMs?: number;
}>(function ShelfButton({ label, active, focused, preferredFocus, disabled, icon, onActivate, onFocusChange, hoverFocusTimeoutMs }, ref) {
  const handle = disabled ? () => undefined : onActivate;
  const timerRef = useRef<number | null>(null);
  const armTimer = () => {
    onFocusChange?.(true);
    if (!hoverFocusTimeoutMs || disabled) return;
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => { timerRef.current = null; handle(); }, hoverFocusTimeoutMs);
  };
  const clearTimer = () => {
    onFocusChange?.(false);
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  // All focus visuals inline so they render with the overlay — DeckQAMStyles
  // is only mounted in the QAM Settings tree, never on the home.
  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.5em",
    padding: "0.55em 0.9em 0.55em 1em",
    borderRadius: 6,
    // Dark-tinted focus palette: black gradient + a theme-coloured edge
    // bar (Steam's --gpSystemLighter; falls back to a muted neutral so
    // it still works on themes that don't define the var).
    background: focused
      ? "linear-gradient(to right, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0) 100%)"
      : "transparent",
    boxShadow: focused
      ? "inset 4px 0 0 0 var(--gpSystemLighter, rgba(180,190,210,0.55)), -10px 0 24px -4px rgba(0,0,0,0.55)"
      : undefined,
    transform: focused ? "translateX(0) scale(1.04)" : "translateX(0) scale(1)",
    transformOrigin: "left center",
    transition: "transform 180ms cubic-bezier(0.2,0.85,0.3,1.2), background 180ms ease, box-shadow 180ms ease",
    opacity: disabled ? 0.45 : 1,
    cursor: disabled ? "default" : "pointer",
  };
  return (
    <Focusable
      ref={ref}
      noFocusRing
      preferredFocus={preferredFocus}
      onClick={handle}
      onOKButton={handle}
      onActivate={handle}
      onGamepadFocus={armTimer}
      onGamepadBlur={clearTimer}
      style={rowStyle}
    >
      {icon ? <span style={{ display: "inline-flex" }}>{icon as React.ReactNode}</span> : null}
      <span
        style={{
          fontWeight: focused ? 700 : (active ? 600 : 500),
          fontSize: "clamp(15px, 1.9vw, 19px)",
          color: focused ? "white" : (active ? "white" : "rgba(255,255,255,0.88)"),
          textShadow: focused ? "0 1px 4px rgba(0,0,0,0.7)" : undefined,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >{label}</span>
    </Focusable>
  );
});

function Header({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ opacity: 0.55, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, padding: "10px 14px 4px" }}>
      {children}
    </div>
  );
}

function Hint({ text }: { text: string }) {
  return <div style={{ opacity: 0.55, padding: "8px 14px", fontStyle: "italic" }}>{text}</div>;
}

function cssEscape(value: string): string {
  // CSS.escape is widely available in the Steam Chromium runtime; the
  // fallback covers any environment without it (e.g. test harness).
  const g = globalThis as unknown as { CSS?: { escape?: (s: string) => string } };
  if (typeof g.CSS?.escape === "function") return g.CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

// Synthetic id used for the native Steam "Recents" row when it's visible
// on the home. Picked here (not in settings) so it can't collide with a
// real user-defined shelf id and so callers can recognise it.
export const NATIVE_RECENTS_ID = "__ds_native_recents__";

function getClassMap(): Record<string, string> {
  try {
    const g = globalThis as any;
    if (g?.__DS_CLASS_MAP && typeof g.__DS_CLASS_MAP === "object") return g.__DS_CLASS_MAP;
    if (globalThis.localStorage) {
      const raw = globalThis.localStorage.getItem("ds_class_map");
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return {};
}

function nativeCardSelectorSN(map: Record<string, string>): string {
  const cls = map.nativeCard;
  return cls
    ? `[class~="${cls}"]:not(.ds-card), a[href*="/library/app/"]:not(.ds-card), [data-appid]:not(.ds-card)`
    : `a[href*="/library/app/"]:not(.ds-card), [data-appid]:not(.ds-card)`;
}

function collectNativeShelfCandidates(doc: Document, map: Record<string, string>): HTMLElement[] {
  const candidates: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  const push = (cls?: string) => {
    if (!cls) return;
    try {
      doc.querySelectorAll<HTMLElement>(`[class~="${cls}"]`).forEach((el) => {
        if (!seen.has(el)) { seen.add(el); candidates.push(el); }
      });
    } catch {}
  };
  push(map.nativeShelfContainer);
  push(map.shelfSection);
  return candidates;
}

function isNativeCandidateSN(el: HTMLElement, root: HTMLElement | null, homeRoot: HTMLElement | null, sel: string): boolean {
  if (root && root.contains(el)) return false;
  if (homeRoot && homeRoot.contains(el)) return false;
  if (!el.isConnected || !el.querySelector(sel)) return false;
  const r = el.getBoundingClientRect();
  return r.height >= 40 && r.width >= 40;
}

export function findNativeRecentsEl(doc: Document): HTMLElement | null {
  // Native recents lives outside `.deck-shelves-root`. DS REUSES the
  // same `nativeShelfContainer` hashed class for its own wrappers, so
  // we filter inside-DS-root candidates out and require native cards.
  const root = doc.querySelector<HTMLElement>(".deck-shelves-root");
  const homeRoot = doc.getElementById("deck-shelves-home-root");
  const map = getClassMap();
  const sel = nativeCardSelectorSN(map);
  const candidates = collectNativeShelfCandidates(doc, map);
  let best: HTMLElement | null = null;
  let bestTop = Infinity;
  for (const el of candidates) {
    if (!isNativeCandidateSN(el, root, homeRoot, sel)) continue;
    const top = el.getBoundingClientRect().top;
    if (top < bestTop) { best = el; bestTop = top; }
  }
  try { (globalThis as any).__ds_native_probe = best ? { found: true, top: Math.round(best.getBoundingClientRect().top), candidates: candidates.length } : { found: false, candidates: candidates.length }; } catch {}
  return best;
}

function readVisibleShelvesFromDom(): UnifiedShelf[] {
  const doc = getPreferredSteamDocument();
  if (!doc) return [];
  const root = doc.querySelector<HTMLElement>(".deck-shelves-root");
  const scope = root ?? doc;
  // `[data-shelfid]` also lives on every card; scope to the shelf
  // wrapper (`.ds-shelf`) so we only count one entry per shelf.
  const all = Array.from(scope.querySelectorAll<HTMLElement>(".ds-shelf[data-shelfid]"));
  const visible = all.filter((el) => {
    if (!el.isConnected) return false;
    if (el.offsetParent === null) return false;
    const rect = el.getBoundingClientRect();
    return rect.height > 4 && rect.width > 4;
  });
  visible.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  const out: UnifiedShelf[] = [];
  const seen = new Set<string>();
  for (const el of visible) {
    const id = el.getAttribute("data-shelfid");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const titleEl = el.querySelector<HTMLElement>(".ds-shelf-title");
    const title = titleEl?.textContent?.trim() || id;
    out.push({ id, title });
  }
  return out;
}

function readNativeRecentsEntry(doc: Document | null, fallbackLabel: string): UnifiedShelf | null {
  if (!doc) return null;
  const el = findNativeRecentsEl(doc);
  if (!el) return null;
  // The actual section title is the row-level heading element. The
  /* `nativeLabelInner` / `nativeLabelOuter` hashed classes target the
     PER-CARD label (focused-card info like "Blasphemous 2 - 30h") and
     would surface the wrong string. When the override is on, the
     patch in `recentsReplace.tsx` rewrites this heading to the source
     shelf title — reading it here keeps both cases correct. */
  const text = el.querySelector<HTMLElement>('h1, h2, h3')?.textContent?.trim() ?? "";
  return { id: NATIVE_RECENTS_ID, title: text && text.length > 0 ? text : fallbackLabel };
}

function findFirstNativeCard(el: HTMLElement, map: Record<string, string>): HTMLElement | null {
  const trySelectors = [
    map.nativeCardFocusable ? `[class~="${map.nativeCardFocusable}"]:not(.ds-card)` : "",
    map.nativeCard ? `[class~="${map.nativeCard}"]:not(.ds-card)` : "",
    'a[href*="/library/app/"]:not(.ds-card)',
    '[data-appid]:not(.ds-card)',
  ].filter(Boolean);
  for (const sel of trySelectors) {
    const c = el.querySelector<HTMLElement>(sel);
    if (c) return c;
  }
  return null;
}

export function focusNativeRecentsFirstCard(doc: Document | null): boolean {
  if (!doc) return false;
  const el = findNativeRecentsEl(doc);
  if (!el) return false;
  const card = findFirstNativeCard(el, getClassMap());
  if (!card) return false;
  try { card.scrollIntoView({ block: "center", inline: "center", behavior: "instant" as ScrollBehavior }); } catch {}
  try { focusElement(card); } catch {}
  return card.classList.contains("gpfocus") || card === card.ownerDocument?.activeElement;
}
