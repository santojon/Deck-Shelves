/* "New shelf suggestions" notification — picks suggestions the user hasn't been
   notified about before. Pure logic + a localStorage dedup ledger; the boot
   path fires the actual toast (icon/logo/click live there). Gated on the
   "suggest on create" opt-in and skipped in light mode (no Suggestions tab to
   open). One-shot, no polling. */
import { getExternalStatisticsProviders } from "../core/pluginApi";
import { deriveSuggestions, type StatSuggestion } from "../domain/statistics";
import { coveredTemplateIds } from "../domain/templates";
import { getCurrentSettings } from "../store/settingsStore";

const NOTIFIED_KEY = "ds-notified-suggestions";
const NOTIFIED_CAP = 100; // keep the ledger bounded

function loadNotified(): Set<string> {
  try { const raw = localStorage.getItem(NOTIFIED_KEY); return new Set(raw ? JSON.parse(raw) : []); } catch { return new Set(); }
}

function saveNotified(ids: string[]): void {
  try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(ids.slice(-NOTIFIED_CAP))); } catch { /* best-effort */ }
}

async function computeSuggestions(s: any): Promise<StatSuggestion[]> {
  const groups = await Promise.all(getExternalStatisticsProviders().map(async (p) => {
    const entries = await Promise.resolve().then(() => p.resolve()).catch(() => [] as any[]);
    return { id: p.id, entries: [...entries] as any[] };
  }));
  const entriesFor = (id: string): any[] => groups.find((g) => g.id === id)?.entries ?? [];
  const exclude = coveredTemplateIds(s?.shelves ?? [], (s?.smartShelves ?? []).map((x: any) => x?.mode));
  return deriveSuggestions(entriesFor("deck-shelves.library"), entriesFor("deck-shelves.shelf-stats"), {
    seed: Math.floor(Date.now() / 86_400_000),
    smartEnabled: s?.smartShelvesEnabled === true,
    exclude,
  });
}

/* Suggestions the user hasn't been notified about yet (records the current set
   as notified as a side effect). Empty when the opt-in is off, in light mode,
   or nothing is new — so the caller fires a toast only when this is non-empty. */
export async function pickNewSuggestions(): Promise<StatSuggestion[]> {
  const s = getCurrentSettings() as any;
  if (!s || s.templateSuggestionsEnabled !== true || s.lightModeEnabled === true) return [];
  const all = await computeSuggestions(s).catch(() => [] as StatSuggestion[]);
  if (!all.length) return [];
  const notified = loadNotified();
  const fresh = all.filter((x) => !notified.has(x.id));
  if (!fresh.length) return [];
  for (const x of all) notified.add(x.id);
  saveNotified([...notified]);
  return fresh;
}
