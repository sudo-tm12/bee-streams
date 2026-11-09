import { useCallback, useEffect, useRef, useState } from 'react';
import { clearClientCache, peekCache } from './api';

interface ApiState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

/**
 * Loads data for a key. Shows cached data immediately when available.
 * Pass `null` as the key to skip loading.
 */
export function useApi<T>(key: string | null, load: () => Promise<T>): ApiState<T> {
  const [state, setState] = useState<{ key: string | null; data: T | undefined; error: unknown; loading: boolean }>(
    () => ({ key, data: key ? peekCache<T>(key) : undefined, error: null, loading: key != null }),
  );
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (key == null) {
      setState({ key, data: undefined, error: null, loading: false });
      return;
    }
    let cancelled = false;
    const cached = peekCache<T>(key);
    setState((prev) => ({
      key,
      data: cached ?? (prev.key === key ? prev.data : undefined),
      error: null,
      loading: cached === undefined,
    }));
    loadRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ key, data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState((prev) => ({ key, data: prev.key === key ? prev.data : undefined, error, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [key, nonce]);

  const reload = useCallback(() => {
    clearClientCache();
    setNonce((n) => n + 1);
  }, []);

  const current = state.key === key;
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : null,
    loading: current ? state.loading : key != null,
    reload,
  };
}
