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

/** Classes and computed styles discovered from the native recents hero art DOM chain. */
type NativeHeroClasses = {
  imgClass: string;
  zoomContainerClass: string;
  wrapperClasses: string[];
  /** Native zoom animation (e.g. "25s ease-in-out 0s infinite alternate") */
  zoomAnimation: string;
  /** Native img filter (e.g. "brightness(0.7) saturate(1.2)") */
  imgFilter: string;
  /** Native img transition */
  imgTransition: string;
};

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
          let el = zoomContainer.parentElement;
          for (let i = 0; i < 4 && el && el !== prev; i++) {
            if (el.classList.contains('Focusable') || el.classList.contains('Panel')) break;
            wrapperClasses.push(Array.from(el.classList).join(' '));
            el = el.parentElement;
          }
          // Capture native computed styles for faithful reproduction
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
              imgTransition: imgTransition.substring(0, 60),
            });
          } catch (e) { logInfo("HOME", "HeroBackground: computedStyle capture failed", String(e)); }
          setNativeClasses({ imgClass, zoomContainerClass, wrapperClasses, zoomAnimation, imgFilter, imgTransition });
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

  const wrappers = nativeClasses?.wrapperClasses ?? [];

  // Zoom container: apply native animation if discovered, otherwise use our keyframe fallback
  const zoomStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    overflow: "visible",
    animation: nativeClasses?.zoomAnimation || "ds-hero-zoom 25s ease-in-out infinite alternate",
    transformOrigin: "center center",
  };

  // Image: apply native filter (brightness/saturate) if discovered, add blur-bottom via mask
  const imgStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    objectPosition: "50% 50%",
    display: "block",
    filter: nativeClasses?.imgFilter || "brightness(0.7) saturate(1.2)",
    transition: nativeClasses?.imgTransition || "opacity 0.4s ease, filter 0.4s ease",
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

  for (let i = wrappers.length - 1; i >= 0; i--) {
    inner = (
      <div
        className={wrappers[i] || undefined}
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        {inner}
      </div>
    );
  }

  return (
    <div
      className="ds-hero-background"
      style={{
        position: "absolute",
        top: -60,
        left: 0,
        right: 0,
        height: 420,
        overflow: "hidden",
        zIndex: 0,
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.5s cubic-bezier(0.17, 0.45, 0.14, 0.83)",
      }}
    >
      {inner}
      {/* Bottom gradient + blur — matches native SteamOS recents hero fade-out */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: "60%",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        maskImage: "linear-gradient(to top, black 0%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to top, black 0%, transparent 100%)",
        pointerEvents: "none",
        zIndex: 1,
      }} />
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: "70%",
        background: "linear-gradient(to top, rgba(14,16,18,0.98) 0%, rgba(14,16,18,0) 100%)",
        pointerEvents: "none",
        zIndex: 2,
      }} />
    </div>
  );
}
