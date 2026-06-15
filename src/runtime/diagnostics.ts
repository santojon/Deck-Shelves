export type DiagnosticLevel = "info" | "warn" | "error";

export type DiagnosticEntry = {
  id: string;
  time: string;
  level: DiagnosticLevel;
  message: string;
  context?: string;
};

const listeners = new Set<(entries: DiagnosticEntry[]) => void>();
let entries: DiagnosticEntry[] = [];

function emit() {
  try { (globalThis as any).__ds_diag_entries = entries; } catch {}
  for (const listener of listeners) listener(entries);
}

export function subscribeDiagnostics(listener: (entries: DiagnosticEntry[]) => void): () => void {
  listeners.add(listener);
  listener(entries);
  return () => listeners.delete(listener);
}

export function clearDiagnostics() {
  entries = [];
  emit();
}

export function logDiagnostic(level: DiagnosticLevel, message: string, context?: string) {
  entries = [{
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: new Date().toISOString(),
    level,
    message,
    context
  }, ...entries].slice(0, 50);
  emit();
}
