import { TtlCache } from './cache.js';
import { config } from './config.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const TTL = {
  list: 15 * MINUTE,
  search: 5 * MINUTE,
  details: HOUR,
  genres: 24 * HOUR,
};

const cache = new TtlCache(800);

export class TmdbError extends Error {
  /** @param {string} message @param {{ status: number, code: string }} info */
  constructor(message, { status, code }) {
    super(message);
    this.name = 'TmdbError';
    this.status = status;
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* Credentials                                                         */
/* ------------------------------------------------------------------ */

/** TMDB hands out two kinds of credential; both work, but they're sent differently. */
export function credentialKind(credential) {
  const value = String(credential ?? '').trim();
  if (!value) return 'none';
  if (value.startsWith('eyJ') && value.split('.').length === 3) return 'v4-token';
  return 'v3-key';
}

export function setTmdbCredential(credential) {
  const next = String(credential ?? '').trim();
  if (next !== config.tmdbCredential) {
    config.tmdbCredential = next;
    cache.clear();
  }
}

export function hasTmdbCredential() {
  return Boolean(config.tmdbCredential);
}

export function clearCache() {
  cache.clear();
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

function cacheKey(path, params) {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return `${path}?${sorted}`;
}

async function rawRequest(path, params, credential) {
  if (!credential) {
    throw new TmdbError('No TMDB API key is set yet.', { status: 503, code: 'TMDB_KEY_MISSING' });
  }
  const url = new URL(`${config.tmdbBaseUrl}${path}`);
  const headers = { Accept: 'application/json' };
  if (credentialKind(credential) === 'v4-token') {
    headers.Authorization = `Bearer ${credential}`;
  } else {
    url.searchParams.set('api_key', credential);
  }
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(12_000) });
  } catch {
    throw new TmdbError('Couldn’t reach TMDB. Check your internet connection.', {
      status: 504,
      code: 'TMDB_UNREACHABLE',
    });
  }

  if (res.status === 401) {
    throw new TmdbError('TMDB rejected your API key.', { status: 401, code: 'TMDB_KEY_INVALID' });
  }
  if (res.status === 404) {
    throw new TmdbError('That title wasn’t found on TMDB.', { status: 404, code: 'NOT_FOUND' });
  }
  if (res.status === 429) {
    throw new TmdbError('TMDB is rate-limiting requests. Try again in a moment.', {
      status: 429,
      code: 'TMDB_RATE_LIMITED',
    });
  }
  if (!res.ok) {
    throw new TmdbError(`TMDB returned an error (${res.status}).`, { status: 502, code: 'TMDB_ERROR' });
  }
  return res.json();
}

function tmdb(path, params = {}, ttl = TTL.details) {
  const credential = config.tmdbCredential;
  return cache.wrap(cacheKey(path, params), ttl, () => rawRequest(path, params, credential));
}

/** Checks a credential against TMDB without saving it. */
export async function validateTmdbCredential(credential) {
  const value = String(credential ?? '').trim();
  const kind = credentialKind(value);
  if (kind === 'none') {
    return { ok: false, code: 'TMDB_KEY_MISSING', message: 'Paste your TMDB API key first.', kind };
  }
  try {
    await rawRequest('/authentication', {}, value);
    return { ok: true, kind };
  } catch (err) {
    if (err instanceof TmdbError) {
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

function normalizePage(page) {
  const n = Number(page);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), 500);
}

function toCard(item, forcedType) {
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

function toPersonCard(item) {
  return {
    id: item.id,
    name: item.name,
    profile: item.profile_path ?? null,
    knownFor: item.known_for_department ?? null,
    knownForTitles: (item.known_for ?? [])
      .map((k) => k.title ?? k.name)
      .filter(Boolean)
      .slice(0, 3),
  };
}

function mapPaged(data, forcedType) {
  return {
    results: (data.results ?? []).map((r) => toCard(r, forcedType)).filter(Boolean),
    page: data.page ?? 1,
    totalPages: Math.min(data.total_pages ?? 1, 500),
    totalResults: data.total_results ?? 0,
  };
}

function mapCast(credits, limit = 18) {
  return (credits?.cast ?? [])
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

function pickTrailer(videos) {
  const list = (videos?.results ?? []).filter((v) => v.site === 'YouTube' && v.key);
  const score = (v) =>
    (v.type === 'Trailer' ? 100 : v.type === 'Teaser' ? 50 : 0) +
    (v.official ? 20 : 0) +
    (v.iso_639_1 === 'en' ? 10 : 0);
  const best = list.sort((a, b) => score(b) - score(a))[0];
  return best ? { key: best.key, name: best.name } : null;
}

function mapProviders(watch, region) {
  const entry = watch?.results?.[region];
  if (!entry) return null;
  const map = (list) =>
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

function movieCertification(releaseDates, region) {
  const results = releaseDates?.results ?? [];
  for (const code of [region, 'US']) {
    const entry = results.find((r) => r.iso_3166_1 === code);
    const cert = entry?.release_dates
      ?.slice()
      .sort((a, b) => (a.type === 3 ? -1 : 0) - (b.type === 3 ? -1 : 0))
      .find((d) => d.certification)?.certification;
    if (cert) return cert;
  }
  return null;
}

function tvCertification(contentRatings, region) {
  const results = contentRatings?.results ?? [];
  for (const code of [region, 'US']) {
    const rating = results.find((r) => r.iso_3166_1 === code)?.rating;
    if (rating) return rating;
  }
  return null;
}

function normalizeRegion(region) {
  const r = String(region ?? '').toUpperCase();
  return /^[A-Z]{2}$/.test(r) ? r : 'US';
}

function mapEpisodeRef(ep) {
  if (!ep) return null;
  return {
    seasonNumber: ep.season_number,
    episodeNumber: ep.episode_number,
    name: ep.name ?? '',
    airDate: ep.air_date || null,
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export const LIST_KINDS = {
  popular_movies: { path: '/movie/popular', mediaType: 'movie' },
  now_playing: { path: '/movie/now_playing', mediaType: 'movie' },
  upcoming: { path: '/movie/upcoming', mediaType: 'movie' },
  top_rated_movies: { path: '/movie/top_rated', mediaType: 'movie' },
  popular_tv: { path: '/tv/popular', mediaType: 'tv' },
  airing_today: { path: '/tv/airing_today', mediaType: 'tv' },
  on_the_air: { path: '/tv/on_the_air', mediaType: 'tv' },
  top_rated_tv: { path: '/tv/top_rated', mediaType: 'tv' },
};

export async function getList(kind, page) {
  const entry = LIST_KINDS[kind];
  if (!entry) throw new TmdbError(`Unknown list: ${kind}`, { status: 400, code: 'BAD_REQUEST' });
  const data = await tmdb(entry.path, { page: normalizePage(page) }, TTL.list);
  return mapPaged(data, entry.mediaType);
}

export async function getTrending(type, page, window = 'week') {
  const t = type === 'movie' || type === 'tv' ? type : 'all';
  const w = window === 'day' ? 'day' : 'week';
  const data = await tmdb(`/trending/${t}/${w}`, { page: normalizePage(page) }, TTL.list);
  return mapPaged(data, t === 'all' ? undefined : t);
}

export async function getGenres(type) {
  const t = type === 'tv' ? 'tv' : 'movie';
  const data = await tmdb(`/genre/${t}/list`, {}, TTL.genres);
  return (data.genres ?? []).map((g) => ({ id: g.id, name: g.name }));
}

const SORTS = {
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

export async function discover(type, { genre, sort, year, rating, page }) {
  const t = type === 'tv' ? 'tv' : 'movie';
  const params = {
    include_adult: 'false',
    page: normalizePage(page),
    ...(SORTS[sort] ?? SORTS.popular)(t),
  };
  if (genre && /^\d+(,\d+)*$/.test(String(genre))) params.with_genres = String(genre);

  const y = String(year ?? '');
  const dateField = t === 'movie' ? 'primary_release_date' : 'first_air_date';
  if (/^\d{4}$/.test(y)) {
    params[t === 'movie' ? 'primary_release_year' : 'first_air_date_year'] = y;
  } else if (/^\d{3}0s$/.test(y)) {
    const start = Number(y.slice(0, 4));
    params[`${dateField}.gte`] = `${start}-01-01`;
    const end = `${start + 9}-12-31`;
    const existing = params[`${dateField}.lte`];
    params[`${dateField}.lte`] = existing && existing < end ? existing : end;
  }

  const minRating = Number(rating);
  if (Number.isFinite(minRating) && minRating > 0 && minRating <= 10) {
    params['vote_average.gte'] = minRating;
    params['vote_count.gte'] = Math.max(Number(params['vote_count.gte'] ?? 0), 100);
  }

  const data = await tmdb(`/discover/${t}`, params, TTL.list);
  return mapPaged(data, t);
}

export async function search(query, type, page) {
  const q = String(query ?? '').trim();
  const p = normalizePage(page);
  const empty = { results: [], people: [], page: 1, totalPages: 1, totalResults: 0 };
  if (!q) return empty;

  if (type === 'movie' || type === 'tv') {
    const data = await tmdb(`/search/${type}`, { query: q, include_adult: 'false', page: p }, TTL.search);
    return { ...mapPaged(data, type), people: [] };
  }
  if (type === 'person') {
    const data = await tmdb('/search/person', { query: q, include_adult: 'false', page: p }, TTL.search);
    return {
      results: [],
      people: (data.results ?? []).map(toPersonCard),
      page: data.page ?? 1,
      totalPages: Math.min(data.total_pages ?? 1, 500),
      totalResults: data.total_results ?? 0,
    };
  }
  const data = await tmdb('/search/multi', { query: q, include_adult: 'false', page: p }, TTL.search);
  const raw = data.results ?? [];
  return {
    results: raw.map((r) => toCard(r)).filter(Boolean),
    people: raw.filter((r) => r.media_type === 'person').map(toPersonCard),
    page: data.page ?? 1,
    totalPages: Math.min(data.total_pages ?? 1, 500),
    totalResults: data.total_results ?? 0,
  };
}

export async function getMovie(tmdbId, region) {
  const reg = normalizeRegion(region);
  const data = await tmdb(`/movie/${tmdbId}`, {
    append_to_response: 'credits,external_ids,videos,recommendations,similar,release_dates,watch/providers',
  });
  const recs = mapPaged(data.recommendations ?? {}, 'movie').results;
  const similar = mapPaged(data.similar ?? {}, 'movie').results;
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
    genres: (data.genres ?? []).map((g) => ({ id: g.id, name: g.name })),
    certification: movieCertification(data.release_dates, reg),
    imdbId: data.imdb_id ?? data.external_ids?.imdb_id ?? null,
    directors: (data.credits?.crew ?? []).filter((c) => c.job === 'Director').map((c) => ({ id: c.id, name: c.name })),
    writers: (data.credits?.crew ?? [])
      .filter((c) => c.department === 'Writing')
      .slice(0, 3)
      .map((c) => ({ id: c.id, name: c.name })),
    cast: mapCast(data.credits),
    trailer: pickTrailer(data.videos),
    recommendations: (recs.length ? recs : similar).slice(0, 20),
    providers: mapProviders(data['watch/providers'], reg),
    collection: data.belongs_to_collection
      ? { id: data.belongs_to_collection.id, name: data.belongs_to_collection.name }
      : null,
  };
}

export async function getTv(tmdbId, region) {
  const reg = normalizeRegion(region);
  const data = await tmdb(`/tv/${tmdbId}`, {
    append_to_response: 'aggregate_credits,external_ids,videos,recommendations,similar,content_ratings,watch/providers',
  });
  const recs = mapPaged(data.recommendations ?? {}, 'tv').results;
  const similar = mapPaged(data.similar ?? {}, 'tv').results;
  const allSeasons = (data.seasons ?? []).map((s) => ({
    seasonNumber: s.season_number,
    name: s.name,
    episodeCount: s.episode_count ?? 0,
    poster: s.poster_path ?? null,
    airDate: s.air_date || null,
  }));
  const regular = allSeasons.filter((s) => s.seasonNumber > 0 && s.episodeCount > 0);
  const specials = allSeasons.filter((s) => s.seasonNumber === 0 && s.episodeCount > 0);
  const runtimes = data.episode_run_time ?? [];
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
    genres: (data.genres ?? []).map((g) => ({ id: g.id, name: g.name })),
    certification: tvCertification(data.content_ratings, reg),
    imdbId: data.external_ids?.imdb_id ?? null,
    creators: (data.created_by ?? []).map((c) => ({ id: c.id, name: c.name })),
    networks: (data.networks ?? []).map((n) => ({ id: n.id, name: n.name, logo: n.logo_path ?? null })),
    cast: mapCast(data.aggregate_credits ?? data.credits),
    trailer: pickTrailer(data.videos),
    recommendations: (recs.length ? recs : similar).slice(0, 20),
    providers: mapProviders(data['watch/providers'], reg),
    seasons: regular.length ? [...regular, ...specials] : allSeasons,
    nextEpisodeToAir: mapEpisodeRef(data.next_episode_to_air),
    lastEpisodeToAir: mapEpisodeRef(data.last_episode_to_air),
  };
}

export async function getSeason(tmdbId, seasonNumber) {
  const data = await tmdb(`/tv/${tmdbId}/season/${seasonNumber}`);
  return {
    tmdbId,
    seasonNumber: data.season_number,
    name: data.name,
    overview: data.overview ?? '',
    airDate: data.air_date || null,
    poster: data.poster_path ?? null,
    episodes: (data.episodes ?? []).map((ep) => ({
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

export async function getPerson(personId) {
  const data = await tmdb(`/person/${personId}`, { append_to_response: 'combined_credits,external_ids' });
  const seen = new Set();
  const credits = [...(data.combined_credits?.cast ?? []), ...(data.combined_credits?.crew ?? [])]
    .filter((c) => c.media_type === 'movie' || c.media_type === 'tv')
    .sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
    .filter((c) => {
      const key = `${c.media_type}:${c.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((c) => {
      const card = toCard(c);
      return card ? { ...card, role: c.character || c.job || null } : null;
    })
    .filter(Boolean)
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
