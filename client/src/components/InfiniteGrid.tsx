import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '../lib/api';
import type { MediaCard, Paged } from '../lib/types';
import { CardSkeleton, PosterCard } from './PosterCard';
import { EmptyState, ErrorState, Spinner } from './States';

interface PagedState {
  key: string;
  items: MediaCard[];
  page: number;
  totalPages: number;
  totalResults: number;
  loading: boolean;
  error: unknown;
}

/** Loads page after page for an API path (the `page` query param is appended). */
export function usePaged(path: string | null) {
  const [state, setState] = useState<PagedState>({
    key: path ?? '',
    items: [],
    page: 0,
    totalPages: 1,
    totalResults: 0,
    loading: path != null,
    error: null,
  });
  const busy = useRef(false);

  const fetchPage = useCallback(
    async (key: string, page: number) => {
      busy.current = true;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const sep = key.includes('?') ? '&' : '?';
        const data = await apiGet<Paged<MediaCard>>(`${key}${sep}page=${page}`);
        setState((s) => {
          if (s.key !== key) return s;
          const seen = new Set(s.items.map((i) => `${i.mediaType}:${i.tmdbId}`));
          const fresh = data.results.filter((i) => !seen.has(`${i.mediaType}:${i.tmdbId}`));
          return {
            key,
            items: page === 1 ? data.results : [...s.items, ...fresh],
            page: data.page,
            totalPages: data.totalPages,
            totalResults: data.totalResults,
            loading: false,
            error: null,
          };
        });
      } catch (error) {
        setState((s) => (s.key === key ? { ...s, loading: false, error } : s));
      } finally {
        busy.current = false;
      }
    },
    [],
  );

  useEffect(() => {
    if (path == null) {
      setState({ key: '', items: [], page: 0, totalPages: 1, totalResults: 0, loading: false, error: null });
      return;
    }
    setState({ key: path, items: [], page: 0, totalPages: 1, totalResults: 0, loading: true, error: null });
    void fetchPage(path, 1);
  }, [path, fetchPage]);

  const stateRef = useRef(state);
  stateRef.current = state;

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (!path || busy.current || s.key !== path || s.loading || s.error || s.page >= s.totalPages) return;
    void fetchPage(path, s.page + 1);
  }, [path, fetchPage]);

  const retry = useCallback(() => {
    if (!path) return;
    void fetchPage(path, state.page + 1 || 1);
  }, [path, fetchPage, state.page]);

  const current = state.key === (path ?? '');
  return {
    items: current ? state.items : [],
    loading: current ? state.loading : true,
    error: current ? state.error : null,
    hasMore: current && state.page < state.totalPages,
    totalResults: current ? state.totalResults : 0,
    loadMore,
    retry,
  };
}

interface GridProps {
  path: string | null;
  emptyTitle?: string;
  emptyText?: string;
  onCount?: (n: number) => void;
}

export function InfiniteGrid({ path, emptyTitle = 'Nothing found', emptyText, onCount }: GridProps) {
  const { items, loading, error, hasMore, loadMore, retry, totalResults } = usePaged(path);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onCount?.(totalResults);
  }, [onCount, totalResults]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: '900px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, items.length]);

  if (error && items.length === 0) {
    return (
      <div className="page-pad">
        <ErrorState error={error} onRetry={retry} />
      </div>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <div className="page-pad">
        <EmptyState icon="search" title={emptyTitle} text={emptyText} />
      </div>
    );
  }

  return (
    <>
      <div className="grid page-pad">
        {items.map((item) => (
          <PosterCard key={`${item.mediaType}:${item.tmdbId}`} item={item} />
        ))}
        {loading && items.length === 0 && Array.from({ length: 18 }, (_, i) => <CardSkeleton key={i} />)}
      </div>
      <div ref={sentinel} className="grid__sentinel" aria-hidden="true" />
      {loading && items.length > 0 && <Spinner label="Loading more" />}
      {error != null && items.length > 0 && (
        <div className="page-pad">
          <ErrorState error={error} onRetry={retry} compact />
        </div>
      )}
      {!hasMore && !loading && items.length > 24 && <p className="grid__end">That’s everything.</p>}
    </>
  );
}
