export type LibraryChange = { reason: "event" | "poll" | "route" };

function isHomeRoute(): boolean {
  try {
    const p = window.location?.pathname ?? "";
    return p.includes("/library/home");
  } catch {
    return false;
  }
}

/**
 * Watches for library changes.
 * - Uses SteamClient event callbacks when available.
 * - Falls back to adaptive polling:
 *   - Faster when user is on Home (/library/home)
 *   - Slower when user leaves Home
 */
export function startLibraryWatcher(onChange: (c: LibraryChange) => void) {
  const stopFns: Array<() => void> = [];

  try {
    const apps: any = (window as any).SteamClient?.Apps;

    // These APIs differ between SteamOS builds; we try a few common shapes.
    const tryRegister = (fnName: string) => {
      const fn = apps?.[fnName];
      if (typeof fn !== "function") return;
      try {
        const sub = fn((..._args: any[]) => onChange({ reason: "event" }));
        if (sub?.unregister) stopFns.push(() => sub.unregister());
        if (sub?.Unregister) stopFns.push(() => sub.Unregister());
        if (typeof sub === "function") stopFns.push(() => sub());
      } catch {
        // ignore
      }
    };

    tryRegister("RegisterForAppOverviewChanges");
    tryRegister("RegisterForLibraryChanges");
    tryRegister("RegisterForAppChanges");
  } catch {
    // ignore
  }

  // Adaptive polling loop (no Steam restart required)
  let stopped = false;
  let timer: number | undefined;

  const fastMs = 6_000;   // on Home
  const slowMs = 60_000;  // elsewhere

  const schedule = () => {
    if (stopped) return;
    const ms = isHomeRoute() ? fastMs : slowMs;
    timer = window.setTimeout(() => {
      onChange({ reason: "poll" });
      schedule();
    }, ms);
  };

  // Detect route changes cheaply
  let lastHome = isHomeRoute();
  const routeCheck = window.setInterval(() => {
    const nowHome = isHomeRoute();
    if (nowHome !== lastHome) {
      lastHome = nowHome;
      onChange({ reason: "route" });
      // Reschedule immediately with new cadence
      if (timer) window.clearTimeout(timer);
      schedule();
    }
  }, 1500);
  stopFns.push(() => window.clearInterval(routeCheck));

  stopFns.push(() => {
    stopped = true;
    if (timer) window.clearTimeout(timer);
  });

  schedule();

  return () => stopFns.forEach((f) => f());
}
