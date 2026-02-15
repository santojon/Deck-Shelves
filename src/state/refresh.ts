type Listener = () => void;

const listeners = new Set<Listener>();

export function onRefreshRequested(cb: Listener) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function requestRefreshNow() {
  listeners.forEach((l) => {
    try { l(); } catch { /* ignore */ }
  });
}
