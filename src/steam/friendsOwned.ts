const REFRESH_MS = 30 * 60 * 1000;
let owners = new Map<number, Set<number>>();
let loadedAt = 0;
let loading: Promise<void> | null = null;

function friendStore(): any {
  return (globalThis as any).friendStore;
}

async function ownedBy(fs: any, friend: any): Promise<[number, Set<number>] | null> {
  try {
    const owned = await fs.FetchOwnedGames(friend.accountid);
    return [Number(friend.accountid), new Set<number>(owned?.setApps ?? [])];
  } catch { return null; }
}

async function fetchAll(): Promise<void> {
  const fs = friendStore();
  const friends: any[] = Array.isArray(fs?.allFriends) ? fs.allFriends : [];
  const next = new Map<number, Set<number>>();
  for (const entry of await Promise.all(friends.map((f) => ownedBy(fs, f)))) {
    if (!entry) continue;
    for (const appid of entry[1]) {
      const set = next.get(appid) ?? new Set<number>();
      set.add(entry[0]);
      next.set(appid, set);
    }
  }
  owners = next;
  loadedAt = Date.now();
}

export function loadFriendsOwned(): Promise<void> {
  if (Date.now() - loadedAt < REFRESH_MS) return Promise.resolve();
  if (!loading) loading = fetchAll().finally(() => { loading = null; });
  return loading;
}

export function friendsOwningCount(appid: number, among?: number[]): number {
  const set = owners.get(appid);
  if (!set) return 0;
  return among?.length ? among.filter((id) => set.has(Number(id))).length : set.size;
}
