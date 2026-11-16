import { devStamp } from "../../runtime/devStamps";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Focusable, findModule } from "../../runtime/host/decky";
import { getCurrentSettings, subscribeSettings } from "../../settingsStore";
import { getExternalSideMenuProviders, type SideMenuContext, type SideMenuEntry, type SideMenuProviderDescriptor } from "../../core/pluginApi";
import type { Settings, Shelf, SmartShelf } from "../../types";
import { focusElement, focusElementAuto } from "../../core/focusRestore";
import { GamepadButton, dispatchHomeButtonDown, subscribeHomeButton, subscribeHomeKey } from "../../runtime/homeInputBus";
import { createMatcherState, matchEvent, parseCombo, parseRawCombo, resolveBindings } from "../../runtime/buttonBindings";
import { resolveKeyboardBindings, parseKeyCombo, matchKeyEvent, createKeyMatcherState, isEditableKeyTarget } from "../../runtime/keyboardBindings";
import { subscribeControllerInput } from "../../runtime/controllerInput";
import { trackFeature } from "../../steam/usageTracking";
import { isHomeRoute } from "../../components/home/mountUtils";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { evalVisibility } from "../../steam/smartShelves";
import { interleaveSmartShelves, pickFirstVisibleShelfId } from "../../domain/shelfOrder";
import { closeAmbientOverlays, lockOverlay, isOverlayLocked } from "../../runtime/closeOverlays";
import { subscribeSessionState, getSessionState } from "../../runtime/sessionState";
import { flowChildrenProps } from "../../core/steamOSVersion";

type Anchor = {
  shelfId: string;
  focusedAppid: number | null;
};

function sideNavGate(settings: Settings | null): { lightMode: boolean; enabled: boolean } {
  const s = settings as any;
  const lightMode = s?.lightModeEnabled === true;
  return { lightMode, enabled: s?.enabled === true && !lightMode && s?.sideNavEnabled === true };
}

function readGamepadButton(evt: any): number | null {
  try { return evt?.detail?.button ?? null; } catch { return null; }
}

function safeInvoke(obj: any, method: string): void {
  try { obj?.[method]?.(); } catch {}
}

// Steam's listener runs in capture, so preventDefault alone doesn't stop the NavTree.
function absorbGamepadEvent(evt: any): void {
  safeInvoke(evt, "preventDefault");
  safeInvoke(evt, "stopPropagation");
  safeInvoke(evt, "stopImmediatePropagation");
  const inner = evt?.detail?.event;
  safeInvoke(inner, "preventDefault");
  safeInvoke(inner, "stopPropagation");
}

function currentSidenavFocusedElement(panelDoc: Document | null | undefined): HTMLElement | null {
  return panelDoc?.querySelector<HTMLElement>(".ds-sidenav-overlay .gpfocus") ?? (panelDoc?.activeElement as HTMLElement | null) ?? null;
}

function findFocusedRowIndex(keys: string[], rowRefs: Map<string, HTMLDivElement>, focused: HTMLElement | null): number {
  for (let i = 0; i < keys.length; i++) {
    const el = rowRefs.get(keys[i]);
    if (el && focused && (el === focused || el.contains(focused))) return i;
  }
  return -1;
}

function wrapFocusToRow(rowRefs: Map<string, HTMLDivElement>, keys: string[], targetIdx: number, absorb: () => void): void {
  const el = rowRefs.get(keys[targetIdx]);
  if (el) { focusElement(el); absorb(); }
}

// Wrap at the ends instead of letting focus escape into the Home.
function handleVerticalBoundaryWrap(dir: number | null, rowRefs: Map<string, HTMLDivElement>, panelDoc: Document | null | undefined, absorb: () => void): void {
  if (dir !== GamepadButton.DIR_DOWN && dir !== GamepadButton.DIR_UP) return;
  const keys = Array.from(rowRefs.keys());
  if (keys.length === 0) return;
  const curIdx = findFocusedRowIndex(keys, rowRefs, currentSidenavFocusedElement(panelDoc));
  if (dir === GamepadButton.DIR_UP && curIdx === 0) return wrapFocusToRow(rowRefs, keys, keys.length - 1, absorb);
  if (dir === GamepadButton.DIR_DOWN && curIdx === keys.length - 1) return wrapFocusToRow(rowRefs, keys, 0, absorb);
  absorb();
}

export function ShelfSideNav() {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [settings, setSettings] = useState<Settings | null>(() => getCurrentSettings());

  useEffect(() => subscribeSettings(setSettings), []);

  // The Home stays mounted while a game runs, so the listeners pause then.
  const [gameRunning, setGameRunning] = useState(() => getSessionState().gameRunning);
  useEffect(() => subscribeSessionState(() => setGameRunning(getSessionState().gameRunning)), []);

  const { enabled } = sideNavGate(settings);

  const lastOpenAtRef = useRef(0);
  const priorFocusRef = useRef<HTMLElement | null>(null);
  const enabledRef = useRef<boolean>(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      setAnchor(null);
    }
  }, [enabled]);
  useEffect(() => {
    if (gameRunning) setAnchor(null);
  }, [gameRunning]);

  const closeAndRestore = () => {
    const prior = priorFocusRef.current;
    priorFocusRef.current = null;
    setAnchor(null);
    if (prior && prior.isConnected) {
      try { focusElement(prior); } catch {}
    }
  };

  useEffect(() => {
    if (!enabled || gameRunning) return;
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
        devStamp("__ds_sidenav_open", { shelfId, appid, t: now });
        setAnchor({ shelfId, focusedAppid: Number.isFinite(appid) ? (appid as number) : null });
        trackFeature("sidenav");
      })();
    };
    const matcherState = createMatcherState();
    const rawMatcherState = createMatcherState();
    const unsubBtn = subscribeHomeButton((e) => {
      if (!enabledRef.current) return;
      devStamp("__ds_sidenav_last_btn", { b: e.button, t: Date.now() });
      const combo = parseCombo(resolveBindings(getCurrentSettings()?.buttonBindings as any, (getCurrentSettings() as any)?.buttonBindingsDisabled).navSideNav);
      if (matchEvent({ button: e.button }, combo, matcherState)) {
        devStamp("__ds_sidenav_fired", Date.now());
        tryOpen();
      }
    });
    // Decky's button bus only fires while one of our cards has focus, so also listen to the raw stream.
    const unsubRaw = subscribeControllerInput((e) => {
      if (!enabledRef.current || !e.pressed) return;
      const navSideNav = resolveBindings(getCurrentSettings()?.buttonBindings as any, (getCurrentSettings() as any)?.buttonBindingsDisabled).navSideNav;
      if (!navSideNav) return;
      if (matchEvent({ button: e.button }, parseRawCombo(navSideNav), rawMatcherState)) tryOpen();
    });
    const keyMatcherState = createKeyMatcherState();
    const unsubKey = subscribeHomeKey((e) => {
      if (!enabledRef.current || isEditableKeyTarget(e.tag)) return;
      const navSideNavKey = resolveKeyboardBindings(getCurrentSettings()?.keyboardBindings as any, (getCurrentSettings() as any)?.keyboardBindingsDisabled).navSideNav;
      if (!navSideNavKey) return;
      if (matchKeyEvent(e.code ?? null, parseKeyCombo(navSideNavKey), keyMatcherState, Date.now(), { ctrl: e.ctrl, shift: e.shift, alt: e.alt })) tryOpen();
    });
    return () => { unsubBtn(); unsubRaw(); unsubKey(); };
  }, [anchor, enabled, gameRunning]);

  if (!enabled || !anchor || !settings) return null;
  // Rendered inline (no portal) so B closes it through the NavTree.
  return (
    <SideNavShell
      anchor={anchor}
      settings={settings}
      onClose={closeAndRestore}
    />
  );
}

interface UnifiedShelf { id: string; title: string }

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

// BTakeFocus scrolls the Home even for the fixed panel, so restore the scroll position.
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

  // Sorting by on-screen top honours CSS `order`.
  const computedShelves = useMemo(() => {
    const doc = getPreferredSteamDocument();
    // Steam's row is listed whenever it is on screen: its own recent games, or a shelf shown there instead.
    const nativeEntry = readNativeRecentsEntry(doc, t("sidenav_recents_fallback_label"));
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
    settings.recentsReplaceSource,
  ]);

  // Frozen at first paint so late shelves don't shuffle rows under focus.
  const frozenShelvesRef = useRef<UnifiedShelf[] | null>(null);
  if (frozenShelvesRef.current == null && computedShelves.length > 0) {
    frozenShelvesRef.current = computedShelves;
  }
  const orderedShelves: UnifiedShelf[] = frozenShelvesRef.current ?? computedShelves;

  const ctx: SideMenuContext = { shelfId: anchor.shelfId, focusedAppid: anchor.focusedAppid };
  const [pluginEntries, setPluginEntries] = useState<SideMenuEntry[]>([]);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const firstShelfIdRef = useRef<string | null>(null);

  // Plain focus() instead of BTakeFocus, which scrolls the Home for a fixed panel.
  useEffect(() => {
    let cancelled = false;
    const targetId = anchor.shelfId;
    const tryAt = (delay: number) => {
      window.setTimeout(() => {
        if (cancelled) return;
        const el = rowRefs.current.get(targetId)
          ?? (firstShelfIdRef.current ? rowRefs.current.get(firstShelfIdRef.current) : null);
        devStamp("__ds_sidenav_focus", { delay, targetId, found: !!el });
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
    // resolve() may throw synchronously, not just reject.
    const safeResolve = (p: SideMenuProviderDescriptor): Promise<SideMenuEntry[]> => {
      try { return Promise.resolve(p.resolve(ctx)).catch(() => [] as SideMenuEntry[]); }
      catch { return Promise.resolve([] as SideMenuEntry[]); }
    };
    void Promise.all(providers.map(safeResolve))
      .then((lists) => {
        if (!alive) return;
        setPluginEntries(lists.flat());
      });
    return () => { alive = false; };
  }, [anchor.shelfId, anchor.focusedAppid]);

  const jumpToShelf = (shelfId: string) => {
    // The Home lives in the Big Picture document, not this one.
    const doc = getPreferredSteamDocument() ?? document;
    onClose();
    if (shelfId === NATIVE_RECENTS_ID) {
      focusNativeRecentsFirstCard(doc, false);
      return;
    }
    const target = doc.querySelector<HTMLElement>(
      `[data-shelfid="${cssEscape(shelfId)}"] [data-ds-card-index="0"]`,
    );
    if (target) {
      try { focusElement(target); } catch {}
    }
  };

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
        {...flowChildrenProps("vertical")}
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
          const absorb = () => absorbGamepadEvent(evt);
          const dir = readGamepadButton(evt);
          try {
            if (dir === GamepadButton.DIR_RIGHT) { absorb(); onClose(); return; }
          } catch {}
          try {
            handleVerticalBoundaryWrap(dir, rowRefs.current, panelRef.current?.ownerDocument, absorb);
          } catch {}
        }}
        onSecondaryActionDescription={t("close" as any) || "Close"}
        onClick={(e: any) => e.stopPropagation()}
        style={{
          width: "clamp(180px, 22vw, 280px)",
          marginLeft: 0,
          maxHeight: "78vh",
          display: "flex",
          flexDirection: "column",
          gap: 0,
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
                // preferredFocus would scroll the Home; the restore effect drives focus instead.
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
                  try { void Promise.resolve(entry.onActivate()).catch(() => {}); } catch {}
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

type PageListClasses = { item: string; scaled: string; title: string; icon: string };
let pageListClasses: PageListClasses | null | undefined;

// Steam's own Settings list classes: the client draws focus, hover and scale, and themes that restyle that list reach these rows.
function steamPageListClasses(): PageListClasses | null {
  if (pageListClasses !== undefined) return pageListClasses;
  pageListClasses = null;
  try {
    const m: any = findModule((mod: any) => typeof mod?.PagedSettingsDialog_PageListItem === "string" && typeof mod?.ScaledChildren === "string" && "EnterActive" in mod);
    if (m) pageListClasses = { item: m.PagedSettingsDialog_PageListItem, scaled: m.ScaledChildren, title: m.PageListItem_Title ?? "", icon: m.PageListItem_Icon ?? "" };
  } catch {}
  return pageListClasses;
}

// Without the client's classes, the same look inline: the accent fading from the left edge with a 2 px bar.
function fallbackRowStyle(focused: boolean): React.CSSProperties {
  return {
    padding: "10px calc(12px + 1.4vw)",
    color: focused ? "white" : "rgb(184, 188, 191)",
    borderLeft: `2px solid ${focused ? "rgb(26, 159, 255)" : "transparent"}`,
    background: focused ? "linear-gradient(90deg, rgba(26, 159, 255, 0.4) 0%, rgba(26, 159, 255, 0) 100%)" : "transparent",
  };
}

function buttonRowStyle(focused: boolean, disabled: boolean, steamClasses: boolean): React.CSSProperties {
  return {
    ...(steamClasses ? {} : fallbackRowStyle(focused)),
    opacity: disabled ? 0.45 : 1,
    cursor: disabled ? "default" : "pointer",
  };
}

function buttonContentStyle(focused: boolean, steamClasses: boolean): React.CSSProperties {
  const scale = !steamClasses && focused ? { transform: "scale(1.1)", transformOrigin: "12% 50%" } : {};
  return { display: "flex", alignItems: "center", gap: "0.5em", minWidth: 0, ...scale };
}

// The shelf on screen only reads brighter and heavier; the accent belongs to the focused row.
function buttonLabelStyle(active: boolean): React.CSSProperties {
  return {
    fontWeight: active ? 700 : undefined,
    color: active ? "white" : undefined,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
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
  const steam = steamPageListClasses();
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
  // Inline because the QAM stylesheet isn't mounted on the Home.
  return (
    <Focusable
      ref={ref}
      noFocusRing
      className={steam?.item}
      preferredFocus={preferredFocus}
      onClick={handle}
      onOKButton={handle}
      onActivate={handle}
      onGamepadFocus={armTimer}
      onGamepadBlur={clearTimer}
      style={buttonRowStyle(!!focused, !!disabled, !!steam)}
    >
      <div className={steam?.scaled} style={buttonContentStyle(!!focused, !!steam)}>
        {icon ? <span className={steam?.icon} style={{ display: "inline-flex" }}>{icon as React.ReactNode}</span> : null}
        <span className={steam?.title} style={buttonLabelStyle(active)}>{label}</span>
      </div>
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
  const g = globalThis as unknown as { CSS?: { escape?: (s: string) => string } };
  if (typeof g.CSS?.escape === "function") return g.CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

const NATIVE_RECENTS_ID = "__ds_native_recents__";

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
  // Our wrappers reuse the native container class, so skip those inside our root.
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
  devStamp("__ds_native_probe", best ? { found: true, top: Math.round(best.getBoundingClientRect().top), candidates: candidates.length } : { found: false, candidates: candidates.length });
  return best;
}

function readVisibleShelvesFromDom(): UnifiedShelf[] {
  const doc = getPreferredSteamDocument();
  if (!doc) return [];
  const root = doc.querySelector<HTMLElement>(".deck-shelves-root");
  const scope = root ?? doc;
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
  if (!el || el.offsetParent === null || el.getBoundingClientRect().height <= 4) return null;
  // The hashed label classes hold the per-card label, so read the row heading.
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

// With `auto`, don't take over a Home owned by a game or another page.
export function focusNativeRecentsFirstCard(doc: Document | null, auto = true): boolean {
  if (!doc) return false;
  const el = findNativeRecentsEl(doc);
  if (!el) return false;
  const card = findFirstNativeCard(el, getClassMap());
  if (!card) return false;
  try { card.scrollIntoView({ block: "center", inline: "center", behavior: "instant" as ScrollBehavior }); } catch {}
  try { (auto ? focusElementAuto : focusElement)(card); } catch {}
  return card.classList.contains("gpfocus") || card === card.ownerDocument?.activeElement;
}

export function nativeRecentsHoldsFocus(doc: Document): boolean {
  const focused = doc.querySelector<HTMLElement>(".gpfocus") ?? (doc.activeElement as HTMLElement | null);
  if (!focused || focused === doc.body) return false;
  return !!findNativeRecentsEl(doc)?.contains(focused);
}
