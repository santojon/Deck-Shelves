import { getExternalStatisticsProviders } from "./pluginApi";
import { deriveSuggestions, type StatSuggestion, type SuggestionContext, type LibraryStat } from "../domain/statistics";

export async function resolveStatSuggestions(ctx: SuggestionContext = {}): Promise<StatSuggestion[]> {
  const providers = getExternalStatisticsProviders();
  const byId: Record<string, LibraryStat[]> = {};
  await Promise.all(providers.map(async (p) => {
    const entries = await Promise.resolve().then(() => p.resolve()).catch(() => [] as LibraryStat[]);
    byId[p.id] = [...entries] as LibraryStat[];
  }));
  return deriveSuggestions(byId["deck-shelves.library"] ?? [], byId["deck-shelves.shelf-stats"] ?? [], ctx);
}
