import React, { useEffect, useRef, useState } from "react";
import { Focusable, Navigation } from "../../runtime/host/decky";
import i18n from "../../i18n";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { type DeckRowItem, CARD_W, CARD_ART_H } from "./types";
import { getCachedCardRadius } from "./shelfStyles";
import { resolveNativeCardClass, retryWithIntervals } from "./cardUtils";
import { usePlatform } from "../../runtime/platformContext";
import { showSyntheticCardMenu } from "../../core/syntheticCardMenu";
import { resolveLocalImage, subscribeLocalImage } from "../../core/localImage";
import { getCurrentSettings, saveSettings } from "../../store/settingsStore";
import { patchShelfInSettings } from "../../domain/settings";

/* Coerce bare hosts ("example.com") into https URLs and reject anything
   that still doesn't look like one — invalid URLs sent to
   `Navigation.NavigateToExternalWeb` could leave the Big Picture router in
   a state that broke the home re-mount. */
function openExternalUrl(raw: string): void {
  if (!raw) return;
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try { new URL(url); } catch { return; }
  /* Prefer SteamClient.System.OpenInSystemBrowser (used by the rest of the
     plugin for external links — see Shelf.tsx) so the URL opens in the
     system browser without touching Steam's internal router.
     NavigateToExternalWeb is a last-resort fallback for builds where the
     SteamClient bridge is absent. */
  const sc: any = (globalThis as any).SteamClient;
  if (typeof sc?.System?.OpenInSystemBrowser === "function") {
    sc.System.OpenInSystemBrowser(url);
    return;
  }
  try { Navigation?.NavigateToExternalWeb?.(url); } catch {}
}

type Synth = NonNullable<DeckRowItem["synthetic"]>;

// X (remove) and Y (toggle size) only when the entry can be patched by index.
function synthActions(canPatch: boolean, onRemove: () => void, onToggleSize: () => void) {
  if (!canPatch) return {};
  return {
    onSecondaryButton: onRemove,
    onSecondaryActionDescription: i18n.t('card_remove'),
    onOptionsButton: onToggleSize,
    onOptionsActionDescription: i18n.t('card_synth_toggle_size'),
  };
}

// Sizing, opacity and the content/focus facts of a synthetic slot.
function syntheticFrame(synth: Synth, cardW: number, cardH: number, featuredW: number | undefined) {
  const hasContent = synth.text !== undefined || synth.image !== undefined;
  const effW = synth.size === "featured" && featuredW ? featuredW : cardW;
  const focusable = hasContent && !!synth.link;
  const cssW = `${effW}px`;
  const cssH = `${cardH}px`;
  const containerStyle: React.CSSProperties = {
    position: "relative",
    width: cssW,
    minWidth: cssW,
    height: cssH,
    flexShrink: 0,
    padding: 0,
    margin: 0,
    background: "transparent",
    cursor: focusable ? "pointer" : "default",
    overflow: "visible",
    opacity: typeof synth.alpha === "number" ? synth.alpha : 1,
  };
  return { hasContent, focusable, cssW, cssH, containerStyle };
}

// The persisted entry this card can patch (X remove / Y size) — only on the home shelf.
function synthTarget(item: DeckRowItem, synth: Synth) {
  const shelfId = String(item.shelfId ?? "");
  const synthIndex = typeof synth.index === "number" ? synth.index : -1;
  return { shelfId, synthIndex, canPatchSynth: synthIndex >= 0 && !!shelfId };
}

const gapAttr = (hasContent: boolean) => (hasContent ? {} : { "data-ds-synthetic-gap": "1" });

/* Shadow mode rules:
     - non-focusable gap   → never has shadow (no user signal anyway)
     - focusable, default  → "never" (matches the prior `noshadow`)
     - "always"            → keep shadow in idle + focus
     - "onFocus"           → shadow only when focused (suppress at idle) */
function shadowClassFor(synth: Synth, focusable: boolean): string {
  if (!focusable) return " ds-card--synthetic-noshadow";
  const mode = synth.shadowMode ?? "never";
  if (mode === "always") return ""; // baseline card frame shadow
  if (mode === "onFocus") return " ds-card--synthetic-shadow-focus-only";
  return " ds-card--synthetic-noshadow";
}

/* Hero URL exposed via attribute so `PerShelfHero` can pick it up on focus
   and treat this decoration as a hero source — same render path game cards
   already feed via `data-appid`. Empty / undefined → no hero behavior. */
function heroDataProps(synth: Synth): Record<string, string> {
  const hero = synth.heroImage && synth.heroImage.length > 0 ? resolveLocalImage(synth.heroImage) : null;
  return hero ? { "data-ds-hero-url": hero } : {};
}

/* Local image paths go through the backend → base64 data URL cache: the first
   render returns null (RPC in flight) and the cache subscription in the card
   re-renders once the data lands. Remote URLs pass through unchanged.
   `contain` when placeholder=false so transparent PNGs / icons are framed
   whole; `cover` when placeholder=true so the image fills the grey panel. */
function SyntheticImage({ synth }: { synth: Synth }) {
  const resolved = resolveLocalImage(synth.image as string);
  if (!resolved) return null;
  const fit = synth.placeholder ? "cover" : "contain";
  return (
    <img
      src={resolved}
      alt=""
      draggable={false}
      style={{ width: "100%", height: "100%", objectFit: fit, display: "block", pointerEvents: "none" }}
    />
  );
}

/* The card face: the placeholder background (same flat grey panel as the
   loading shimmer slot, without animation — a visual marker while building
   the shelf), then the image or the text. */
function SyntheticInner({ synth, cssW, cssH, radius }: { synth: Synth; cssW: string; cssH: string; radius: number | string }) {
  const innerBg: React.CSSProperties = synth.placeholder
    ? { background: "linear-gradient(313deg, rgba(51,51,51,0.55), rgba(85,85,85,0.55))" }
    : { background: "transparent" };
  return (
    <div
      className="ds-card-art ds-synthetic-card"
      style={{
        position: "absolute",
        inset: 0,
        width: cssW,
        height: cssH,
        overflow: "hidden",
        borderRadius: radius,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        color: "rgba(255,255,255,0.92)",
        ...innerBg,
      }}
    >
      {synth.image ? <SyntheticImage synth={synth} /> : synth.text ? (
        <span
          className="ds-synthetic-text"
          style={{
            font: "600 14px/1.3 'Motiva Sans', Helvetica, Arial, sans-serif",
            textAlign: "center",
            padding: "0 12px",
            whiteSpace: "normal",
            overflowWrap: "anywhere",
          }}
        >
          {synth.text}
        </span>
      ) : null}
    </div>
  );
}

// Synthetic card — decoration / placeholder / gap slot.
//
// Content/focus rules (also enforced by ShelfSchema.syntheticCards):
/*   - `text` xor `image` (never both)
     - `link` only when `text` or `image` is set; otherwise no focusable
       surface and the slot becomes a non-focusable visual gap
     - `placeholder=true` paints the default card background; false (or
       unset) leaves the slot transparent */
export function SyntheticCard({
  item,
  cardW = CARD_W,
  cardH = CARD_ART_H,
  featuredW,
}: {
  item: DeckRowItem;
  cardW?: number;
  cardH?: number;
  featuredW?: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [nativeCardClass, setNativeCardClass] = useState("");
  // Forces a re-render whenever the local-image cache resolves a path
  // the backend RPC was reading. Counter rather than state-of-the-url
  // so multiple cards using the same path all refresh together.
  const [, setImageTick] = useState(0);
  useEffect(() => subscribeLocalImage(() => setImageTick((n) => n + 1)), []);
  const platform = usePlatform();
  const synth = item.synthetic;

  useEffect(() => {
    return retryWithIntervals(() => {
      const cls = resolveNativeCardClass(getPreferredSteamDocument());
      if (cls === null) return false;
      setNativeCardClass(cls);
      return true;
    }, [250, 500, 800, 1200]);
  }, []);

  if (!synth) return null;

  const { hasContent, focusable, cssW, cssH, containerStyle } = syntheticFrame(synth, cardW, cardH, featuredW);
  const inner = <SyntheticInner synth={synth} cssW={cssW} cssH={cssH} radius={getCachedCardRadius()} />;
  const resolveShadowClass = () => shadowClassFor(synth, focusable);

  // No link OR no content → non-focusable gap. ShelfRow already gives
  // each slot a fixed width, so an empty wrapper still occupies space
  // and focus skips over it.
  if (!focusable) {
    return (
      <div
        ref={cardRef as any}
        className={`ds-card ds-card--synthetic${resolveShadowClass()}${nativeCardClass ? ` ${nativeCardClass}` : ""}`}
        style={containerStyle}
        {...gapAttr(hasContent)}
      >
        {inner}
      </div>
    );
  }

  const handleActivate = () => {
    const link = synth.link;
    if (!link) return;
    try {
      if (link.type === "url") {
        openExternalUrl(String(link.value ?? "").trim());
      } else {
        const appid = Number(link.value);
        if (Number.isFinite(appid)) platform.navigateToApp(appid);
      }
    } catch {}
  };

  /* Synthetic cards never go through the native AppContextMenu (they
     aren't apps). When focusable, bind onMenuButton to our fallback
     menu so the user gets hide / highlight / add-to-shelf / edit
     decoration. Non-focusable gaps never receive focus, so no menu. */
  const handleMenu = () => {
    try {
      const shelfId = String(item.shelfId ?? "");
      if (!shelfId) return;
      showSyntheticCardMenu(shelfId, cardRef.current, synth?.text);
    } catch {}
  };
  /* X (remove) and Y (toggle size) bindings target the synthetic
     entry by its persisted index — only present on the home shelf
     (Shelf.tsx forwards `synthetic.index`). Preview / drag mode omits
     the index and these bindings stay inert. */
  const { shelfId, synthIndex, canPatchSynth } = synthTarget(item, synth);
  const handleRemove = () => {
    if (!shelfId || synthIndex < 0) return;
    try {
      const s = getCurrentSettings();
      if (!s) return;
      const sh: any = (s.shelves ?? []).find((row: any) => row.id === shelfId);
      const list: any[] = Array.isArray(sh?.syntheticCards) ? sh.syntheticCards : [];
      if (synthIndex >= list.length) return;
      const next = list.filter((_, i) => i !== synthIndex);
      void saveSettings(patchShelfInSettings(s, shelfId, { syntheticCards: next.length ? next : undefined } as any));
    } catch {}
  };
  const handleToggleSize = () => {
    if (!shelfId || synthIndex < 0) return;
    try {
      const s = getCurrentSettings();
      if (!s) return;
      const sh: any = (s.shelves ?? []).find((row: any) => row.id === shelfId);
      const list: any[] = Array.isArray(sh?.syntheticCards) ? sh.syntheticCards : [];
      if (synthIndex >= list.length) return;
      const next = list.map((c, i) => i === synthIndex
        ? { ...c, size: c?.size === "featured" ? "normal" : "featured" }
        : c);
      void saveSettings(patchShelfInSettings(s, shelfId, { syntheticCards: next } as any));
    } catch {}
  };

  return (
    <Focusable
      ref={cardRef}
      className={`ds-card ds-card--synthetic${resolveShadowClass()}${nativeCardClass ? ` ${nativeCardClass}` : ""}`}
      focusClassName="gpfocus"
      onActivate={handleActivate}
      onOKButton={handleActivate}
      onMenuButton={handleMenu}
      onMenuActionDescription={i18n.t('card_options')}
      {...synthActions(canPatchSynth, handleRemove, handleToggleSize)}
      style={containerStyle}
      {...heroDataProps(synth)}
    >
      {inner}
    </Focusable>
  );
}
