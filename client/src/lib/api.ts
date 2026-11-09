import type {
  Genre,
  ListKind,
  MediaCard,
  MediaType,
  MovieDetails,
  Paged,
  PersonDetails,
  PlaybackInfo,
  SearchResponse,
  SeasonDetails,
  TvDetails,
} from './types';
import { desktop } from './desktop';
import { ApiError, type ApiErrorCode } from './errors';
import { localGet } from './tmdb';

export { ApiError };
export type { ApiErrorCode };

export function isKeyProblem(err: unknown): boolean {
  return err instanceof ApiError && (err.code === 'TMDB_KEY_INVALID' || err.code === 'TMDB_KEY_MISSING');
}

/* Key-problem broadcast: lets a global banner react when any request is rejected. */
type KeyListener = (problem: ApiErrorCode | null) => void;
const keyListeners = new Set<KeyListener>();
let keyProblem: ApiErrorCode | null = null;

export function onKeyProblem(listener: KeyListener) {
  keyListeners.add(listener);
  listener(keyProblem);
  return () => {
    keyListeners.delete(listener);
  };
}

export function setKeyProblem(next: ApiErrorCode | null) {
  if (next === keyProblem) return;
  keyProblem = next;
  for (const l of keyListeners) l(next);
}

/* Small response cache so going back to a page is instant. */
const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export function clearClientCache() {
  cache.clear();
  inflight.clear();
}

export function peekCache<T>(path: string): T | undefined {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data as T;
  return undefined;
}

/** Desktop app only: its bundled local server on localhost. */
async function serverGet(path: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { headers: { Accept: 'application/json' } });
  } catch {
    throw new ApiError('The app’s local server isn’t responding. Try restarting the app.', 'NETWORK', 0);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: ApiErrorCode };
  if (!res.ok) {
    throw new ApiError(body.error ?? `Request failed (${res.status})`, body.code ?? 'INTERNAL', res.status);
  }
  return body;
}

export async function apiGet<T>(path: string): Promise<T> {
  const cached = peekCache<T>(path);
  if (cached !== undefined) return cached;
  const pending = inflight.get(path);
  if (pending) return pending as Promise<T>;

  const promise = (async () => {
    let body: unknown;
    try {
      // The desktop app answers through its local server; on the web we go straight to TMDB.
      body = desktop ? await serverGet(path) : await localGet(path);
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'TMDB_KEY_INVALID' || err.code === 'TMDB_KEY_MISSING')) {
        setKeyProblem(err.code);
      }
      throw err;
    }
    // Player links are built without contacting TMDB, so they say nothing about the key.
    if (!path.startsWith('/playback/')) setKeyProblem(null);
    cache.set(path, { at: Date.now(), data: body });
    if (cache.size > 300) cache.delete(cache.keys().next().value as string);
    return body as T;
  })();

  inflight.set(path, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(path);
  }
}

function qs(params: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export const api = {
  trending: (type: MediaType | 'all', page = 1) => apiGet<Paged<MediaCard>>(`/trending/${type}${qs({ page })}`),
  list: (kind: ListKind, page = 1) => apiGet<Paged<MediaCard>>(`/lists/${kind}${qs({ page })}`),
  discover: (
    type: MediaType,
    opts: { genre?: string; sort?: string; year?: string; rating?: string; page?: number },
  ) => apiGet<Paged<MediaCard>>(`/discover/${type}${qs(opts)}`),
  genres: (type: MediaType) => apiGet<Genre[]>(`/genres/${type}`),
  search: (q: string, type: 'all' | MediaType | 'person' = 'all', page = 1) =>
    apiGet<SearchResponse>(`/search${qs({ q, type, page })}`),
  movie: (id: number, region: string) => apiGet<MovieDetails>(`/movie/${id}${qs({ region })}`),
  tv: (id: number, region: string) => apiGet<TvDetails>(`/tv/${id}${qs({ region })}`),
  season: (id: number, season: number) => apiGet<SeasonDetails>(`/tv/${id}/season/${season}`),
  person: (id: number) => apiGet<PersonDetails>(`/person/${id}`),
  playback: (type: MediaType, id: number, season?: number, episode?: number) =>
    apiGet<PlaybackInfo>(`/playback/${type}/${id}${qs({ season, episode })}`),
};

export function friendlyError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
