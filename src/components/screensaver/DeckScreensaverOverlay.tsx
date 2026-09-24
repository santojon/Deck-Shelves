import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { getCurrentSettings, subscribeSettings } from "../../store/settingsStore";
import { subscribeControllerInput } from "../../runtime/controllerInput";
import { getHeroUrls, getLogoUrls } from "../../core/steamAssets";
import { getHotCachedImageSrc } from "../../core/imageCache";
import { getAppDescriptions, preloadAppDescriptions } from "../../steam/appDescriptionsCache";
import {
  buildScreensaverPool, getStartAfterSeconds, getDwellSeconds, isQamOrMenuOpen, closeQamOrMenu,
  type ScreensaverItem,
} from "../../runtime/screensaverInject";
import { isNativeScreensaverActive } from "../../runtime/showcaseMode";
import type { Settings } from "../../types";

const IDLE_CHECK_MS = 1000;
const BASE_LOGO_WIDTH_PCT = 38;
const BASE_LOGO_HEIGHT_PCT = 22;

function isFeatureEnabled(settings: Settings | null): boolean {
  return (settings as any)?.screensaverShelvesEnabled === true;
}

/* Real candidate URLs, not `firstCacheableUrl` — that helper excludes
   local/loopback URLs on purpose (it's for the blob cache warmer, not
   "what to show first"); using it here skipped to external CDN
   fallbacks, which is exactly what caused broken images. */
function backgroundCandidates(item: ScreensaverItem): string[] {
  return item.type === "screenshot" ? [item.url] : getHeroUrls(item.appid);
}

function resolveTargetBody(anchorEl: HTMLElement | null): HTMLElement | null {
  return anchorEl?.ownerDocument?.body ?? (typeof document !== "undefined" ? document.body : null);
}

type LogoPosition = "left" | "center" | "right";

function getLogoConfig(settings: Settings | null): {
  enabled: boolean; scale: number; position: LogoPosition; atTop: boolean; offsetPct: number; onScreenshots: boolean;
} {
  const s = settings as any;
  return {
    enabled: s?.screensaverLogoEnabled !== false,
    scale: (s?.screensaverLogoSize ?? 100) / 100,
    position: (s?.screensaverLogoPosition ?? "left") as LogoPosition,
    atTop: s?.screensaverLogoAtTop === true,
    offsetPct: s?.screensaverLogoOffset ?? 8,
    onScreenshots: s?.screensaverLogoOnScreenshots !== false,
  };
}

// Mirrors PerShelfHero.tsx's own logo-overlay placement (left/center/right +
// an edge offset), plus a top/bottom anchor the hero overlay doesn't need.
function logoPlacementStyle(position: LogoPosition, atTop: boolean, offsetPct: number): CSSProperties {
  const edge = `${offsetPct}%`;
  return {
    left: position === "left" ? edge : position === "right" ? "auto" : "50%",
    right: position === "right" ? edge : "auto",
    transform: position === "center" ? "translateX(-50%)" : undefined,
    top: atTop ? edge : "auto",
    bottom: atTop ? "auto" : edge,
  };
}

// Un-positioned — the caller anchors the group (logo + optional description)
// as a single flex column via logoPlacementStyle on a shared wrapper.
function LogoImage({ appid, scale }: { appid: number; scale: number }) {
  const urls = getLogoUrls(appid);
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [appid]);
  if (idx >= urls.length) return null;
  const url = urls[idx];
  const src = getHotCachedImageSrc(url) || url;
  return (
    <img
      src={src}
      onError={() => setIdx((i) => i + 1)}
      style={{
        display: "block",
        maxWidth: `${BASE_LOGO_WIDTH_PCT * scale}%`,
        maxHeight: `${BASE_LOGO_HEIGHT_PCT * scale}%`,
        objectFit: "contain",
        filter: "drop-shadow(0 2px 10px rgba(0,0,0,0.6))",
      }}
    />
  );
}

function getDescriptionConfig(settings: Settings | null): { enabled: boolean; aboveLogo: boolean; gapPx: number } {
  const s = settings as any;
  return {
    enabled: s?.screensaverDescriptionEnabled === true,
    aboveLogo: s?.screensaverDescriptionAboveLogo === true,
    gapPx: s?.screensaverDescriptionLogoGap ?? 10,
  };
}

// Mirrors PerShelfHero.tsx's own logo-overlay description text (snippet,
// 3-line clamp, same polling fetch via appDescriptionsCache).
function DescriptionText({ appid, gapPx, isAbove }: { appid: number; gapPx: number; isAbove: boolean }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    setText(null);
    preloadAppDescriptions(appid);
    const tick = (): boolean => {
      const d = getAppDescriptions(appid);
      if (d?.snippet) { setText(d.snippet); return true; }
      return false;
    };
    if (tick()) return;
    const id = window.setInterval(() => { if (tick()) window.clearInterval(id); }, 400);
    const stop = window.setTimeout(() => window.clearInterval(id), 6000);
    return () => { window.clearInterval(id); window.clearTimeout(stop); };
  }, [appid]);
  if (!text) return null;
  return (
    <div
      style={{
        marginTop: isAbove ? 0 : gapPx,
        marginBottom: isAbove ? gapPx : 0,
        maxWidth: "min(60vw, 700px)",
        fontSize: "1.15em",
        lineHeight: 1.35,
        color: "rgba(255,255,255,0.85)",
        textShadow: "0 2px 8px rgba(0,0,0,0.7)",
        display: "-webkit-box",
        WebkitBoxOrient: "vertical" as any,
        WebkitLineClamp: 3,
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {text}
    </div>
  );
}

function logoGroupAlign(position: LogoPosition): CSSProperties["alignItems"] {
  return position === "left" ? "flex-start" : position === "right" ? "flex-end" : "center";
}

/* Cycles through every real candidate URL (loopback/custom-art first,
   external CDN last) via onError, matching PerShelfHero.tsx's own
   fallback pattern. Calls `onExhausted` once every candidate has failed,
   so the parent can skip to the next pool item instead of showing
   nothing (or a broken image) for the rest of the dwell time. */
function Slide({ item, logoEnabled, logoOnScreenshots, logoScale, logoPosition, logoAtTop, logoOffsetPct, descEnabled, descAboveLogo, descGapPx, onExhausted }: {
  item: ScreensaverItem; logoEnabled: boolean; logoOnScreenshots: boolean; logoScale: number;
  logoPosition: LogoPosition; logoAtTop: boolean; logoOffsetPct: number;
  descEnabled: boolean; descAboveLogo: boolean; descGapPx: number; onExhausted: () => void;
}) {
  const urls = backgroundCandidates(item);
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [item]);
  useEffect(() => { if (idx >= urls.length) onExhausted(); }, [idx, urls.length, onExhausted]);
  if (idx >= urls.length) return null;
  const url = urls[idx];
  const src = getHotCachedImageSrc(url) || url;
  // Screenshots carry a real appid too (Steam's own screenshot rows always
  // include nAppID — see screenshotRowToItem), gated by its own toggle.
  const showLogo = logoEnabled && (item.type !== "screenshot" || logoOnScreenshots);
  return (
    <div style={{ position: "absolute", inset: 0, animation: "ds-screensaver-fade 900ms ease-in-out" }}>
      <img
        src={src}
        onError={() => setIdx((i) => i + 1)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />
      {showLogo && (
        <div
          style={{
            position: "absolute", display: "flex", flexDirection: "column",
            alignItems: logoGroupAlign(logoPosition),
            ...logoPlacementStyle(logoPosition, logoAtTop, logoOffsetPct),
          }}
        >
          {descEnabled && descAboveLogo && <DescriptionText appid={item.appid} gapPx={descGapPx} isAbove />}
          <LogoImage appid={item.appid} scale={logoScale} />
          {descEnabled && !descAboveLogo && <DescriptionText appid={item.appid} gapPx={descGapPx} isAbove={false} />}
        </div>
      )}
    </div>
  );
}

/* Deck Shelves' own idle screensaver, portaled to the real document.body
   (Steam's ancestor CSS transforms would otherwise size `position:fixed`
   against them, not the true screen). QAM/menu is a separate OS window
   our z-index can't out-rank, so idle-trigger closes it first. */
export function DeckScreensaverOverlay() {
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [enabled, setEnabled] = useState(() => isFeatureEnabled(getCurrentSettings()));
  const [active, setActive] = useState(false);
  const [suppressed, setSuppressed] = useState(false);
  const [pool, setPool] = useState<ScreensaverItem[]>([]);
  const [index, setIndex] = useState(0);
  const lastActivityRef = useRef(Date.now());
  const activeRef = useRef(false);
  activeRef.current = active;
  // Survives a wake→idle-again cycle so a re-trigger resumes instead of
  // restarting — updated on every index change, read (not reset) when the
  // pool rebuilds on re-activation.
  const indexRef = useRef(0);
  indexRef.current = index;
  // Every item in the current pool failed in a row — stop instead of
  // spinning through a fully-broken/offline pool forever.
  const brokenStreakRef = useRef(0);

  useEffect(() => subscribeSettings((s) => setEnabled(isFeatureEnabled(s))), []);

  const wake = () => {
    lastActivityRef.current = Date.now();
    if (activeRef.current) setActive(false);
  };

  const advanceOrGiveUp = useCallback(() => {
    brokenStreakRef.current += 1;
    if (brokenStreakRef.current > pool.length) { setActive(false); return; }
    setIndex((i) => (pool.length > 1 ? (i + 1) % pool.length : i));
  }, [pool.length]);

  useEffect(() => {
    if (!enabled) { setActive(false); return; }
    // Real mouse/keyboard activity only lands on Home's own document (the
    // anchor's ownerDocument) — this component's code runs in
    // SharedJSContext, whose own bare `document` never receives them.
    const doc = anchorRef.current?.ownerDocument ?? document;
    doc.addEventListener("mousemove", wake);
    doc.addEventListener("mousedown", wake);
    doc.addEventListener("keydown", wake); // deck-shelves: idle-wake only, never preventDefault/stopPropagation
    doc.addEventListener("wheel", wake);
    const unsubInput = subscribeControllerInput((e) => { if (e.pressed) wake(); });
    const idleCheck = window.setInterval(() => {
      const qamOpen = isQamOrMenuOpen();
      const nativeActive = isNativeScreensaverActive();
      const elapsedMs = Date.now() - lastActivityRef.current;
      const thresholdSec = getStartAfterSeconds(getCurrentSettings());
      /* Belt-and-suspenders against Steam's own native idle screensaver —
         disabling its timer already keeps it from triggering, but stand
         down instead of doubling up if it's somehow active anyway (same
         ScreensaverPopup check showcaseMode.ts already relies on). */
      if (nativeActive) { setActive(false); return; }
      if (activeRef.current) { setSuppressed(qamOpen); return; }
      if (elapsedMs < thresholdSec * 1000) return;
      if (qamOpen) { closeQamOrMenu(); setSuppressed(true); return; }
      setSuppressed(false);
      void buildScreensaverPool(getCurrentSettings()).then((items) => {
        if (!items.length) return;
        brokenStreakRef.current = 0;
        setPool(items);
        // Resume from the last position instead of restarting (clamped —
        // the resolved pool's size can differ run to run).
        setIndex(indexRef.current % items.length);
        setActive(true);
      });
    }, IDLE_CHECK_MS);
    return () => {
      doc.removeEventListener("mousemove", wake);
      doc.removeEventListener("mousedown", wake);
      doc.removeEventListener("keydown", wake);
      doc.removeEventListener("wheel", wake);
      unsubInput();
      window.clearInterval(idleCheck);
    };
  }, [enabled]);

  useEffect(() => {
    if (!active || pool.length < 2) return;
    const dwellMs = getDwellSeconds(getCurrentSettings()) * 1000;
    const timer = window.setInterval(() => { brokenStreakRef.current = 0; setIndex((i) => (i + 1) % pool.length); }, dwellMs);
    return () => window.clearInterval(timer);
  }, [active, pool.length]);

  // Always render the (invisible) anchor so its ownerDocument is available
  // the instant the screensaver needs to portal — never skip this mount.
  const anchor = <span ref={anchorRef} style={{ display: "none" }} />;
  if (!enabled || !active || suppressed || !pool.length) return anchor;
  const targetBody = resolveTargetBody(anchorRef.current);
  if (!targetBody) return anchor;

  const { enabled: logoEnabled, scale: logoScale, position: logoPosition, atTop: logoAtTop, offsetPct: logoOffsetPct, onScreenshots: logoOnScreenshots } = getLogoConfig(getCurrentSettings());
  const { enabled: descEnabled, aboveLogo: descAboveLogo, gapPx: descGapPx } = getDescriptionConfig(getCurrentSettings());

  return (
    <>
      {anchor}
      {createPortal(
        <div
          onClick={wake}
          style={{ position: "fixed", inset: 0, zIndex: 999999, background: "#000", overflow: "hidden" }}
        >
          <Slide key={`${pool[index].type}-${index}`} item={pool[index]} logoEnabled={logoEnabled} logoOnScreenshots={logoOnScreenshots} logoScale={logoScale} logoPosition={logoPosition} logoAtTop={logoAtTop} logoOffsetPct={logoOffsetPct} descEnabled={descEnabled} descAboveLogo={descAboveLogo} descGapPx={descGapPx} onExhausted={advanceOrGiveUp} />
          <style>{`@keyframes ds-screensaver-fade { from { opacity: 0; } to { opacity: 1; } }`}</style>
        </div>,
        targetBody,
      )}
    </>
  );
}
