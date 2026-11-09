import { config } from './config.js';

/** Builds the embed URL for the configured player (PLAYBACK_BASE_URL). */
export function getPlaybackUrl({ mediaType, tmdbId, season, episode }) {
  const base = config.playbackBaseUrl;
  if (mediaType === 'movie') return `${base}/embed/movie/${tmdbId}`;
  return `${base}/embed/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}`;
}
