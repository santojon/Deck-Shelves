export type DeckLogLevel = "INFO" | "WARN" | "ERROR";
export type DeckLogScope = "HOME" | "STORAGE" | "SETTINGS" | "STEAM" | "RUNTIME" | "UPDATE";

const SCOPE_COLOR: Record<DeckLogScope, string> = {
  HOME: "#22c55e",
  STORAGE: "#3b82f6",
  SETTINGS: "#a78bfa",
  STEAM: "#f59e0b",
  RUNTIME: "#ec4899",
  UPDATE: "#06b6d4",
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
  if (!__DEV__) return;
  deckLog(scope, "INFO", message, context);
};
export const logWarn = (scope: DeckLogScope, message: string, context?: unknown) => deckLog(scope, "WARN", message, context);
export const logError = (scope: DeckLogScope, message: string, context?: unknown) => deckLog(scope, "ERROR", message, context);

