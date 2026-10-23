const g = globalThis as any;
const w = g.window as any;
// See src/shims/react.ts — same sole-host fallback (lowest priority: loader
// globals win when both are present).
const shelvesHost = w?.__SHELVES_HOST__ ?? g.__SHELVES_HOST__ ?? null;

const CANDIDATES = [
  g.SP_REACTDOM_CLIENT,
  g.SP_REACTDOMClient,
  g.ReactDOMClient,
  w?.SP_REACTDOM_CLIENT,
  w?.SP_REACTDOMClient,
  w?.ReactDOMClient,
  g.SP_REACTDOM?.client,
  w?.SP_REACTDOM?.client,
  g.SP_REACTDOM,
  g.ReactDOM,
  w?.SP_REACTDOM,
  w?.ReactDOM,
  shelvesHost?.ReactDOM,
].filter(Boolean);

const RENDERER_FNS = ["createRoot", "hydrateRoot", "render"] as const;

const fnOn = (obj: any, key: string): boolean => typeof obj?.[key] === "function";

function hasRendererFns(obj: any): boolean {
  return !!obj && RENDERER_FNS.some((k) => typeof obj[k] === "function");
}

// A renderer may sit on the candidate itself, on its `default` or on `client`.
function hasAnyRendererApi(target: any): boolean {
  return hasRendererFns(target) || hasRendererFns(target?.default) || hasRendererFns(target?.client);
}

const ReactDOMGlobal = CANDIDATES.find(hasAnyRendererApi) ?? CANDIDATES[0];

if (!ReactDOMGlobal) {
  throw new Error("Deck Shelves: ReactDOM global is not available in the Deck runtime.");
}

try {
  (globalThis as any).ReactDOM = ReactDOMGlobal;
  if ((globalThis as any).window) (globalThis as any).window.ReactDOM = ReactDOMGlobal;
} catch {}

type RootLike = { render(node: unknown): void; unmount(): void };

function getRendererHost() {
  return (
    ReactDOMGlobal?.default?.client ??
    ReactDOMGlobal?.default ??
    ReactDOMGlobal?.client ??
    ReactDOMGlobal
  );
}

function getCreateRootImpl(): ((container: Element | DocumentFragment) => RootLike) | null {
  const host = getRendererHost();
  if (typeof host?.createRoot === "function") return host.createRoot.bind(host);
  return null;
}

function getHydrateRootImpl(): ((container: Element | DocumentFragment, node: unknown) => any) | null {
  const host = getRendererHost();
  if (typeof host?.hydrateRoot === "function") return host.hydrateRoot.bind(host);
  if (typeof ReactDOMGlobal?.hydrateRoot === "function") return ReactDOMGlobal.hydrateRoot.bind(ReactDOMGlobal);
  return null;
}

function getRenderImpl(): ((node: unknown, container: Element | DocumentFragment) => void) | null {
  const host = getRendererHost();
  if (typeof host?.render === "function") return host.render.bind(host);
  if (typeof ReactDOMGlobal?.render === "function") return ReactDOMGlobal.render.bind(ReactDOMGlobal);
  return null;
}

function getUnmountImpl(): ((container: Element | DocumentFragment) => void) | null {
  const host = getRendererHost();
  if (typeof host?.unmountComponentAtNode === "function") return host.unmountComponentAtNode.bind(host);
  if (typeof ReactDOMGlobal?.unmountComponentAtNode === "function") return ReactDOMGlobal.unmountComponentAtNode.bind(ReactDOMGlobal);
  return null;
}

export function canRenderReactTree(): boolean {
  return !!(getCreateRootImpl() || getRenderImpl() || getHydrateRootImpl());
}

export function getReactDOMDebugShape() {
  const host = getRendererHost();
  const onHostOrGlobal = (key: string) => fnOn(host, key) || fnOn(ReactDOMGlobal, key);
  const knownCandidates = CANDIDATES.map((candidate: any, index) => ({
    index,
    hasCreateRoot: fnOn(candidate, "createRoot"),
    hasHydrateRoot: fnOn(candidate, "hydrateRoot"),
    hasRender: fnOn(candidate, "render"),
    hasDefaultCreateRoot: fnOn(candidate?.default, "createRoot"),
    hasClientCreateRoot: fnOn(candidate?.client, "createRoot"),
  }));
  return {
    topLevelKeys: Object.keys(ReactDOMGlobal ?? {}).slice(0, 20),
    hostKeys: Object.keys(host ?? {}).slice(0, 20),
    hasCreateRoot: fnOn(host, "createRoot"),
    hasHydrateRoot: onHostOrGlobal("hydrateRoot"),
    hasRender: onHostOrGlobal("render"),
    hasUnmount: onHostOrGlobal("unmountComponentAtNode"),
    knownCandidates,
  };
}

export function createRoot(container: Element | DocumentFragment): RootLike {
  const createRootImpl = getCreateRootImpl();
  if (createRootImpl) {
    return createRootImpl(container);
  }
  const hydrateRootImpl = getHydrateRootImpl();
  let hydratedRoot: { render?: (node: unknown) => void; unmount?: () => void } | null = null;
  return {
    render(node: unknown) {
      if (hydrateRootImpl) {
        if (!hydratedRoot) {
          hydratedRoot = hydrateRootImpl(container, node) ?? null;
          return;
        }
        if (typeof hydratedRoot?.render === "function") {
          hydratedRoot.render(node);
          return;
        }
      }
      const renderImpl = getRenderImpl();
      if (renderImpl) {
        renderImpl(node, container);
        return;
      }
      throw new Error("Deck Shelves: ReactDOM.createRoot/render is not available.");
    },
    unmount() {
      if (typeof hydratedRoot?.unmount === "function") {
        hydratedRoot.unmount();
        hydratedRoot = null;
        return;
      }
      const unmountImpl = getUnmountImpl();
      if (unmountImpl) unmountImpl(container);
    },
  };
}

export default { createRoot, canRenderReactTree, getReactDOMDebugShape };
