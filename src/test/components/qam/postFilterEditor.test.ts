import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../components/qam/modals/ConfirmActionModal", () => ({ confirmAction: vi.fn() }));

import { confirmAction } from "../../../components/qam/modals/ConfirmActionModal";
import { resolveFilterTabPlan } from "../../../components/qam/modals/editShelf/compositeSourceUtils";
import { removeSourceRow, withoutSourceRow } from "../../../components/qam/modals/editShelf/removeSource";
import type { EditableShelfState } from "../../../components/qam/modals/editShelf/types";
import type { FilterGroup } from "../../../types";

const confirm = confirmAction as unknown as ReturnType<typeof vi.fn>;
const t = (key: string) => key;
const empty: FilterGroup = { mode: "and", items: [] };
const localCoop: FilterGroup = { mode: "and", items: [{ type: "categories", params: { categories: ["Shared/Split Screen"] } }] };

const state = (over: Partial<EditableShelfState> = {}): EditableShelfState => ({
  sourceType: "builtin",
  childFilterGroup: empty,
  postFilterGroup: empty,
  additionalSources: [],
  ...over,
}) as EditableShelfState;

beforeEach(() => confirm.mockReset());

describe("the combined-result filter area of the filter tab", () => {
  it("shows on a shelf with more than one source, even when no source has a filter area of its own", () => {
    const plan = resolveFilterTabPlan(state({ additionalSources: [{ type: "smart", mode: "recently_played" } as any] }));
    expect(plan.showPostFilter).toBe(true);
    expect(plan.showTab).toBe(true);
  });

  it("shows next to the per-source filters of a wishlist and store shelf", () => {
    const plan = resolveFilterTabPlan(state({ sourceType: "wishlist", additionalSources: [{ type: "store" } as any] }));
    expect(plan.showPostFilter).toBe(true);
    expect(plan.primaryOnline).toBe(true);
    expect(plan.onlineAdditionalIdx).toEqual([0]);
  });

  it("does not show on a single source", () => {
    expect(resolveFilterTabPlan(state({ sourceType: "collection" })).showPostFilter).toBe(false);
    expect(resolveFilterTabPlan(state({ sourceType: "builtin" })).showTab).toBe(false);
  });
});

describe("removing a source down to one", () => {
  const twoSources = (postFilterGroup: FilterGroup) => state({ sourceType: "wishlist", additionalSources: [{ type: "store" } as any], postFilterGroup });

  it("asks first when the combined-result filter has conditions, and removes only on confirm", () => {
    const remove = vi.fn();
    removeSourceRow(twoSources(localCoop), t, remove);
    expect(remove).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toMatchObject({ title: "composite_post_filter_drop_title", body: "composite_post_filter_drop_body" });
    confirm.mock.calls[0][0].onConfirm(false);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("removes at once when the combined-result filter is empty or other sources stay", () => {
    const remove = vi.fn();
    removeSourceRow(twoSources(empty), t, remove);
    const three = state({ additionalSources: [{ type: "store" } as any, { type: "smart", mode: "recently_played" } as any], postFilterGroup: localCoop });
    removeSourceRow(three, t, remove);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("drops the combined-result filter with the last extra source and keeps it while sources stay", () => {
    const left = withoutSourceRow(twoSources(localCoop), 0);
    expect(left.additionalSources).toEqual([]);
    expect(left.postFilterGroup).toEqual(empty);
    const three = state({ additionalSources: [{ type: "store" } as any, { type: "smart", mode: "recently_played" } as any], postFilterGroup: localCoop });
    const kept = withoutSourceRow(three, 0);
    expect(kept.additionalSources).toEqual([{ type: "smart", mode: "recently_played" }]);
    expect(kept.postFilterGroup).toBe(localCoop);
  });

  it("never moves the combined-result filter onto the remaining source", () => {
    const left = withoutSourceRow(twoSources(localCoop), 0);
    expect(left.childFilterGroup).toEqual(empty);
  });
});

describe("where the combined-result filter area sits", () => {
  const smart = { type: "smart", mode: "recently_played" } as any;

  it("uses the plain Filters tab label when every source is local", () => {
    expect(resolveFilterTabPlan(state({ additionalSources: [smart] })).tabLabelKey).toBe("edit_tab_filters");
    expect(resolveFilterTabPlan(state({ sourceType: "collection", additionalSources: [smart] })).tabLabelKey).toBe("edit_tab_filters");
  });

  it("keeps the online filters tab when a source is online", () => {
    const plan = resolveFilterTabPlan(state({ sourceType: "wishlist", additionalSources: [{ type: "store" } as any] }));
    expect(plan.tabLabelKey).toBe("edit_tab_online_filters");
    expect(plan.showPostFilter).toBe(true);
    expect(plan.postFilterInFilters).toBe(false);
  });

  it("goes into the Filters tab of a Filter source with only local extra sources, with no tab of its own", () => {
    const plan = resolveFilterTabPlan(state({ sourceType: "filter", additionalSources: [smart] }));
    expect(plan.postFilterInFilters).toBe(true);
    expect(plan.showPostFilter).toBe(false);
    expect(plan.showTab).toBe(false);
  });

  it("stays out of a single Filter source's tab", () => {
    const plan = resolveFilterTabPlan(state({ sourceType: "filter" }));
    expect(plan.postFilterInFilters).toBe(false);
    expect(plan.showPostFilter).toBe(false);
  });

  it("stays in the online filters tab when a Filter source is joined by an online one", () => {
    const plan = resolveFilterTabPlan(state({ sourceType: "filter", additionalSources: [{ type: "wishlist" } as any] }));
    expect(plan.postFilterInFilters).toBe(false);
    expect(plan.showPostFilter).toBe(true);
    expect(plan.tabLabelKey).toBe("edit_tab_online_filters");
  });

  it("leaves a collection's own filter tab as it was when the combined area goes into the Filters tab", () => {
    const plan = resolveFilterTabPlan(state({ sourceType: "collection", additionalSources: [{ type: "filter" } as any] }));
    expect(plan.postFilterInFilters).toBe(true);
    expect(plan.showTab).toBe(true);
    expect(plan.tabLabelKey).toBe("edit_tab_additional_filters");
  });
});
