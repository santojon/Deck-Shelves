import { describe, it, expect } from "vitest";
import { appIdOfRow, hasAnyMethod } from "../../steam/steamAccess";

// The inline expressions the helper replaced, kept here as the reference behaviour.
const legacy = {
  appid: (x: any) => Number(x?.appid ?? x),
  appidOrAppId: (x: any) => Number(x?.appid ?? x?.appId ?? x),
  appidAppIdOrId: (x: any) => Number(x?.appid ?? x?.appId ?? x?.id ?? x),
};

const rows: unknown[] = [
  730, "730", " 42 ", 0, -1, NaN, null, undefined, "", "abc",
  { appid: 10 }, { appid: "11" }, { appId: 12 }, { id: 13 }, { appid: null, appId: 14 },
  { appid: undefined, id: 15 }, { appid: 0, appId: 16 }, { name: "x" }, {}, [17], [],
];

describe("appIdOfRow — same result as the inline row reads it replaced", () => {
  it.each(rows.map((r) => [JSON.stringify(r) ?? String(r), r]))("row %s", (_label, row) => {
    expect(appIdOfRow(row, "appid")).toEqual(legacy.appid(row));
    expect(appIdOfRow(row, "appid", "appId")).toEqual(legacy.appidOrAppId(row));
    expect(appIdOfRow(row, "appid", "appId", "id")).toEqual(legacy.appidAppIdOrId(row));
  });
});

describe("hasAnyMethod", () => {
  it("is true only for objects carrying at least one of the named methods", () => {
    expect(hasAnyMethod({ GetTabs() {} }, ["GetTabs", "GetAllTabs"])).toBe(true);
    expect(hasAnyMethod({ GetTabs: 1 }, ["GetTabs"])).toBe(false);
    expect(hasAnyMethod(null, ["GetTabs"])).toBe(false);
    expect(hasAnyMethod("GetTabs", ["GetTabs"])).toBe(false);
  });
});
