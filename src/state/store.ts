type Listener<T> = (v: T) => void;

export function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener<T>>();

  return {
    get: () => value,
    set: (next: T) => {
      value = next;
      listeners.forEach((l) => l(value));
    },
    update: (fn: (v: T) => T) => {
      value = fn(value);
      listeners.forEach((l) => l(value));
    },
    subscribe: (listener: Listener<T>) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
