// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("../../runtime/host/decky", () => ({ Navigation: {} }));

import { dismissButtonSelector } from "../../runtime/closeOverlays";

const LOCALIZED: Record<string, string> = { "#Button_Close": "Fechar", "#Generic_Close": "Fechar", "#Button_Cancel": "Cancelar" };

describe("dismissButtonSelector", () => {
  afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });

  it("matches English labels as substrings and Steam's localized labels only as the whole label", () => {
    vi.stubGlobal("LocalizationManager", { LocalizeString: (t: string) => LOCALIZED[t] ?? t });
    document.body.innerHTML = `
      <button id="en" aria-label="Close dialog"></button>
      <button id="pt" aria-label="Fechar"></button>
      <button id="pt-cancel" aria-label="cancelar"></button>
      <button id="longer" aria-label="Fechar jogo"></button>`;
    const ids = Array.from(document.querySelectorAll(dismissButtonSelector())).map((e) => e.id);
    expect(ids).toEqual(["en", "pt", "pt-cancel"]);
  });

  it("keeps the English selector when Steam's localizer is missing or returns raw tokens", () => {
    const base = '[aria-label*="close" i], [aria-label*="cancel" i], [data-testid*="close" i]';
    expect(dismissButtonSelector()).toBe(base);
    vi.stubGlobal("LocalizationManager", { LocalizeString: (t: string) => t });
    expect(dismissButtonSelector()).toBe(base);
  });
});
