// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../../runtime/steamHost", () => ({
  getPreferredSteamDocument: () => document,
  getAllSteamDocuments: () => [document],
}));
vi.mock("../../core/webpackCompat", () => ({ getRuntimeClassMap: () => null }));
vi.mock("../../runtime/host/decky", () => ({ call: async () => ({}) }));

import { THEME_ADAPTERS, applyRootThemeFlags, clearRootThemeFlags, applyDocumentThemeFlags, themeStylesheet, activeThemeLabels } from "../../themes";
import { __resetThemeDetectCacheForTest } from "../../themes/detect";
import { isGrayUninstalledActive, getCleanCapsuleFeatures, isTiltedHomeActive, getTiltedHomeMode } from "../../core/cssLoaderDetect";

const CTX = { cardRadius: "4px", cardW: 134, cardH: 60, cardArtH: 60, cardGap: 11, featuredW: 300, featuredH: 140, featuredArtH: 140 };

function injectTheme(css: string): void {
  const s = document.createElement("style");
  s.className = "css-loader-style";
  s.textContent = css;
  document.head.appendChild(s);
}

function mountRoot(): HTMLElement {
  const mount = document.createElement("div");
  mount.id = "deck-shelves-home-root";
  const root = document.createElement("div");
  root.className = "deck-shelves-root";
  mount.appendChild(root);
  document.body.appendChild(mount);
  return root;
}

describe("theme registry — one adapter per theme, flags + CSS + labels from one list", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-ds-theme-focus-round-compat");
    document.documentElement.removeAttribute("data-ds-slh");
    __resetThemeDetectCacheForTest();
  });

  it("every adapter owns at least one flag, a unique id and a label", () => {
    const ids = new Set<string>();
    for (const a of THEME_ADAPTERS) {
      expect(a.flags.length).toBeGreaterThan(0);
      expect(a.label.length).toBeGreaterThan(0);
      expect(ids.has(a.id)).toBe(false);
      ids.add(a.id);
    }
  });

  it("stamps the root with the flags of the detected themes and clears them on unmount", () => {
    injectTheme(":root { --uninstalled-grayscale: 100%; --uninstalled-opacity: 0.5; }");
    injectTheme(".basicgamecarousel_TextBoxCarouselContents_x { font-weight: bold; } .basicgamecarousel_TextBoxCarouselContents_x { color: var(--g1-font-color); }");
    injectTheme(".appportrait_blinker_abc_flangrande { outline: none; }");
    expect(isGrayUninstalledActive()).toBe(true);
    expect(getCleanCapsuleFeatures()).toEqual(["bold", "color"]);
    const root = mountRoot();
    applyRootThemeFlags(root);
    expect(root.getAttribute("data-ds-theme-gray-uninstalled")).toBe("true");
    expect(root.getAttribute("data-ds-theme-clc")).toBe("bold color");
    expect(root.getAttribute("data-ds-theme-focus-round-compat")).toBe("true");
    // Mirrored to <html> for rules that must reach outside the root.
    expect(document.documentElement.getAttribute("data-ds-theme-focus-round-compat")).toBe("true");
    expect(root.hasAttribute("data-ds-theme-tilted-home")).toBe(false);
    clearRootThemeFlags(root);
    expect(root.hasAttribute("data-ds-theme-gray-uninstalled")).toBe(false);
    expect(root.hasAttribute("data-ds-theme-clc")).toBe(false);
    expect(document.documentElement.hasAttribute("data-ds-theme-focus-round-compat")).toBe(false);
  });

  it("publishes the TiltedHome variant on every root", () => {
    injectTheme(":root { --ren-tilt-angle: -5deg; } .x > div.gpfocuswithin ~ div { transform: skew(5deg); }");
    expect(isTiltedHomeActive()).toBe(true);
    expect(getTiltedHomeMode()).toEqual({ method: "skew", direction: "opposites" });
    const root = mountRoot();
    const other = mountRoot();
    applyRootThemeFlags(root);
    for (const r of [root, other]) {
      expect(r.getAttribute("data-ds-theme-tilted-home")).toBe("true");
      expect(r.getAttribute("data-ds-theme-tilt-method")).toBe("skew");
      expect(r.getAttribute("data-ds-theme-tilt-direction")).toBe("opposites");
    }
  });

  it("document-scoped themes stamp <html> from computed variables, with their CSS variables", () => {
    document.documentElement.style.setProperty("--SLH-lift-hero-px", "120px");
    document.documentElement.style.setProperty("--center-home-padding", "12vw");
    applyDocumentThemeFlags(document);
    expect(document.documentElement.getAttribute("data-ds-slh")).toBe("1");
    expect(document.documentElement.getAttribute("data-ds-centered")).toBe("1");
    expect(document.documentElement.style.getPropertyValue("--ds-centered-pad")).toBe("12vw");
    document.documentElement.style.removeProperty("--SLH-lift-hero-px");
    document.documentElement.style.removeProperty("--center-home-padding");
    applyDocumentThemeFlags(document);
    expect(document.documentElement.hasAttribute("data-ds-slh")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--ds-centered-pad")).toBe("");
  });

  it("concatenates every adapter's CSS in registry order", () => {
    const css = themeStylesheet(CTX);
    const slh = css.indexOf('[data-ds-slh="1"] #deck-shelves-home-root');
    const tilt = css.indexOf('[data-ds-theme-tilted-home="true"] .ds-row-scroll');
    const gray = css.indexOf('[data-ds-theme-gray-uninstalled="true"]');
    const clc = css.indexOf('[data-ds-theme-clc~="outline"]');
    expect(slh).toBeGreaterThanOrEqual(0);
    expect(tilt).toBeGreaterThan(slh);
    expect(gray).toBeGreaterThan(tilt);
    expect(clc).toBeGreaterThan(gray);
    expect(css).toContain("html[data-ds-theme-focus-round-compat=\"true\"] ._1wPplsegQqCoe06wXPhzKT");
  });

  it("lists the labels of the detected themes for diagnostics", () => {
    expect(activeThemeLabels(document)).toEqual([]);
    injectTheme(":root { --ren-tilt-angle: -5deg; } :root { --uninstalled-grayscale: 100%; }");
    __resetThemeDetectCacheForTest();
    document.documentElement.style.setProperty("--SLH-lift-hero-px", "120px");
    expect(activeThemeLabels(document)).toEqual(["Switch Like Home", "TiltedHome", "Gray Uninstalled"]);
    document.documentElement.style.removeProperty("--SLH-lift-hero-px");
  });
});
