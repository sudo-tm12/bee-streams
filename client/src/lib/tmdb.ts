/**
 * Talks to TMDB straight from the browser, so the web version needs no server.
 *
 * This is a port of server/src/tmdb.js + the /api routes in server/src/app.js: `localGet('/movie/550')`
 * returns exactly what `GET /api/movie/550` returns from the desktop app's local server.
 * The key lives in this browser's localStorage and is only ever sent to api.themoviedb.org.
 */
import { ApiError } from './errors';
import { createStore } from './store';
import type { Genre, MediaCard, MovieDetails, Paged, PersonCard, PersonDetails, PlaybackInfo, SearchResponse, SeasonDetails, TvDetails } from './types';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const PLAYBACK_BASE = 'https://vidsrc.sh';

// TMDB responses are loosely shaped JSON; the mappers below turn them into our typed shapes.
type Raw = any;
type Params = Record<string, string | number | undefined | null>;

/* ------------------------------------------------------------------ */
/* Credentials                                                         */
/* ------------------------------------------------------------------ */

export type KeyKind = 'v3-key' | 'v4-token' | 'none';

/** The TMDB key for the web version (the desktop app keeps its own, encrypted). */
export const tmdbKeyStore = createStore<string>('bee:tmdb-key', '', (raw) => (typeof raw === 'string' ? raw : null));

/** TMDB hands out two kinds of credential; both work, but they're sent differently. */
export function credentialKind(credential: string | null | undefined): KeyKind {
  const value = String(credential ?? '').trim();
  if (!value) return 'none';
  if (value.startsWith('eyJ') && value.split('.').length === 3) return 'v4-token';
  return 'v3-key';
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

async function request(path: string, params: Params = {}, credential = tmdbKeyStore.get().trim()): Promise<Raw> {
  if (!credential) throw new ApiError('No TMDB API key is set yet.', 'TMDB_KEY_MISSING', 503);
  const url = new URL(`${TMDB_BASE}${path}`);
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (credentialKind(credential) === 'v4-token') headers.Authorization = `Bearer ${credential}`;
  else url.searchParams.set('api_key', credential);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) });
  } catch {
    throw new ApiError('Couldn’t reach TMDB. Check your internet connection.', 'TMDB_UNREACHABLE', 504);
  }
  if (res.status === 401) throw new ApiError('TMDB rejected your API key.', 'TMDB_KEY_INVALID', 401);
  if (res.status === 404) throw new ApiError('That title wasn’t found on TMDB.', 'NOT_FOUND', 404);
  if (res.status === 429) {
    throw new ApiError('TMDB is rate-limiting requests. Try again in a moment.', 'TMDB_RATE_LIMITED', 429);
  }
  if (!res.ok) throw new ApiError(`TMDB returned an error (${res.status}).`, 'TMDB_ERROR', 502);
  try {
    return await res.json();
  } catch {
    throw new ApiError('TMDB sent a response that couldn’t be read.', 'TMDB_ERROR', 502);
  }
}

export interface KeyCheck {
  ok: boolean;
  code?: string;
  message?: string;
  kind: KeyKind;
}

/** Checks a credential against TMDB without saving it. */
export async function validateCredential(credential: string): Promise<KeyCheck> {
  const value = credential.trim();
  const kind = credentialKind(value);
  if (kind === 'none') return { ok: false, code: 'TMDB_KEY_MISSING', message: 'Paste your TMDB API key first.', kind };
  try {
    await request('/authentication', {}, value);
    return { ok: true, kind };
  } catch (err) {
    if (err instanceof ApiError) {
      const message =
        err.code === 'TMDB_KEY_INVALID'
          ? 'TMDB says this key isn’t valid. Copy it again from themoviedb.org → Settings → API.'
          : err.message;
      return { ok: false, code: err.code, message, kind };
    }
    return { ok: false, code: 'UNKNOWN', message: 'Something went wrong checking the key.', kind };
  }
}

/* ------------------------------------------------------------------ */
/* Mapping helpers                                                     */
/* ------------------------------------------------------------------ */

function normalizePage(page: unknown): number {
  const n = Number(page);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), 500);
}

function toCard(item: Raw, forcedType?: 'movie' | 'tv'): MediaCard | null {
  const mediaType = forcedType ?? item.media_type;
  if (mediaType !== 'movie' && mediaType !== 'tv') return null;
  const title = mediaType === 'movie' ? item.title : item.name;
  if (!title) return null;
  return {
    tmdbId: item.id,
    mediaType,
    title,
    overview: item.overview ?? '',
    poster: item.poster_path ?? null,
    backdrop: item.backdrop_path ?? null,
    releaseDate: (mediaType === 'movie' ? item.release_date : item.first_air_date) || null,
    voteAverage: item.vote_average ?? 0,
    voteCount: item.vote_count ?? 0,
    genreIds: item.genre_ids ?? [],
  };
}

function toPersonCard(item: Raw): PersonCard {
  return {
    id: item.id,
    name: item.name,
    profile: item.profile_path ?? null,
    knownFor: item.known_for_department ?? null,
    knownForTitles: ((item.known_for ?? []) as Raw[])
      .map((k) => k.title ?? k.name)
      .filter(Boolean)
      .slice(0, 3),
  };
}

function cards(list: Raw[] | undefined, forcedType?: 'movie' | 'tv'): MediaCard[] {
  return (list ?? []).map((r) => toCard(r, forcedType)).filter((c): c is MediaCard => c !== null);
}

function mapPaged(data: Raw, forcedType?: 'movie' | 'tv'): Paged<MediaCard> {
  return {
    results: cards(data.results, forcedType),
    page: data.page ?? 1,
    totalPages: Math.min(data.total_pages ?? 1, 500),
    totalResults: data.total_results ?? 0,
  };
}

function mapCast(credits: Raw, limit = 18) {
  return ((credits?.cast ?? []) as Raw[])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .slice(0, limit)
    .map((c) => ({
      id: c.id,
      name: c.name,
      character: c.character ?? c.roles?.[0]?.character ?? '',
      profile: c.profile_path ?? null,
    }));
}

function pickTrailer(videos: Raw) {
  const list = ((videos?.results ?? []) as Raw[]).filter((v) => v.site === 'YouTube' && v.key);
  const score = (v: Raw) =>
    (v.type === 'Trailer' ? 100 : v.type === 'Teaser' ? 50 : 0) + (v.official ? 20 : 0) + (v.iso_639_1 === 'en' ? 10 : 0);
  const best = list.sort((a, b) => score(b) - score(a))[0];
  return best ? { key: String(best.key), name: String(best.name ?? '') } : null;
}

function mapProviders(watch: Raw, region: string) {
  const entry = watch?.results?.[region];
  if (!entry) return null;
  const map = (list: Raw[] | undefined) =>
    (list ?? [])
      .slice()
      .sort((a, b) => (a.display_priority ?? 0) - (b.display_priority ?? 0))
      .map((p) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path ?? null }));
  const info = {
    link: entry.link ?? null,
    stream: map(entry.flatrate),
    free: map(entry.free),
    ads: map(entry.ads),
    rent: map(entry.rent),
    buy: map(entry.buy),
  };
  const any = info.stream.length + info.free.length + info.ads.length + info.rent.length + info.buy.length;
  return any > 0 ? info : null;
}

function movieCertification(releaseDates: Raw, region: string): string | null {
  const results = (releaseDates?.results ?? []) as Raw[];
  for (const code of [region, 'US']) {
    const entry = results.find((r) => r.iso_3166_1 === code);
    const cert = ((entry?.release_dates ?? []) as Raw[])
      .slice()
      .sort((a, b) => (a.type === 3 ? -1 : 0) - (b.type === 3 ? -1 : 0))
      .find((d) => d.certification)?.certification;
    if (cert) return cert;
  }
  return null;
}

function tvCertification(contentRatings: Raw, region: string): string | null {
  const results = (contentRatings?.results ?? []) as Raw[];
  for (const code of [region, 'US']) {
    const rating = results.find((r) => r.iso_3166_1 === code)?.rating;
    if (rating) return rating;
  }
  return null;
}

function normalizeRegion(region: unknown): string {
  const r = String(region ?? '').toUpperCase();
  return /^[A-Z]{2}$/.test(r) ? r : 'US';
}

function mapEpisodeRef(ep: Raw) {
  if (!ep) return null;
  return {
    seasonNumber: ep.season_number,
    episodeNumber: ep.episode_number,
    name: ep.name ?? '',
    airDate: ep.air_date || null,
  };
}

const named = (list: Raw[] | undefined) => (list ?? []).map((g) => ({ id: g.id, name: g.name }));

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

const LIST_KINDS: Record<string, { path: string; mediaType: 'movie' | 'tv' }> = {
  popular_movies: { path: '/movie/popular', mediaType: 'movie' },
  now_playing: { path: '/movie/now_playing', mediaType: 'movie' },
  upcoming: { path: '/movie/upcoming', mediaType: 'movie' },
  top_rated_movies: { path: '/movie/top_rated', mediaType: 'movie' },
  popular_tv: { path: '/tv/popular', mediaType: 'tv' },
  airing_today: { path: '/tv/airing_today', mediaType: 'tv' },
  on_the_air: { path: '/tv/on_the_air', mediaType: 'tv' },
  top_rated_tv: { path: '/tv/top_rated', mediaType: 'tv' },
};

async function getList(kind: string, page: unknown): Promise<Paged<MediaCard>> {
  const entry = LIST_KINDS[kind];
  return mapPaged(await request(entry.path, { page: normalizePage(page) }), entry.mediaType);
}

async function getTrending(type: string, page: unknown, window: unknown): Promise<Paged<MediaCard>> {
  const t = type === 'movie' || type === 'tv' ? type : 'all';
  const w = window === 'day' ? 'day' : 'week';
  const data = await request(`/trending/${t}/${w}`, { page: normalizePage(page) });
  return mapPaged(data, t === 'all' ? undefined : t);
}

async function getGenres(type: 'movie' | 'tv'): Promise<Genre[]> {
  return named((await request(`/genre/${type}/list`)).genres);
}

const SORTS: Record<string, (type: 'movie' | 'tv') => Params> = {
  popular: () => ({ sort_by: 'popularity.desc' }),
  top: (type) => ({ sort_by: 'vote_average.desc', 'vote_count.gte': type === 'movie' ? 300 : 200 }),
  newest: (type) => {
    const today = new Date().toISOString().slice(0, 10);
    return type === 'movie'
      ? { sort_by: 'primary_release_date.desc', 'primary_release_date.lte': today, 'vote_count.gte': 10 }
      : { sort_by: 'first_air_date.desc', 'first_air_date.lte': today, 'vote_count.gte': 10 };
  },
  votes: () => ({ sort_by: 'vote_count.desc' }),
};

async function discover(
  t: 'movie' | 'tv',
  { genre, sort, year, rating, page }: Record<'genre' | 'sort' | 'year' | 'rating' | 'page', string | null>,
): Promise<Paged<MediaCard>> {
  const params: Params = {
    include_adult: 'false',
    page: normalizePage(page),
    ...(Object.hasOwn(SORTS, sort ?? '') ? SORTS[sort!] : SORTS.popular)(t),
  };
  if (genre && /^\d+(,\d+)*$/.test(genre)) params.with_genres = genre;

  const y = String(year ?? '');
  const dateField = t === 'movie' ? 'primary_release_date' : 'first_air_date';
  if (/^\d{4}$/.test(y)) {
    params[t === 'movie' ? 'primary_release_year' : 'first_air_date_year'] = y;
  } else if (/^\d{3}0s$/.test(y)) {
    const start = Number(y.slice(0, 4));
    params[`${dateField}.gte`] = `${start}-01-01`;
    const end = `${start + 9}-12-31`;
    const existing = params[`${dateField}.lte`];
    params[`${dateField}.lte`] = typeof existing === 'string' && existing < end ? existing : end;
  }

  const minRating = Number(rating);
  if (Number.isFinite(minRating) && minRating > 0 && minRating <= 10) {
    params['vote_average.gte'] = minRating;
    params['vote_count.gte'] = Math.max(Number(params['vote_count.gte'] ?? 0), 100);
  }

  return mapPaged(await request(`/discover/${t}`, params), t);
}

async function search(query: string, type: string, page: unknown): Promise<SearchResponse> {
  const q = query.trim();
  const p = normalizePage(page);
  if (!q) return { results: [], people: [], page: 1, totalPages: 1, totalResults: 0 };
  const params = { query: q, include_adult: 'false', page: p };

  if (type === 'movie' || type === 'tv') {
    return { ...mapPaged(await request(`/search/${type}`, params), type), people: [] };
  }
  const data = await request(type === 'person' ? '/search/person' : '/search/multi', params);
  const raw = (data.results ?? []) as Raw[];
  return {
    results: type === 'person' ? [] : cards(raw),
    people: (type === 'person' ? raw : raw.filter((r) => r.media_type === 'person')).map(toPersonCard),
    page: data.page ?? 1,
    totalPages: Math.min(data.total_pages ?? 1, 500),
    totalResults: data.total_results ?? 0,
  };
}

async function getMovie(tmdbId: number, region: unknown): Promise<MovieDetails> {
  const reg = normalizeRegion(region);
  const data = await request(`/movie/${tmdbId}`, {
    append_to_response: 'credits,external_ids,videos,recommendations,similar,release_dates,watch/providers',
  });
  const recs = cards(data.recommendations?.results, 'movie');
  const similar = cards(data.similar?.results, 'movie');
  const crew = (data.credits?.crew ?? []) as Raw[];
  return {
    tmdbId: data.id,
    mediaType: 'movie',
    title: data.title,
    originalTitle: data.original_title ?? null,
    tagline: data.tagline || null,
    overview: data.overview ?? '',
    poster: data.poster_path ?? null,
    backdrop: data.backdrop_path ?? null,
    releaseDate: data.release_date || null,
    runtime: data.runtime || null,
    status: data.status ?? null,
    voteAverage: data.vote_average ?? 0,
    voteCount: data.vote_count ?? 0,
    genres: named(data.genres),
    certification: movieCertification(data.release_dates, reg),
    imdbId: data.imdb_id ?? data.external_ids?.imdb_id ?? null,
    directors: named(crew.filter((c) => c.job === 'Director')),
    writers: named(crew.filter((c) => c.department === 'Writing').slice(0, 3)),
    cast: mapCast(data.credits),
    trailer: pickTrailer(data.videos),
    recommendations: (recs.length ? recs : similar).slice(0, 20),
    providers: mapProviders(data['watch/providers'], reg),
    collection: data.belongs_to_collection
      ? { id: data.belongs_to_collection.id, name: data.belongs_to_collection.name }
      : null,
  };
}

async function getTv(tmdbId: number, region: unknown): Promise<TvDetails> {
  const reg = normalizeRegion(region);
  const data = await request(`/tv/${tmdbId}`, {
    append_to_response: 'aggregate_credits,external_ids,videos,recommendations,similar,content_ratings,watch/providers',
  });
  const recs = cards(data.recommendations?.results, 'tv');
  const similar = cards(data.similar?.results, 'tv');
  const allSeasons = ((data.seasons ?? []) as Raw[]).map((s) => ({
    seasonNumber: s.season_number,
    name: s.name,
    episodeCount: s.episode_count ?? 0,
    poster: s.poster_path ?? null,
    airDate: s.air_date || null,
  }));
  const regular = allSeasons.filter((s) => s.seasonNumber > 0 && s.episodeCount > 0);
  const specials = allSeasons.filter((s) => s.seasonNumber === 0 && s.episodeCount > 0);
  const runtimes = (data.episode_run_time ?? []) as number[];
  return {
    tmdbId: data.id,
    mediaType: 'tv',
    title: data.name,
    originalTitle: data.original_name ?? null,
    tagline: data.tagline || null,
    overview: data.overview ?? '',
    poster: data.poster_path ?? null,
    backdrop: data.backdrop_path ?? null,
    releaseDate: data.first_air_date || null,
    lastAirDate: data.last_air_date || null,
    status: data.status ?? null,
    inProduction: Boolean(data.in_production),
    numberOfSeasons: data.number_of_seasons ?? regular.length,
    numberOfEpisodes: data.number_of_episodes ?? null,
    episodeRuntime: runtimes.length ? Math.round(runtimes.reduce((a, b) => a + b, 0) / runtimes.length) : null,
    voteAverage: data.vote_average ?? 0,
    voteCount: data.vote_count ?? 0,
    genres: named(data.genres),
    certification: tvCertification(data.content_ratings, reg),
    imdbId: data.external_ids?.imdb_id ?? null,
    creators: named(data.created_by),
    networks: ((data.networks ?? []) as Raw[]).map((n) => ({ id: n.id, name: n.name, logo: n.logo_path ?? null })),
    cast: mapCast(data.aggregate_credits ?? data.credits),
    trailer: pickTrailer(data.videos),
    recommendations: (recs.length ? recs : similar).slice(0, 20),
    providers: mapProviders(data['watch/providers'], reg),
    seasons: regular.length ? [...regular, ...specials] : allSeasons,
    nextEpisodeToAir: mapEpisodeRef(data.next_episode_to_air),
    lastEpisodeToAir: mapEpisodeRef(data.last_episode_to_air),
  };
}

async function getSeason(tmdbId: number, seasonNumber: number): Promise<SeasonDetails> {
  const data = await request(`/tv/${tmdbId}/season/${seasonNumber}`);
  return {
    tmdbId,
    seasonNumber: data.season_number,
    name: data.name,
    overview: data.overview ?? '',
    airDate: data.air_date || null,
    poster: data.poster_path ?? null,
    episodes: ((data.episodes ?? []) as Raw[]).map((ep) => ({
      seasonNumber: ep.season_number,
      episodeNumber: ep.episode_number,
      name: ep.name ?? `Episode ${ep.episode_number}`,
      overview: ep.overview ?? '',
      still: ep.still_path ?? null,
      airDate: ep.air_date || null,
      runtime: ep.runtime ?? null,
      voteAverage: ep.vote_average ?? 0,
    })),
  };
}

async function getPerson(personId: number): Promise<PersonDetails> {
  const data = await request(`/person/${personId}`, { append_to_response: 'combined_credits,external_ids' });
  const seen = new Set<string>();
  const credits = [...(data.combined_credits?.cast ?? []), ...(data.combined_credits?.crew ?? [])]
    .filter((c: Raw) => c.media_type === 'movie' || c.media_type === 'tv')
    .sort((a: Raw, b: Raw) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
    .filter((c: Raw) => {
      const key = `${c.media_type}:${c.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((c: Raw): MediaCard | null => {
      const card = toCard(c);
      return card ? { ...card, role: c.character || c.job || null } : null;
    })
    .filter((c): c is MediaCard => c !== null)
    .slice(0, 60);
  return {
    id: data.id,
    name: data.name,
    biography: data.biography ?? '',
    profile: data.profile_path ?? null,
    birthday: data.birthday || null,
    deathday: data.deathday || null,
    placeOfBirth: data.place_of_birth || null,
    knownFor: data.known_for_department ?? null,
    imdbId: data.external_ids?.imdb_id ?? data.imdb_id ?? null,
    credits,
  };
}

function playbackUrl(mediaType: 'movie' | 'tv', tmdbId: number, season?: number, episode?: number) {
  if (mediaType === 'movie') return `${PLAYBACK_BASE}/embed/movie/${tmdbId}`;
  return `${PLAYBACK_BASE}/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}`;
}

/* ------------------------------------------------------------------ */
/* Router — same paths and validation as the server's /api            */
/* ------------------------------------------------------------------ */

const bad = (message: string) => new ApiError(message, 'BAD_REQUEST', 400);

function positiveInt(value: unknown, label: string) {
  const n = Number(value ?? NaN);
  if (!Number.isInteger(n) || n <= 0) throw bad(`Invalid ${label}`);
  return n;
}

function nonNegativeInt(value: unknown, label: string) {
  const n = value == null || value === '' ? NaN : Number(value);
  if (!Number.isInteger(n) || n < 0) throw bad(`Invalid ${label}`);
  return n;
}

function mediaTypeParam(value: string | undefined): 'movie' | 'tv' {
  if (value !== 'movie' && value !== 'tv') throw bad('type must be movie or tv');
  return value;
}

/** Answers an API path (e.g. `/tv/1399/season/1`) without a server. */
export async function localGet(path: string): Promise<unknown> {
  const url = new URL(path, 'https://local.invalid');
  const q = url.searchParams;
  const parts = url.pathname.split('/').filter(Boolean);
  const [root, a, b, c] = parts;

  switch (`${root}/${parts.length}`) {
    case 'trending/2':
      if (!['movie', 'tv', 'all'].includes(a)) throw bad('type must be movie, tv or all');
      return getTrending(a, q.get('page'), q.get('window'));
    case 'lists/2':
      if (!Object.hasOwn(LIST_KINDS, a)) throw bad(`Unknown list: ${a}`);
      return getList(a, q.get('page'));
    case 'discover/2':
      return discover(mediaTypeParam(a), {
        genre: q.get('genre'),
        sort: q.get('sort'),
        year: q.get('year'),
        rating: q.get('rating'),
        page: q.get('page'),
      });
    case 'genres/2':
      return getGenres(mediaTypeParam(a));
    case 'search/1': {
      const type = q.get('type') ?? 'all';
      if (!['all', 'movie', 'tv', 'person'].includes(type)) throw bad('Invalid search type');
      return search((q.get('q') ?? '').slice(0, 200), type, q.get('page'));
    }
    case 'movie/2':
      return getMovie(positiveInt(a, 'movie id'), q.get('region'));
    case 'tv/2':
      return getTv(positiveInt(a, 'show id'), q.get('region'));
    case 'tv/4':
      if (b !== 'season') break;
      return getSeason(positiveInt(a, 'show id'), nonNegativeInt(c, 'season number'));
    case 'person/2':
      return getPerson(positiveInt(a, 'person id'));
    case 'playback/3': {
      const mediaType = mediaTypeParam(a);
      const tmdbId = positiveInt(b, 'id');
      if (mediaType === 'movie') return { embedUrl: playbackUrl(mediaType, tmdbId), mediaType, tmdbId } satisfies PlaybackInfo;
      const season = nonNegativeInt(q.get('season'), 'season');
      const episode = positiveInt(q.get('episode'), 'episode');
      return { embedUrl: playbackUrl(mediaType, tmdbId, season, episode), mediaType, tmdbId, season, episode } satisfies PlaybackInfo;
    }
  }
  throw new ApiError('Not found', 'NOT_FOUND', 404);
}
