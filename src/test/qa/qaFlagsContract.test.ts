import { describe, expect, it } from "vitest";

const BUILD = import.meta.glob<string>("../../../vite.plugin.config.ts", { query: "?raw", import: "default", eager: true });
const HARNESS = import.meta.glob<string>("../../qa/harness.tsx", { query: "?raw", import: "default", eager: true });

// Every QA define the build can set must count in `qaOverrideActive`, which keeps a QA build off real data.
describe("QA build flags", () => {
  it("every QA define of the build counts in qaOverrideActive", () => {
    const build = Object.values(BUILD)[0];
    const harness = Object.values(HARNESS)[0];
    const defines = [...new Set(build.match(/__QA_[A-Z_]+__/g) ?? [])];
    expect(defines.length).toBeGreaterThan(20);
    const constOf = new Map<string, string>();
    for (const m of harness.matchAll(/const (\w+) = __DEV__ && typeof (__QA_[A-Z_]+__)/g)) constOf.set(m[2], m[1]);
    const start = harness.indexOf("export const qaOverrideActive");
    const block = harness.slice(start, harness.indexOf(");", start));
    const missing = defines.filter((d) => !constOf.has(d) || !new RegExp(`\\b${constOf.get(d)}\\b`).test(block));
    expect(missing).toEqual([]);
  });
});
