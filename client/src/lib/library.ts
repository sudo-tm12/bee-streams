import { createStore, useStore } from './store';
import type { MediaCard, MediaType } from './types';

/* ------------------------------------------------------------------ */
/* My List                                                             */
/* ------------------------------------------------------------------ */

export interface ListEntry {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  poster: string | null;
  backdrop: string | null;
  releaseDate: string | null;
  voteAverage: number;
  addedAt: number;
}

const isMediaType = (v: unknown): v is MediaType => v === 'movie' || v === 'tv';

export const myListStore = createStore<ListEntry[]>('bee:my-list', [], (raw) =>
  Array.isArray(raw)
    ? raw.filter((e): e is ListEntry => e && typeof e.tmdbId === 'number' && isMediaType(e.mediaType))
    : null,
);

export function useMyList() {
  return useStore(myListStore);
}

export function isInList(list: ListEntry[], mediaType: MediaType, tmdbId: number) {
  return list.some((e) => e.mediaType === mediaType && e.tmdbId === tmdbId);
}

export type ListItemInput = Pick<MediaCard, 'tmdbId' | 'mediaType' | 'title' | 'poster' | 'backdrop' | 'releaseDate' | 'voteAverage'>;

/** Adds or removes a title. Returns true when it's now in the list. */
export function toggleInList(item: ListItemInput): boolean {
  const list = myListStore.get();
  if (isInList(list, item.mediaType, item.tmdbId)) {
    myListStore.set(list.filter((e) => !(e.mediaType === item.mediaType && e.tmdbId === item.tmdbId)));
    return false;
  }
  myListStore.set([
    {
      tmdbId: item.tmdbId,
      mediaType: item.mediaType,
      title: item.title,
      poster: item.poster,
      backdrop: item.backdrop,
      releaseDate: item.releaseDate,
      voteAverage: item.voteAverage,
      addedAt: Date.now(),
    },
    ...list,
  ]);
  return true;
}

export function clearMyList() {
  myListStore.set([]);
}

/* ------------------------------------------------------------------ */
/* Continue watching (key kept compatible with the previous version)   */
/* ------------------------------------------------------------------ */

export interface ContinueEntry {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  /** TMDB image path (e.g. "/abc.jpg"); older versions stored a full URL. */
  posterPath?: string | null;
  backdropPath?: string | null;
  season?: number;
  episode?: number;
  episodeTitle?: string;
  progressSeconds?: number;
  durationSeconds?: number;
  updatedAt: string;
}

const MAX_CONTINUE = 40;

export const continueStore = createStore<ContinueEntry[]>('bee:continue-watching', [], (raw) =>
  Array.isArray(raw)
    ? raw.filter((e): e is ContinueEntry => e && typeof e.tmdbId === 'number' && isMediaType(e.mediaType))
    : null,
);

export function useContinueWatching() {
  const entries = useStore(continueStore);
  return [...entries].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function recordWatchStart(entry: Omit<ContinueEntry, 'updatedAt' | 'progressSeconds' | 'durationSeconds'>) {
  continueStore.set((list) => {
    const existing = list.find((e) => e.tmdbId === entry.tmdbId && e.mediaType === entry.mediaType);
    const sameEpisode = existing && existing.season === entry.season && existing.episode === entry.episode;
    const rest = list.filter((e) => !(e.tmdbId === entry.tmdbId && e.mediaType === entry.mediaType));
    const progress = sameEpisode
      ? { progressSeconds: existing.progressSeconds, durationSeconds: existing.durationSeconds }
      : {};
    return [{ ...entry, ...progress, updatedAt: new Date().toISOString() }, ...rest].slice(0, MAX_CONTINUE);
  });
}

export function removeFromContinue(mediaType: MediaType, tmdbId: number) {
  continueStore.set((list) => list.filter((e) => !(e.tmdbId === tmdbId && e.mediaType === mediaType)));
}

export function clearContinue() {
  continueStore.set([]);
}

/* ------------------------------------------------------------------ */
/* Per-title / per-episode progress                                    */
/* ------------------------------------------------------------------ */

export interface ProgressRecord {
  /** seconds watched */
  p: number;
  /** duration in seconds (0 if unknown) */
  d: number;
  /** last update (ms epoch) */
  t: number;
}

type ProgressMap = Record<string, ProgressRecord>;
const MAX_PROGRESS = 2000;

export const progressStore = createStore<ProgressMap>('bee:progress', {}, (raw) =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as ProgressMap) : null,
);

export function progressKey(mediaType: MediaType, tmdbId: number, season?: number, episode?: number) {
  return mediaType === 'movie' ? `movie:${tmdbId}` : `tv:${tmdbId}:${season ?? 1}:${episode ?? 1}`;
}

export function useProgressMap() {
  return useStore(progressStore);
}

export function progressFraction(rec: ProgressRecord | undefined): number | null {
  if (!rec || !rec.d || rec.d <= 0) return null;
  return Math.max(0, Math.min(1, rec.p / rec.d));
}

export function isFinished(rec: ProgressRecord | undefined) {
  const f = progressFraction(rec);
  return f != null && f >= 0.9;
}

let lastWrite = 0;
/** Saves playback progress (throttled — players report every second). */
export function saveProgress(
  target: { mediaType: MediaType; tmdbId: number; season?: number; episode?: number },
  seconds: number,
  duration: number | undefined,
  force = false,
) {
  if (!Number.isFinite(seconds) || seconds < 0) return;
  const now = Date.now();
  if (!force && now - lastWrite < 4000) return;
  lastWrite = now;
  const key = progressKey(target.mediaType, target.tmdbId, target.season, target.episode);
  const d = Number.isFinite(duration) && duration && duration > 0 ? duration : 0;
  if (d > 0 && seconds > d) seconds = d;

  progressStore.set((map) => {
    const next: ProgressMap = { ...map, [key]: { p: Math.round(seconds), d: Math.round(d || map[key]?.d || 0), t: now } };
    const keys = Object.keys(next);
    if (keys.length > MAX_PROGRESS) {
      keys
        .sort((a, b) => next[a].t - next[b].t)
        .slice(0, keys.length - MAX_PROGRESS)
        .forEach((k) => delete next[k]);
    }
    return next;
  });

  continueStore.set((list) =>
    list.map((e) =>
      e.tmdbId === target.tmdbId &&
      e.mediaType === target.mediaType &&
      (target.mediaType === 'movie' || (e.season === target.season && e.episode === target.episode))
        ? { ...e, progressSeconds: Math.round(seconds), durationSeconds: d || e.durationSeconds, updatedAt: new Date(now).toISOString() }
        : e,
    ),
  );
}

export function markWatched(target: { mediaType: MediaType; tmdbId: number; season?: number; episode?: number }, watched: boolean) {
  const key = progressKey(target.mediaType, target.tmdbId, target.season, target.episode);
  progressStore.set((map) => {
    const next = { ...map };
    if (watched) next[key] = { p: 1, d: 1, t: Date.now() };
    else delete next[key];
    return next;
  });
}

/* ------------------------------------------------------------------ */
/* Preferences                                                         */
/* ------------------------------------------------------------------ */

export const autoplayStore = createStore<boolean>('bee-streams-autoplay', true, (raw) =>
  typeof raw === 'boolean' ? raw : raw === 1 || raw === '1' ? true : raw === 0 || raw === '0' ? false : null,
);

export function useAutoplay() {
  return useStore(autoplayStore);
}

export const recentSearchStore = createStore<string[]>('bee:recent-searches', [], (raw) =>
  Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string').slice(0, 8) : null,
);

export function rememberSearch(q: string) {
  const term = q.trim();
  if (term.length < 2) return;
  recentSearchStore.set((list) => [term, ...list.filter((s) => s.toLowerCase() !== term.toLowerCase())].slice(0, 8));
}
