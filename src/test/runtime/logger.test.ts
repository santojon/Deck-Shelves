import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setVerboseLogging, logInfo, logWarn, logError } from "../../runtime/logger";
import { clearDiagnostics, subscribeDiagnostics, type DiagnosticEntry } from "../../runtime/diagnostics";

function currentEntries(): DiagnosticEntry[] {
  let entries: DiagnosticEntry[] = [];
  subscribeDiagnostics((e) => { entries = e; })(); // subscribe → immediate snapshot → unsubscribe
  return entries;
}

describe("logger — verbose routing into the diagnostics buffer", () => {
  beforeEach(() => {
    setVerboseLogging(false);
    clearDiagnostics();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("does not mirror to the buffer when verbose is off", () => {
    logInfo("HOME", "info");
    logWarn("HOME", "warn");
    logError("HOME", "error");
    expect(currentEntries()).toHaveLength(0);
  });

  it("mirrors info / warn / error (incl. the dev-only info) when verbose is on", () => {
    setVerboseLogging(true);
    logInfo("HOME", "info msg");
    logWarn("STEAM", "warn msg");
    logError("RUNTIME", "err msg", { code: 7 });
    const entries = currentEntries();
    expect(entries).toHaveLength(3);
    const byLevel = Object.fromEntries(entries.map((e) => [e.level, e]));
    expect(byLevel.info.message).toBe("[HOME] info msg");
    expect(byLevel.warn.message).toBe("[STEAM] warn msg");
    expect(byLevel.error.message).toBe("[RUNTIME] err msg");
    expect(byLevel.error.context).toBe(JSON.stringify({ code: 7 }));
  });

  it("stops mirroring once verbose is turned back off", () => {
    setVerboseLogging(true);
    logWarn("HOME", "a");
    setVerboseLogging(false);
    logWarn("HOME", "b");
    expect(currentEntries()).toHaveLength(1);
  });
});
