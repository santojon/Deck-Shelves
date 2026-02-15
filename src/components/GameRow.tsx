import { Focusable, Navigation, Spinner, Marquee, staticClasses } from "@decky/ui";
import { useEffect, useMemo, useState } from "react";
import type { AppOverview } from "../lib/steam";
import { getAppOverview } from "../lib/steam";

function iconUrl(appid: number, iconHash?: string): string | null {
  if (!iconHash) return null;
  // Classic Steam community icon url.
  return `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${appid}/${iconHash}.jpg`;
}

function openApp(appid: number) {
  Navigation.Navigate(`/library/app/${appid}`);
  Navigation.CloseSideMenus();
}

export function GameRow(props: { appids: number[]; title: string; limit: number }) {
  const { appids, title, limit } = props;
  const [overviews, setOverviews] = useState<AppOverview[] | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      const ids = appids.slice(0, limit);
      const ovs: AppOverview[] = [];
      for (const id of ids) {
        const ov = await getAppOverview(id);
        if (ov) ovs.push(ov);
      }
      if (alive) setOverviews(ovs);
    })();

    return () => {
      alive = false;
    };
  }, [appids, limit]);

  const tiles = useMemo(() => {
    if (!overviews) return null;
    return overviews.map((ov) => {
      const img = iconUrl(ov.appid, ov.icon_hash);
      return (
        <Focusable
          key={ov.appid}
          className="deck-shelves-game"
          onActivate={() => openApp(ov.appid)}
        >
          <div className="deck-shelves-game-inner">
            {img ? (
              <img className="deck-shelves-game-icon" src={img} />
            ) : (
              <div className="deck-shelves-game-icon-fallback" />
            )}
            <Marquee className={staticClasses.Marquee}>
              {ov.display_name ?? `App ${ov.appid}`}
            </Marquee>
          </div>
        </Focusable>
      );
    });
  }, [overviews]);

  return (
    <div className="deck-shelves-row">
      <div className="deck-shelves-row-title">{title}</div>
      {!tiles ? (
        <div className="deck-shelves-row-loading">
          <Spinner />
        </div>
      ) : (
        <div className="deck-shelves-row-scroller">{tiles}</div>
      )}
    </div>
  );
}
