/* eslint-disable complexity */
const g = globalThis as any;
const w = g.window as any;

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
].filter(Boolean);

function hasAnyRendererApi(target: any): boolean {
  if (!target) return false;
  return (
    typeof target.createRoot === "function" ||
    typeof target.hydrateRoot === "function" ||
    typeof target.render === "function" ||
    typeof target?.default?.createRoot === "function" ||
    typeof target?.default?.hydrateRoot === "function" ||
    typeof target?.default?.render === "function" ||
    typeof target?.client?.createRoot === "function" ||
    typeof target?.client?.hydrateRoot === "function" ||
    typeof target?.client?.render === "function"
  );
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
  const knownCandidates = CANDIDATES.map((candidate: any, index) => ({
    index,
    hasCreateRoot: typeof candidate?.createRoot === "function",
    hasHydrateRoot: typeof candidate?.hydrateRoot === "function",
    hasRender: typeof candidate?.render === "function",
    hasDefaultCreateRoot: typeof candidate?.default?.createRoot === "function",
    hasClientCreateRoot: typeof candidate?.client?.createRoot === "function",
  }));
  return {
    topLevelKeys: Object.keys(ReactDOMGlobal ?? {}).slice(0, 20),
    hostKeys: Object.keys(host ?? {}).slice(0, 20),
    hasCreateRoot: typeof host?.createRoot === "function",
    hasHydrateRoot: typeof host?.hydrateRoot === "function" || typeof ReactDOMGlobal?.hydrateRoot === "function",
    hasRender: typeof host?.render === "function" || typeof ReactDOMGlobal?.render === "function",
    hasUnmount: typeof host?.unmountComponentAtNode === "function" || typeof ReactDOMGlobal?.unmountComponentAtNode === "function",
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
