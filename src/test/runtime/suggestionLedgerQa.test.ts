import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const qa = vi.hoisted(() => ({ active: false }));
vi.mock("../../qa/harness", () => ({ get qaOverrideActive() { return qa.active; } }));
vi.mock("../../store/settingsStore", () => ({ getCurrentSettings: () => null }));
vi.mock("../../core/pluginApi", () => ({ getExternalStatisticsProviders: () => [] }));

import { isSuggestionNew, markSuggestionsSeen } from "../../runtime/suggestionNotifier";

describe("suggestion ledger and QA builds", () => {
  const mem = new Map<string, string>();
  beforeEach(() => {
    mem.clear();
    vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } });
  });
  afterEach(() => { qa.active = false; vi.unstubAllGlobals(); });

  it("a QA build never records a suggestion as seen", () => {
    qa.active = true;
    markSuggestionsSeen(["deck_playable"]);
    expect(mem.has("ds-notified-suggestions")).toBe(false);
    expect(isSuggestionNew("deck_playable")).toBe(true);
  });

  it("a normal build records it", () => {
    markSuggestionsSeen(["deck_playable"]);
    expect(isSuggestionNew("deck_playable")).toBe(false);
  });
});
