import { logDiagnostic, type DiagnosticLevel } from "./diagnostics";

export type DeckLogLevel = "INFO" | "WARN" | "ERROR";
export type DeckLogScope = "HOME" | "STORAGE" | "SETTINGS" | "STEAM" | "RUNTIME" | "UPDATE" | "ONLINE";

/* Verbose mode (Advanced → "Show all logs"). When on, every log — including
   the dev-only INFO ones — also lands in the on-device diagnostics buffer (the
   only log surface reachable without a console) so the user can inspect them.
   Toggled from the settings store as the setting loads/changes. */
let verbose = false;
export function setVerboseLogging(on: boolean): void {
  verbose = on;
}

function ctxString(context: unknown): string | undefined {
  if (typeof context === "undefined") return undefined;
  if (typeof context === "string") return context;
  try { return JSON.stringify(context); } catch { return String(context); }
}

const DIAG_LEVEL: Record<DeckLogLevel, DiagnosticLevel> = { INFO: "info", WARN: "warn", ERROR: "error" };

function mirrorToDiagnostics(scope: DeckLogScope, level: DeckLogLevel, message: string, context?: unknown): void {
  if (!verbose) return;
  try { logDiagnostic(DIAG_LEVEL[level], `[${scope}] ${message}`, ctxString(context)); } catch {}
}

const SCOPE_COLOR: Record<DeckLogScope, string> = {
  HOME: "#22c55e",
  STORAGE: "#3b82f6",
  SETTINGS: "#a78bfa",
  STEAM: "#f59e0b",
  RUNTIME: "#ec4899",
  UPDATE: "#06b6d4",
  ONLINE: "#0ea5e9",
};

const LEVEL_BG: Record<DeckLogLevel, string> = {
  INFO: "#0ea5e9",
  WARN: "#f59e0b",
  ERROR: "#ef4444",
};

function styles(scope: DeckLogScope, level: DeckLogLevel) {
  const scopeStyle = `background:${SCOPE_COLOR[scope]};color:#052e16;padding:1px 3px;border-radius:0;font-weight:800`;
  const msgStyle = "color:#93c5fd;font-weight:600";
  const tagText = level === "ERROR" ? "#fff" : "#041018";
  const tagStyle = `background:${LEVEL_BG[level]};color:${tagText};padding:1px 3px;border-radius:0;font-weight:800`;
  return { tagStyle, scopeStyle, msgStyle };
}

export function deckLog(scope: DeckLogScope, level: DeckLogLevel, message: string, context?: unknown) {
  const { tagStyle, scopeStyle, msgStyle } = styles(scope, level);
  const consoleMethod = level === "ERROR" ? console.error : level === "WARN" ? console.warn : console.log;
  if (typeof context === "undefined") {
    consoleMethod("%cDeck Shelves%c%s%c %s", tagStyle, scopeStyle, scope, msgStyle, message);
    return;
  }
  consoleMethod("%cDeck Shelves%c%s%c %s", tagStyle, scopeStyle, scope, msgStyle, message, context);
}

export const logInfo = (scope: DeckLogScope, message: string, context?: unknown) => {
  if (!__DEV__ && !verbose) return;
  deckLog(scope, "INFO", message, context);
  mirrorToDiagnostics(scope, "INFO", message, context);
};
export const logWarn = (scope: DeckLogScope, message: string, context?: unknown) => {
  deckLog(scope, "WARN", message, context);
  mirrorToDiagnostics(scope, "WARN", message, context);
};
export const logError = (scope: DeckLogScope, message: string, context?: unknown) => {
  deckLog(scope, "ERROR", message, context);
  mirrorToDiagnostics(scope, "ERROR", message, context);
};

