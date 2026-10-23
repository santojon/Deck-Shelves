import { describe, expect, it } from "vitest";
import { flowChildrenProps } from "../../core/steamOSVersion";

// Values Steam's Focusable maps; anything else asserts "Unhandled flow-children".
const HANDLED = new Set(["column", "column-reverse", "row", "row-reverse", "grid", "geometric"]);

const ATTR = /flow-children\s*=\s*\{?\s*(["'`])([^"'`]*)\1/g;
const KEY = /(["'])flow-children\1\s*:\s*(["'`])([^"'`]*)\2/g;

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function findUnhandledFlowChildren(path: string, text: string): string[] {
  const code = stripComments(text);
  const hits: string[] = [];
  for (const m of code.matchAll(ATTR)) if (!HANDLED.has(m[2])) hits.push(`${path}: ${m[2]}`);
  for (const m of code.matchAll(KEY)) if (!HANDLED.has(m[3])) hits.push(`${path}: ${m[3]}`);
  return hits;
}

const SOURCES = import.meta.glob<string>("../../**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true });

describe("flow-children guard", () => {
  it("flags values Steam does not handle", () => {
    const old = `<Focusable flow-children="vertical">\n<Focusable flow-children='horizontal' />\n{ "flow-children": "horizontal" }`;
    expect(findUnhandledFlowChildren("old.tsx", old)).toHaveLength(3);
  });

  it("accepts handled values and ignores comments", () => {
    const ok = `<Focusable flow-children="row" />\n// flow-children="vertical"\n{/* flow-children="horizontal" */}`;
    expect(findUnhandledFlowChildren("ok.tsx", ok)).toEqual([]);
  });

  it("the helper never forwards a direction Steam does not handle", () => {
    expect(flowChildrenProps("vertical")).toEqual({});
    expect(flowChildrenProps("horizontal")).toEqual({});
  });

  it("no source file passes an unhandled flow-children value", () => {
    const files = Object.entries(SOURCES).filter(([p]) => !p.includes("/test/") && !/\.test\.tsx?$/.test(p));
    expect(files.length).toBeGreaterThan(100);
    const hits = files.flatMap(([p, text]) => findUnhandledFlowChildren(p, text));
    expect(hits).toEqual([]);
  });
});
