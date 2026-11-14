import { describe, it, expect } from "vitest";
import { normalizeAppOverview } from "../../steam/appOverview";

// The client's overview, as read on a Steam Deck: the size is a string, the
// review percentage a getter, the original release date often 0 with the Steam one set.
function clientOverview(extra: Record<string, unknown> = {}) {
  const raw: Record<string, unknown> = {
    appid: 440, display_name: "A game", sort_as: "a game", app_type: 1,
    minutes_playtime_forever: 49, rt_last_time_played: 1767878589,
    size_on_disk: "26843545600", rt_original_release_date: 0, rt_steam_release_date: 1711391760,
    review_percentage_with_bombs: 85, metacritic_score: 81,
    per_client_data: [{ clientid: "0", installed: true, display_status: 14 }],
    ...extra,
  };
  Object.defineProperty(raw, "review_percentage", { get: () => raw.review_percentage_with_bombs, enumerable: false });
  return raw;
}

describe("normalizeAppOverview: the fields the sorts and score filters read", () => {
  it("copies the size as a number, the Steam release date, the review percentage and the metacritic score", () => {
    const app = normalizeAppOverview(clientOverview() as any)!;
    expect(app.size_on_disk).toBe(26843545600);
    expect(app.rt_original_release_date).toBe(1711391760);
    expect(app.review_percentage).toBe(85);
    expect(app.metacritic_score).toBe(81);
  });

  it("prefers the original release date when the client has it", () => {
    const app = normalizeAppOverview(clientOverview({ rt_original_release_date: 1500000000 }) as any)!;
    expect(app.rt_original_release_date).toBe(1500000000);
  });

  it("leaves the fields out when the client has nothing, so the online enrichment can fill them", () => {
    const app = normalizeAppOverview({ appid: 1, display_name: "X", app_type: 1 } as any)!;
    expect(app.size_on_disk).toBeUndefined();
    expect(app.rt_original_release_date).toBeUndefined();
    expect(app.review_percentage).toBeUndefined();
    expect(app.metacritic_score).toBeUndefined();
  });
});
