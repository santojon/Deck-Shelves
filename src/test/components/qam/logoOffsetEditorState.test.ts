import { describe, expect, it } from "vitest";
import { buildInitialShelfState } from "../../../components/qam/modals/editShelf/buildInitialState";
import { buildInitialSmartState } from "../../../components/qam/modals/editShelf/buildSmartInitialState";

// The offset slider, the schema and the backend accept -50..100: reopening an editor must keep a negative value.
describe("logo offset when an editor reopens", () => {
  it("a regular shelf keeps a negative offset", () => {
    const shelf = { id: "s1", title: "S", enabled: true, hidden: false, limit: 20, source: { type: "tab", tab: "all" }, logoTopOffset: -30 } as any;
    const state = buildInitialShelfState({ shelf, mode: "edit", collections: [], platformTabs: [], externalSources: [] });
    expect(state.logoTopOffset).toBe(-30);
  });

  it("a smart shelf keeps a negative offset and still clamps below -50", () => {
    const smart = { id: "m1", title: "M", mode: "random_pick", enabled: true, hidden: false } as any;
    expect(buildInitialSmartState({ ...smart, logoTopOffset: -30 }).logoTopOffset).toBe(-30);
    expect(buildInitialSmartState({ ...smart, logoTopOffset: -80 }).logoTopOffset).toBe(-50);
  });
});
