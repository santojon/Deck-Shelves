import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Focusable } from "../../runtime/host/decky";
import { getCurrentSettings, subscribeSettings } from "../../settingsStore";
import { getExternalSideMenuProviders, type SideMenuContext, type SideMenuEntry } from "../../core/pluginApi";
import type { Settings, Shelf, SmartShelf } from "../../types";
import { focusElement } from "../../core/focusRestore";
import { GamepadButton, dispatchHomeButtonDown, subscribeHomeButton } from "../../runtime/homeInputBus";
import { isHomeRoute } from "../../components/home/mountUtils";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { isInVisibilityWindow } from "../../steam/smartShelves";
import { interleaveSmartShelves, pickFirstVisibleShelfId } from "../../domain/shelfOrder";
import { forwardRef } from "react";

type Anchor = {
  shelfId: string;
  focusedAppid: number | null;
};

/**
 * Side-nav overlay — opens when the user presses dpad-left (ArrowLeft)
 * on the FIRST card of any shelf. Lists every visible shelf so the user
 * can jump straight to one; plugins can contribute extra rows via
 * `registerSideMenuProvider`.
 *
 * Mount once near the home root. The listener is global but bails when
 * the focused element isn't a `[data-ds-card-index="0"]` card under the
 * home root, so it's a no-op everywhere else.
 */
export function ShelfSideNav() {
  try { (globalThis as any).__ds_sidenav_mounted = (((globalThis as any).__ds_sidenav_mounted ?? 0) + 1); } catch {}
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [settings, setSettings] = useState<Settings | null>(() => getCurrentSettings());

  useEffect(() => subscribeSettings(setSettings), []);

  const enabled = (settings as any)?.sideNavEnabled === true;

  const lastFirstCardRef = useRef<{ shelfId: string; appid: number | null } | null>(null);
  const priorFocusRef = useRef<HTMLElement | null>(null);
  const lastL1AtRef = useRef<number>(0);
  // Runtime gate read inside the bus listener — even if the listener
  // somehow survives an effect cleanup race, this ref always reflects
  // the LATEST toggle state, so a disabled sidenav can't open.
  const enabledRef = useRef<boolean>(enabled);
  useEffect(() => {
    enabledRef.current = enabled;
    if (!enabled) {
      lastL1AtRef.current = 0;
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

  useEffect(() => {
    try { (globalThis as any).__ds_sidenav_enabled = enabled; } catch {}
    if (!enabled) return;
    const tryOpen = () => {
      if (anchor) return;
      if (!isHomeRoute()) return;
      // Read CURRENT shelf from the DOM at open time (most reliable).
      // The previous `lastFirstCardRef` path was stale when focus moved
      // without our MutationObserver catching the class flip.
      let shelfId: string | null = null;
      let appid: number | null = null;
      try {
        const doc = getPreferredSteamDocument() ?? document;
        const focused = doc.querySelector<HTMLElement>(".gpfocus[data-appid]");
        if (focused) {
          const card = focused.closest<HTMLElement>(".ds-card");
          const ap = focused.getAttribute("data-appid") ?? card?.getAttribute("data-appid");
          appid = ap ? Number(ap) : null;
          // Walk up to the SHELF container — cards also carry
          // data-shelfid, but `.closest('.ds-shelf')` lands on the
          // wrapper which is what `orderedShelves` keys off.
          const shelfEl = (card ?? focused).closest<HTMLElement>(".ds-shelf[data-shelfid]");
          shelfId = shelfEl?.getAttribute("data-shelfid") ?? null;
        }
        if (!shelfId) {
          const firstShelf = doc.querySelector<HTMLElement>(".ds-shelf[data-shelfid]");
          shelfId = firstShelf?.getAttribute("data-shelfid") ?? null;
        }
      } catch {}
      if (!shelfId) {
        // Settings fallback as last resort.
        const s = getCurrentSettings();
        const visibleRegular = (s?.shelves ?? []).filter((x: any) => x.enabled && !x.hidden);
        const visibleSmart = s?.smartShelvesEnabled
          ? (s?.smartShelves ?? []).filter((x: any) =>
              x.enabled !== false && !x.hidden && isInVisibilityWindow(x.visibleHours, x.visibleDaysOfWeek),
            )
          : [];
        if (visibleRegular.length > 0) shelfId = visibleRegular[0].id;
        else if (visibleSmart.length > 0) shelfId = visibleSmart[0].id;
      }
      if (!shelfId) return;
      try { (globalThis as any).__ds_sidenav_open = { shelfId, appid, t: Date.now() }; } catch {}
      setAnchor({ shelfId, focusedAppid: Number.isFinite(appid) ? appid : null });
    };
    // ONLY trigger: L1 pressed twice within 300 ms. `lastL1AtRef` is a
    // ref so the timestamp survives effect re-runs. Runtime-gated by
    // `enabledRef` so a stale subscription can never open a disabled
    // sidenav.
    const unsubBtn = subscribeHomeButton((e) => {
      if (!enabledRef.current) return;
      try { (globalThis as any).__ds_sidenav_last_btn = { b: e.button, t: Date.now() }; } catch {}
      if (e.button !== GamepadButton.BUMPER_LEFT) return;
      const now = Date.now();
      if (lastL1AtRef.current && (now - lastL1AtRef.current) <= 300) {
        lastL1AtRef.current = 0;
        try { (globalThis as any).__ds_sidenav_fired = now; } catch {}
        tryOpen();
        return;
      }
      lastL1AtRef.current = now;
    });
    return () => { unsubBtn(); };
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

function SideNavShell({ anchor, settings, onClose }: { anchor: Anchor; settings: Settings; onClose: () => void }) {
  const { t } = useTranslation();

  // Source of truth: the actual rendered DOM. Sorting by visual `top`
  // honours CSS `order` (interleave), and the data-shelfid filter limits
  // us to DS shelves currently mounted on the home — so we list EXACTLY
  // what the user sees, in the order they see it. Falls back to a
  // settings-derived list if the BP DOM isn't readable yet.
  const orderedShelves: UnifiedShelf[] = useMemo(() => {
    const fromDom = readVisibleShelvesFromDom();
    if (fromDom.length > 0) return fromDom;
    const regulars = (settings.shelves ?? []).filter((s: Shelf) => s.enabled && !s.hidden);
    const smart = settings.smartShelvesEnabled
      ? (settings.smartShelves ?? []).filter((s: SmartShelf) =>
          (s as any).enabled !== false && !(s as any).hidden
          && isInVisibilityWindow((s as any).visibleHours, (s as any).visibleDaysOfWeek),
        )
      : [];
    const normalFirst = settings.smartShelvesAtBottom
      || settings.hideRecents === true;
    const combined: any[] = normalFirst
      ? [...regulars, ...smart]
      : [...smart, ...regulars];
    const interleave = settings.hideRecents === true && !settings.smartShelvesAtBottom;
    const firstVisible = pickFirstVisibleShelfId(combined as any, new Set<string>()) ?? combined[0]?.id ?? null;
    const ordered = interleave ? interleaveSmartShelves(combined as any, firstVisible) : combined;
    return (ordered as any[]).map((s) => ({ id: s.id, title: s.title || "—" }));
  }, [
    anchor.shelfId,
    settings.shelves,
    settings.smartShelves,
    settings.smartShelvesEnabled,
    settings.smartShelvesAtBottom,
    settings.hideRecents,
  ]);

  const ctx: SideMenuContext = { shelfId: anchor.shelfId, focusedAppid: anchor.focusedAppid };
  const [pluginEntries, setPluginEntries] = useState<SideMenuEntry[]>([]);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Map of shelfId → row element. A callback ref attached to every row
  // populates this; the focus effect looks up by anchor.shelfId. Robust
  // when the current shelf IS the first (the previous conditional ref
  // double-attribution left firstBtnRef empty in that case).
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const firstShelfIdRef = useRef<string | null>(null);

  // Push NavTree focus into the user's current shelf row (or the first
  // row as fallback) after Steam settles the new Focusable tree.
  // Retries because the panel's `preferredFocus={true}` puts focus on
  // the first row immediately — our override needs to land AFTER Steam
  // indexes the rows into the NavTree, otherwise BTakeFocus no-ops and
  // the user stays on row 0.
  useEffect(() => {
    let cancelled = false;
    const targetId = anchor.shelfId;
    const tryAt = (delay: number, attempt: number) => {
      window.setTimeout(() => {
        if (cancelled) return;
        const el = rowRefs.current.get(targetId)
          ?? (firstShelfIdRef.current ? rowRefs.current.get(firstShelfIdRef.current) : null);
        const hit = rowRefs.current.has(targetId);
        try { (globalThis as any).__ds_sidenav_focus = { attempt, delay, targetId, hit, keys: Array.from(rowRefs.current.keys()) }; } catch {}
        if (!el) return;
        try { focusElement(el); } catch {}
      }, delay);
    };
    tryAt(80, 1);
    tryAt(200, 2);
    tryAt(400, 3);
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
    const target = doc.querySelector<HTMLElement>(
      `[data-shelfid="${cssEscape(shelfId)}"] [data-ds-card-index="0"]`,
    );
    onClose();
    if (target) {
      try { focusElement(target); } catch {}
    }
  };

  return (
    <div
      className="ds-sidenav-overlay"
      onClick={onClose}
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
          try { dispatchHomeButtonDown(evt); } catch {}
          try {
            if (evt?.detail?.button === GamepadButton.CANCEL) onClose();
          } catch {}
        }}
        onGamepadDirection={(evt: any) => {
          // Right exits the panel — close so the overlay doesn't
          // linger; the priorFocus restore path puts focus back on the
          // shelf card the user came from.
          try {
            if (evt?.detail?.button === GamepadButton.DIR_RIGHT) onClose();
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
                // Steam NavTree honours per-child preferredFocus and
                // lands focus on it instead of the panel's first child.
                // Fallback to the first row if the anchor isn't in the
                // visible list.
                preferredFocus={isCurrent}
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
