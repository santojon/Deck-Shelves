import { getExternalStatisticsProviders } from "./pluginApi";
import { deriveSuggestions, type StatSuggestion, type SuggestionContext, type LibraryStat } from "../domain/statistics";

// Resolve the built-in statistics providers and derive suggestions. Shared
// by the Statistics tab and the template picker so both stay in sync.
export async function resolveStatSuggestions(ctx: SuggestionContext = {}): Promise<StatSuggestion[]> {
  const providers = getExternalStatisticsProviders();
  const byId: Record<string, LibraryStat[]> = {};
  await Promise.all(providers.map(async (p) => {
    const entries = await Promise.resolve().then(() => p.resolve()).catch(() => [] as LibraryStat[]);
    byId[p.id] = [...entries] as LibraryStat[];
  }));
  return deriveSuggestions(byId["deck-shelves.library"] ?? [], byId["deck-shelves.shelf-stats"] ?? [], ctx);
}
