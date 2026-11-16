import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SettingsSchema } from "../types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Client-side bookkeeping the backend keeps untouched as unknown fields.
const EXPECTED_ZOD_ONLY = new Set([
  "schemaVersion",
  "syncTombstones",
  "preferencesUpdatedAt",
]);
const EXPECTED_PYTHON_ONLY: ReadonlySet<string> = new Set();

function dumpPythonSanitizer(): { keys: string[]; enabled: unknown } {
  const pyLauncher = join(ROOT, "scripts", "build", "py.mjs");
  const dumpScript = join(ROOT, "scripts", "ci", "dump_sanitizer_keys.py");
  const out = execFileSync("node", [pyLauncher, dumpScript], { encoding: "utf8" });
  return JSON.parse(out);
}

describe("Settings parity — Zod SettingsSchema vs Python _sanitize_settings", () => {
  it("every key exists on both sides, except the documented exceptions", () => {
    const zodKeys = new Set(Object.keys(SettingsSchema.shape));
    const pyKeys = new Set(dumpPythonSanitizer().keys);

    const missingFromPython = [...zodKeys].filter((k) => !pyKeys.has(k) && !EXPECTED_ZOD_ONLY.has(k)).sort();
    const missingFromZod = [...pyKeys].filter((k) => !zodKeys.has(k) && !EXPECTED_PYTHON_ONLY.has(k)).sort();

    expect(
      missingFromPython,
      `Field(s) added to SettingsSchema but not to _sanitize_settings: ${missingFromPython.join(", ")}. ` +
        `Either add explicit handling in src/backend/sanitizer.py, or — if this is intentionally ` +
        `client-only bookkeeping — add it to EXPECTED_ZOD_ONLY here with a one-line reason.`,
    ).toEqual([]);
    expect(
      missingFromZod,
      `Field(s) added to _sanitize_settings but not to SettingsSchema: ${missingFromZod.join(", ")}. ` +
        `Add it to src/types.ts's SettingsSchema (Zod is the authoritative validator).`,
    ).toEqual([]);
  });

  it("enabled defaults to false on both sides", () => {
    const zodDefault = SettingsSchema.parse({}).enabled;
    const pyDefault = dumpPythonSanitizer().enabled;
    expect(zodDefault).toBe(false);
    expect(pyDefault).toBe(false);
  });
});
