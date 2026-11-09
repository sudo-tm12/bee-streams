import { continueStore, isFinished, progressKey, progressStore } from './library';
import { watchHref } from './format';
import type { MediaType, SeasonSummary } from './types';

/** Where "Play" should go for a title: the episode you were on, or S1E1. */
export function resumeTarget(mediaType: MediaType, tmdbId: number) {
  if (mediaType === 'movie') return { season: undefined, episode: undefined };
  const entry = continueStore.get().find((e) => e.mediaType === 'tv' && e.tmdbId === tmdbId);
  if (entry?.season != null && entry.episode != null) return { season: entry.season, episode: entry.episode };
  return { season: 1, episode: 1 };
}

export function resumeHref(mediaType: MediaType, tmdbId: number) {
  const t = resumeTarget(mediaType, tmdbId);
  return watchHref(mediaType, tmdbId, t.season, t.episode);
}

/**
 * For a show's detail page: the next episode to play based on what you've watched.
 * If the last episode you opened is finished, moves to the following one.
 */
export function nextUpForShow(tmdbId: number, seasons: SeasonSummary[]) {
  const entry = continueStore.get().find((e) => e.mediaType === 'tv' && e.tmdbId === tmdbId);
  const regular = seasons.filter((s) => s.seasonNumber > 0);
  const first = regular[0] ?? seasons[0];
  if (!entry || entry.season == null || entry.episode == null) {
    return { season: first?.seasonNumber ?? 1, episode: 1, started: false };
  }
  const rec = progressStore.get()[progressKey('tv', tmdbId, entry.season, entry.episode)];
  if (!isFinished(rec)) return { season: entry.season, episode: entry.episode, started: true };

  const season = seasons.find((s) => s.seasonNumber === entry.season);
  if (season && entry.episode < season.episodeCount) {
    return { season: entry.season, episode: entry.episode + 1, started: true };
  }
  const nextSeason = regular.find((s) => s.seasonNumber > entry.season!);
  if (nextSeason) return { season: nextSeason.seasonNumber, episode: 1, started: true };
  return { season: entry.season, episode: entry.episode, started: true };
}
