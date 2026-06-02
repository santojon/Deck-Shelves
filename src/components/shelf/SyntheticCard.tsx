import React, { useEffect, useRef, useState } from "react";
import { Focusable, Navigation } from "@decky/ui";
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

// Synthetic card — decoration / placeholder / gap slot.
//
// Content/focus rules (also enforced by ShelfSchema.syntheticCards):
//   - `text` xor `image` (never both)
//   - `link` only when `text` or `image` is set; otherwise no focusable
//     surface and the slot becomes a non-focusable visual gap
//   - `placeholder=true` paints the default card background; false (or
//     unset) leaves the slot transparent
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

  const hasContent = synth.text !== undefined || synth.image !== undefined;
  const focusable = hasContent && !!synth.link;
  const radius = getCachedCardRadius();
  const effW = synth.size === "featured" && featuredW ? featuredW : cardW;
  const cssW = `${effW}px`;
  const cssH = `${cardH}px`;
  const opacity = typeof synth.alpha === "number" ? synth.alpha : 1;

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
    opacity,
  };

  // Placeholder background uses the same flat grey panel as the loading
  // shimmer slot, but without animation — purely a visual marker so the
  // user can see the synthetic card while building the shelf.
  const innerBg: React.CSSProperties = synth.placeholder
    ? { background: "linear-gradient(313deg, rgba(51,51,51,0.55), rgba(85,85,85,0.55))" }
    : { background: "transparent" };

  const inner = (
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
      {synth.image ? (() => {
        // Local paths go through the backend → base64 data URL cache.
        // The first render returns `null` (RPC in flight); the cache
        // subscription above triggers a re-render once the data lands.
        // Remote URLs (http/https/data:) pass through unchanged.
        const resolved = resolveLocalImage(synth.image);
        if (!resolved) return null;
        return (
          <img
            src={resolved}
            alt=""
            draggable={false}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }}
          />
        );
      })() : synth.text ? (
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

  // No link OR no content → non-focusable gap. ShelfRow already gives
  // each slot a fixed width, so an empty wrapper still occupies space
  // and focus skips over it.
  if (!focusable) {
    return (
      <div
        ref={cardRef as any}
        className={`ds-card ds-card--synthetic${synth.placeholder ? "" : " ds-card--synthetic-noshadow"}${nativeCardClass ? ` ${nativeCardClass}` : ""}`}
        style={containerStyle}
        data-ds-synthetic-gap={hasContent ? undefined : "1"}
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
        const raw = String(link.value ?? "").trim();
        if (!raw) return;
        // Coerce bare hosts ("example.com") into https URLs and reject
        // anything that still doesn't look like one — invalid URLs sent
        // to `Navigation.NavigateToExternalWeb` could leave the Big
        // Picture router in a state that broke the home re-mount.
        const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        try { new URL(url); } catch { return; }
        // Prefer SteamClient.System.OpenInSystemBrowser (used by the
        // rest of the plugin for external links — see Shelf.tsx) so the
        // URL opens in the system browser without touching Steam's
        // internal router. NavigateToExternalWeb is a last-resort
        // fallback for builds where the SteamClient bridge is absent.
        const sc: any = (globalThis as any).SteamClient;
        if (typeof sc?.System?.OpenInSystemBrowser === "function") {
          sc.System.OpenInSystemBrowser(url);
          return;
        }
        try { Navigation?.NavigateToExternalWeb?.(url); } catch {}
      } else {
        const appid = Number(link.value);
        if (Number.isFinite(appid)) platform.navigateToApp(appid);
      }
    } catch {}
  };

  // Synthetic cards never go through the native AppContextMenu (they
  // aren't apps). When focusable, bind onMenuButton to our fallback
  // menu so the user gets hide / highlight / add-to-shelf / edit
  // decoration. Non-focusable gaps never receive focus, so no menu.
  const handleMenu = () => {
    try {
      const shelfId = String(item.shelfId ?? "");
      if (!shelfId) return;
      showSyntheticCardMenu(shelfId, cardRef.current, synth?.text);
    } catch {}
  };
  // X (remove) and Y (toggle size) bindings target the synthetic
  // entry by its persisted index — only present on the home shelf
  // (Shelf.tsx forwards `synthetic.index`). Preview / drag mode omits
  // the index and these bindings stay inert.
  const shelfId = String(item.shelfId ?? "");
  const synthIndex = typeof synth.index === "number" ? synth.index : -1;
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
  const canPatchSynth = synthIndex >= 0 && !!shelfId;

  return (
    <Focusable
      ref={cardRef}
      className={`ds-card ds-card--synthetic${nativeCardClass ? ` ${nativeCardClass}` : ""}`}
      focusClassName="gpfocus"
      onActivate={handleActivate}
      onOKButton={handleActivate}
      onMenuButton={handleMenu}
      onMenuActionDescription={i18n.t('card_options')}
      onSecondaryButton={canPatchSynth ? handleRemove : undefined}
      onSecondaryActionDescription={canPatchSynth ? i18n.t('card_remove') : undefined}
      onOptionsButton={canPatchSynth ? handleToggleSize : undefined}
      onOptionsActionDescription={canPatchSynth ? i18n.t('card_synth_toggle_size') : undefined}
      style={containerStyle}
    >
      {inner}
    </Focusable>
  );
}
