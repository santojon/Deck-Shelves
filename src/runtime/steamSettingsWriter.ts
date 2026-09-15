/* Writes Steam's own client settings via the same internal path its
   Settings UI uses (SetSetting, protobuf-encoded) — only for the two
   idle-screensaver timeouts, never trusted until a no-op write
   round-trips first. Located at runtime by a stable call-site string,
   not a hardcoded (build-churning) module id. */

type Setter = (key: string, value: unknown) => unknown;
type IdleTimeoutKey = "system_idle_screensaver_ac_sec" | "system_idle_screensaver_battery_sec";

let cachedSetter: Setter | null | undefined;
let verifiedThisSession = false;

function candidateModuleIds(factories: Record<string, (...a: any[]) => any>): string[] {
  return Object.keys(factories).filter((id) => {
    try { return factories[id].toString().includes(".SetSetting("); } catch { return false; }
  });
}

function scanCandidatesForSetter(requireFn: any, factories: Record<string, (...a: any[]) => any>): Setter | null {
  for (const id of candidateModuleIds(factories)) {
    let mod: any;
    try { mod = requireFn(id); } catch { continue; }
    if (!mod || typeof mod !== "object") continue;
    const fn = findSetterExport(mod);
    if (fn) return fn;
  }
  return null;
}

function findSettingSetter(): Setter | null {
  if (cachedSetter !== undefined) return cachedSetter;
  cachedSetter = null;
  try {
    const chunk = (globalThis as any).webpackChunksteamui;
    if (!Array.isArray(chunk)) return null;
    let requireFn: any = null;
    chunk.push([[Symbol("ds-setting-setter-probe")], {}, (r: any) => { requireFn = r; }]);
    const factories = requireFn?.m as Record<string, (...a: any[]) => any> | undefined;
    if (!factories) return null;
    cachedSetter = scanCandidatesForSetter(requireFn, factories);
  } catch { return null; }
  return cachedSetter;
}

function findSetterExport(mod: Record<string, unknown>): Setter | null {
  for (const key of Object.keys(mod)) {
    const fn = mod[key];
    if (typeof fn !== "function" || fn.length !== 2) continue;
    let src = "";
    try { src = fn.toString(); } catch { continue; }
    if (src.includes(".SetSetting(")) return fn as Setter;
  }
  return null;
}

export function readIdleTimeoutSec(key: IdleTimeoutKey): number | null {
  try {
    const raw = (globalThis as any).settingsStore?.clientSettings?.[key];
    return typeof raw === "number" ? raw : null;
  } catch { return null; }
}

function waitForValue(key: IdleTimeoutKey, expected: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (readIdleTimeoutSec(key) === expected) { resolve(true); return; }
      if (Date.now() - start >= timeoutMs) { resolve(false); return; }
      setTimeout(tick, 150);
    };
    tick();
  });
}

// One harmless no-op write (same value back) before ever trusting the
// located function with a REAL value change. Cached for the session once
// it passes — Steam's settings-write path doesn't change mid-session.
async function verifySetterOnce(setter: Setter): Promise<boolean> {
  if (verifiedThisSession) return true;
  const probeKey: IdleTimeoutKey = "system_idle_screensaver_ac_sec";
  const before = readIdleTimeoutSec(probeKey);
  if (before === null) return false;
  try { setter(probeKey, before); } catch { return false; }
  const ok = await waitForValue(probeKey, before, 1500);
  if (ok) verifiedThisSession = true;
  return ok;
}

export async function writeIdleTimeoutSec(key: IdleTimeoutKey, value: number): Promise<boolean> {
  const setter = findSettingSetter();
  if (!setter) return false;
  if (!(await verifySetterOnce(setter))) return false;
  try { setter(key, value); } catch { return false; }
  return waitForValue(key, value, 1500);
}
