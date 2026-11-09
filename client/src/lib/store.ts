import { useSyncExternalStore } from 'react';

/** A tiny localStorage-backed store that React components can subscribe to. */
export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(key: string, fallback: T, validate: (raw: unknown) => T | null): Store<T> {
  const listeners = new Set<() => void>();

  function read(): T {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return validate(JSON.parse(raw)) ?? fallback;
    } catch {
      return fallback;
    }
  }

  let value = read();

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== key) return;
      value = read();
      listeners.forEach((l) => l());
    });
  }

  return {
    get: () => value,
    set(next) {
      value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* storage full or blocked — keep in memory */
      }
      listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
