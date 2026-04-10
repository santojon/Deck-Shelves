import { useEffect, useState, useRef } from "react";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { logInfo } from "../../runtime/logger";

function getHeroUrls(appid: number): string[] {
  return [
    `/customimages/${appid}_hero.png`,
    `/customimages/${appid}_hero.jpg`,
    `/assets/${appid}/library_hero.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/library_hero.jpg`,
    `/assets/${appid}/header.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
  ];
}

// ── Native hero structure (discovered via CDP on SteamOS 3.8) ──
//
// [0] IMG   — filter: grayscale(1) contrast(1), animation: 0.3s fade-in,
//             object-fit: cover, transition: transform 0.5s / opacity 0.5s
// [1] DIV   — position: absolute, animation: 25s ease alternate (slow zoom)
// [2] DIV   — position: absolute, z-index: 0,
//             mask-image: radial-gradient(75% 83% at 50% 18%, black 0%, rgba(0,0,0,0.6) 76%, transparent 100%)
// [3] DIV   — position: absolute, z-index: 0, same mask-image (double mask)
// [4] DIV   — position: relative, padding-top: 54px, Panel Focusable
//
// Key findings:
// - NO linear-gradient overlays or ::after pseudo-elements for fade
// - The fade is achieved via radial-gradient mask-image on TWO wrapper divs
// - The image uses grayscale(1) + contrast(1) as default filter
// - The zoom is a 25s single-alternate animation on the zoom container
// - Viewport size: 854×396 (hero) inside 854×534 (screen)

/** Classes and computed styles discovered from the native recents hero DOM. */
type NativeHeroClasses = {
  imgClass: string;
  zoomContainerClass: string;
  wrapperClasses: string[];
  zoomAnimation: string;
  imgFilter: string;
  imgTransition: string;
  /** Native mask-image from wrapper divs */
  maskImage: string;
};

/** Native radial-gradient mask that creates the vignette/fade effect */
const NATIVE_MASK =
  "radial-gradient(75% 83% at 50% 18%, rgb(0, 0, 0) 0%, rgba(0, 0, 0, 0.6) 76%, rgba(0, 0, 0, 0) 100%)";

/** Inject keyframes once for the native-matching slow zoom */
const ZOOM_STYLE_ID = "ds-hero-zoom-keyframes";
function ensureZoomKeyframes(doc: Document) {
  if (doc.getElementById(ZOOM_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = ZOOM_STYLE_ID;
  style.textContent = `
    @keyframes ds-hero-zoom {
      0% { transform: scale(1); }
      100% { transform: scale(1.08); }
    }
    @keyframes ds-hero-img-fadein {
      from { opacity: 0; filter: grayscale(1) contrast(1); }
      to   { opacity: 1; filter: grayscale(1) contrast(1); }
    }
  `;
  doc.head.appendChild(style);
}

export function HeroBackground({ mountEl }: { mountEl: HTMLElement }) {
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const prevHero = useRef<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [nativeClasses, setNativeClasses] = useState<NativeHeroClasses | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fallbackIdx = useRef(0);
  const currentAppid = useRef(0);
  const allUrls = useRef<string[]>([]);

  // Discover native hero classes + computed styles from the recents section
  useEffect(() => {
    const doc = getPreferredSteamDocument();
    if (doc) ensureZoomKeyframes(doc);

    const discover = () => {
      if (!doc) return;
      const prev = mountEl.previousElementSibling as HTMLElement | null;
      if (!prev) return;
      const imgs = Array.from(prev.querySelectorAll('img'));
      for (const img of imgs) {
        const classes = Array.from(img.classList);
        const r = img.getBoundingClientRect();
        if ((r.width > 400 && r.height > 200) || classes.length >= 4) {
          const imgClass = Array.from(img.classList).join(' ');
          const zoomContainer = img.parentElement;
          if (!zoomContainer) continue;
          const zoomContainerClass = Array.from(zoomContainer.classList).join(' ');
          const wrapperClasses: string[] = [];
          let maskImage = "";
          let el = zoomContainer.parentElement;
          for (let i = 0; i < 4 && el && el !== prev; i++) {
            if (el.classList.contains('Focusable') || el.classList.contains('Panel')) break;
            wrapperClasses.push(Array.from(el.classList).join(' '));
            // Capture mask-image from wrappers (native uses radial-gradient)
            if (!maskImage) {
              try {
                const cs = getComputedStyle(el);
                const m = (cs as any).maskImage || (cs as any).webkitMaskImage || "";
                if (m && m !== "none") maskImage = m;
              } catch {}
            }
            el = el.parentElement;
          }
          let zoomAnimation = "";
          let imgFilter = "";
          let imgTransition = "";
          try {
            const csImg = getComputedStyle(img as Element);
            const csZoom = getComputedStyle(zoomContainer as Element);
            zoomAnimation = csZoom.animation || "";
            imgFilter = csImg.filter || "";
            imgTransition = csImg.transition || "";
            logInfo("HOME", "HeroBackground: native styles captured", {
              imgClass: imgClass.substring(0, 40),
              zoomAnimation: zoomAnimation.substring(0, 60),
              imgFilter,
              maskImage: maskImage.substring(0, 80),
            });
          } catch (e) { logInfo("HOME", "HeroBackground: computedStyle capture failed", String(e)); }
          setNativeClasses({ imgClass, zoomContainerClass, wrapperClasses, zoomAnimation, imgFilter, imgTransition, maskImage });
          return;
        }
      }
    };
    discover();
    const t = setTimeout(discover, 2000);
    return () => clearTimeout(t);
  }, [mountEl]);

  useEffect(() => {
    const updateHero = () => {
      const firstShelf = mountEl.querySelector('.ds-shelf');
      if (!firstShelf) return;
      const focused = firstShelf.querySelector('.ds-card.gpfocus, .ds-card:focus') as HTMLElement | null;
      if (!focused) return;
      const appid = Number(focused.getAttribute('data-appid') ?? 0);
      if (appid <= 0) return;
      if (appid !== currentAppid.current) {
        prevHero.current = heroUrl;
        currentAppid.current = appid;
        const urls = getHeroUrls(appid);
        allUrls.current = urls;
        fallbackIdx.current = 0;
        setHeroUrl(urls[0] ?? null);
        setVisible(true);
      } else {
        setVisible(true);
      }
    };

    const observer = new MutationObserver(updateHero);
    observer.observe(mountEl, { subtree: true, attributes: true, attributeFilter: ['class'] });
    mountEl.addEventListener('focusin', updateHero);
    const onFocusOut = (e: FocusEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (!related || !mountEl.contains(related)) setVisible(false);
    };
    mountEl.addEventListener('focusout', onFocusOut);
    return () => {
      observer.disconnect();
      mountEl.removeEventListener('focusin', updateHero);
      mountEl.removeEventListener('focusout', onFocusOut);
    };
  }, [mountEl]);

  const onImgError = () => {
    fallbackIdx.current += 1;
    if (fallbackIdx.current < allUrls.current.length) {
      setHeroUrl(allUrls.current[fallbackIdx.current]);
    } else if (prevHero.current) {
      setHeroUrl(prevHero.current);
      setVisible(true);
    } else {
      setVisible(false);
    }
  };

  if (!heroUrl) return null;

  const mask = nativeClasses?.maskImage || NATIVE_MASK;
  const wrappers = nativeClasses?.wrapperClasses ?? [];

  // ── Build native-matching DOM structure ──
  //
  // Native chain (inside → outside):
  //   IMG (grayscale + fade-in anim)
  //   → zoom container (25s slow zoom animation)
  //   → mask wrapper 1 (radial-gradient mask-image)
  //   → mask wrapper 2 (same radial-gradient mask-image, double masking)

  // Zoom container: 25s slow zoom, single alternate
  const zoomStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    animation: nativeClasses?.zoomAnimation || "ds-hero-zoom 25s ease 0s 1 alternate none running",
    transformOrigin: "center center",
  };

  // Image: native uses grayscale(1) contrast(1) with a 0.3s fade-in animation
  const imgStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "50% 50%",
    display: "block",
    overflow: "clip" as any,
    filter: nativeClasses?.imgFilter || "grayscale(1) contrast(1)",
    animation: "ds-hero-img-fadein 0.3s cubic-bezier(0.17, 0.45, 0.14, 0.83) backwards",
    transition: nativeClasses?.imgTransition || "transform 0.5s cubic-bezier(0.17, 0.45, 0.14, 0.83), opacity 0.5s cubic-bezier(0.17, 0.45, 0.14, 0.83)",
  };

  // Mask wrapper style — native uses the same radial-gradient on two nested divs
  const maskStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    zIndex: 0,
    maskImage: mask,
    WebkitMaskImage: mask,
  };

  let inner = (
    <div className={nativeClasses?.zoomContainerClass || undefined} style={zoomStyle}>
      <img
        ref={imgRef}
        className={nativeClasses?.imgClass || undefined}
        src={heroUrl}
        onError={onImgError}
        style={imgStyle}
        loading="eager"
      />
    </div>
  );

  // Apply native wrapper classes if discovered, otherwise use our mask structure
  if (wrappers.length >= 2) {
    // Native has 2+ wrappers with mask-image
    for (let i = wrappers.length - 1; i >= 0; i--) {
      inner = (
        <div
          className={wrappers[i] || undefined}
          style={{ ...maskStyle }}
        >
          {inner}
        </div>
      );
    }
  } else {
    // Fallback: replicate the native double-mask structure
    inner = (
      <div style={maskStyle}>
        <div style={maskStyle}>
          {inner}
        </div>
      </div>
    );
  }

  return (
    <div
      className="ds-hero-background"
      style={{
        position: "absolute",
        top: -54,
        left: 0,
        right: 0,
        height: 396,
        overflow: "hidden",
        zIndex: -1,
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.5s cubic-bezier(0.17, 0.45, 0.14, 0.83)",
      }}
    >
      {inner}
    </div>
  );
}
