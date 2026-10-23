import { call } from "./host/decky";

interface LauncherGame {
  name: string;
  category?: string;
  id?: string;
}

const TTL_MS = 15 * 60 * 1000;
let lastPopulatedAt = 0;

async function safeCall<T>(method: string, args: unknown, fallback: T): Promise<T> {
  try {
    return (await call(method, args)) as T;
  } catch {
    return fallback;
  }
}

async function refreshLauncherCache(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastPopulatedAt < TTL_MS) return;
  const available = await safeCall<string[]>("list_available_launchers", {}, []);
  const games: Record<string, LauncherGame[]> = {};
  await Promise.all(available.map(async (id) => {
    const list = await safeCall<LauncherGame[]>("list_launcher_games", { launcher_id: id }, []);
    games[id] = Array.isArray(list) ? list : [];
  }));
  (globalThis as any).__ds_launcher_cache = { available, games };
  lastPopulatedAt = now;
}

export function installLauncherCachePoll(): () => void {
  const schedule = (cb: () => void) => {
    const ric = (globalThis as any).requestIdleCallback as ((cb: () => void, opts?: { timeout: number }) => number) | undefined;
    if (ric) ric(cb, { timeout: 5000 });
    else setTimeout(cb, 1500);
  };
  let cancelled = false;
  schedule(() => { if (!cancelled) void refreshLauncherCache(); });
  const interval = setInterval(() => { if (!cancelled) void refreshLauncherCache(true); }, TTL_MS);
  return () => { cancelled = true; clearInterval(interval); };
}
