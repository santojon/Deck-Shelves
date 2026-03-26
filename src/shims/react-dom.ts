const ReactDOMGlobal =
  (globalThis as any).SP_REACTDOM ||
  (globalThis as any).ReactDOM ||
  (globalThis as any).window?.SP_REACTDOM ||
  (globalThis as any).window?.ReactDOM;

if (!ReactDOMGlobal) {
  throw new Error("Deck Shelves: ReactDOM global is not available in the Deck runtime.");
}

try {
  (globalThis as any).ReactDOM = ReactDOMGlobal;
  if ((globalThis as any).window) (globalThis as any).window.ReactDOM = ReactDOMGlobal;
} catch {}

export function createPortal(children: unknown, container: Element | DocumentFragment) {
  if (typeof ReactDOMGlobal.createPortal === "function") {
    return ReactDOMGlobal.createPortal(children, container);
  }
  throw new Error("Deck Shelves: ReactDOM.createPortal is not available.");
}

export default { createPortal };
