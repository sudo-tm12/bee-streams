export type MediaType = 'movie' | 'tv';

export interface MediaCard {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  releaseDate: string | null;
  voteAverage: number;
  voteCount: number;
  genreIds: number[];
  role?: string | null;
}

export interface Paged<T> {
  results: T[];
  page: number;
  totalPages: number;
  totalResults: number;
}

export interface PersonCard {
  id: number;
  name: string;
  profile: string | null;
  knownFor: string | null;
  knownForTitles: string[];
}

export interface SearchResponse extends Paged<MediaCard> {
  people: PersonCard[];
}

export interface Genre {
  id: number;
  name: string;
}

export interface NamedRef {
  id: number;
  name: string;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile: string | null;
}

export interface Provider {
  id: number;
  name: string;
  logo: string | null;
}

export interface Providers {
  link: string | null;
  stream: Provider[];
  free: Provider[];
  ads: Provider[];
  rent: Provider[];
  buy: Provider[];
}

interface DetailsBase {
  tmdbId: number;
  title: string;
  originalTitle: string | null;
  tagline: string | null;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  releaseDate: string | null;
  status: string | null;
  voteAverage: number;
  voteCount: number;
  genres: Genre[];
  certification: string | null;
  imdbId: string | null;
  cast: CastMember[];
  trailer: { key: string; name: string } | null;
  recommendations: MediaCard[];
  providers: Providers | null;
}

export interface MovieDetails extends DetailsBase {
  mediaType: 'movie';
  runtime: number | null;
  directors: NamedRef[];
  writers: NamedRef[];
  collection: NamedRef | null;
}

export interface SeasonSummary {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  poster: string | null;
  airDate: string | null;
}

export interface EpisodeRef {
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  airDate: string | null;
}

export interface TvDetails extends DetailsBase {
  mediaType: 'tv';
  lastAirDate: string | null;
  inProduction: boolean;
  numberOfSeasons: number;
  numberOfEpisodes: number | null;
  episodeRuntime: number | null;
  creators: NamedRef[];
  networks: Provider[];
  seasons: SeasonSummary[];
  nextEpisodeToAir: EpisodeRef | null;
  lastEpisodeToAir: EpisodeRef | null;
}

export interface Episode {
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  overview: string;
  still: string | null;
  airDate: string | null;
  runtime: number | null;
  voteAverage: number;
}

export interface SeasonDetails {
  tmdbId: number;
  seasonNumber: number;
  name: string;
  overview: string;
  airDate: string | null;
  poster: string | null;
  episodes: Episode[];
}

export interface PersonDetails {
  id: number;
  name: string;
  biography: string;
  profile: string | null;
  birthday: string | null;
  deathday: string | null;
  placeOfBirth: string | null;
  knownFor: string | null;
  imdbId: string | null;
  credits: MediaCard[];
}

export interface PlaybackInfo {
  embedUrl: string;
  mediaType: MediaType;
  tmdbId: number;
  season?: number;
  episode?: number;
}

export type ListKind =
  | 'popular_movies'
  | 'now_playing'
  | 'upcoming'
  | 'top_rated_movies'
  | 'popular_tv'
  | 'airing_today'
  | 'on_the_air'
  | 'top_rated_tv';
