import { getAllSteamDocuments } from "../../runtime/steamHost";
import { getHeroUrls as getCentralHeroUrls } from "../../core/steamAssets";

let _nativeAssetProto: any = null;
let _nativeAssetMissAt = 0;
const NATIVE_ASSET_MISS_TTL_MS = 500;

function findAssetProtoInFiber(fiber: any): any {
  let f = fiber;
  let depth = 0;
  while (f && depth < 8) {
    const p = f.memoizedProps;
    if (p && "eAssetType" in p && f.stateNode) {
      const proto = Object.getPrototypeOf(f.stateNode);
      if (typeof proto?.GetSourcesForAsset === "function") return proto;
    }
    f = f.return;
    depth++;
  }
  return null;
}

function fiberOf(img: HTMLImageElement): any {
  const fiberKey = Object.keys(img).find(k => k.startsWith("__reactFiber$"));
  return fiberKey ? (img as any)[fiberKey] : null;
}

function findAssetProtoInDoc(doc: Document): any {
  const imgs = doc.querySelectorAll("img");
  for (let i = 0; i < imgs.length; i++) {
    const img = imgs[i] as HTMLImageElement;
    if (img.closest(".ds-card, .ds-per-shelf-hero-img")) continue;
    const fiber = fiberOf(img);
    if (!fiber) continue;
    const proto = findAssetProtoInFiber(fiber);
    if (proto) return proto;
  }
  return null;
}

function findNativeAssetProto(): any {
  if (_nativeAssetProto && typeof _nativeAssetProto.GetSourcesForAsset === "function") {
    return _nativeAssetProto;
  }
  _nativeAssetProto = null;
  const sinceMiss = Date.now() - _nativeAssetMissAt;
  if (sinceMiss >= 0 && sinceMiss < NATIVE_ASSET_MISS_TTL_MS) return null;
  try {
    for (const doc of getAllSteamDocuments()) {
      const proto = findAssetProtoInDoc(doc);
      if (proto) { _nativeAssetProto = proto; return proto; }
    }
  } catch {}
  _nativeAssetMissAt = Date.now();
  return null;
}

export function getNativeHeroUrls(appid: number): string[] | null {
  try {
    const app: any = (globalThis as any).appStore?.GetAppOverviewByAppID?.(appid);
    if (!app) return null;
    const proto = findNativeAssetProto();
    if (!proto) return null;
    const fake = Object.create(proto);
    fake.props = { app, eAssetType: 1 };
    const sources = fake.GetSourcesForAsset();
    if (!Array.isArray(sources) || !sources.length) return null;
    return sources.filter(
      (s: any) => typeof s === "string" && s && !s.startsWith("/images/default")
    );
  } catch { return null; }
}

export function prefetchNativeAppData(appid: number): void {
  try {
    const app: any = (globalThis as any).appStore?.GetAppOverviewByAppID?.(appid);
    if (!app) return;
    const proto = findNativeAssetProto();
    if (!proto || typeof proto.RegisterForAppDetails !== "function") return;
    const fake = Object.create(proto);
    fake.props = { app, eAssetType: 1 };
    // The handle is left dangling on purpose: the registration only subscribes.
    fake.RegisterForAppDetails();
  } catch {}
}

export function getHeroUrls(appid: number): string[] {
  const base = getCentralHeroUrls(appid);
  const native = getNativeHeroUrls(appid);
  if (!native || !native.length) return base;
  const merged = base.slice();
  for (const u of native) if (!merged.includes(u)) merged.push(u);
  return merged;
}
