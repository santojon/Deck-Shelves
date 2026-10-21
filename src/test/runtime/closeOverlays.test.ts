// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("../../runtime/host/decky", () => ({ Navigation: {} }));

import { dismissButtonSelector } from "../../runtime/closeOverlays";
import { STEAM_PT_BR, clearSteamLocalizer, stubSteamLocalizer } from "../fixtures/steamLocalizer";

describe("dismissButtonSelector", () => {
  afterEach(() => { clearSteamLocalizer(); document.body.innerHTML = ""; });

  it("matches Steam's English words inside a label and the user's language only as the whole label", () => {
    stubSteamLocalizer(STEAM_PT_BR);
    document.body.innerHTML = `
      <button id="en" aria-label="Close dialog"></button>
      <button id="pt" aria-label="Fechar"></button>
      <button id="pt-cancel" aria-label="cancelar"></button>
      <button id="longer" aria-label="Fechar jogo"></button>`;
    const ids = Array.from(document.querySelectorAll(dismissButtonSelector())).map((e) => e.id);
    expect(ids).toEqual(["en", "pt", "pt-cancel"]);
  });

  it("keeps only the test-id hook when Steam's localizer is missing or returns raw tokens", () => {
    const base = '[data-testid*="close" i]';
    expect(dismissButtonSelector()).toBe(base);
    vi.stubGlobal("LocalizationManager", { LocalizeString: (t: string) => t, LocalizeStringFromFallback: (t: string) => t });
    expect(dismissButtonSelector()).toBe(base);
  });
});
