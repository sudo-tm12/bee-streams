/** Runtime configuration. The desktop shell sets these before starting the server. */
export const config = {
  tmdbBaseUrl: 'https://api.themoviedb.org/3',
  playbackBaseUrl: (process.env.PLAYBACK_BASE_URL ?? 'https://vidsrc.sh').replace(/\/$/, ''),
  /** TMDB v3 API key (32 hex chars) or v4 Read Access Token (long JWT). */
  tmdbCredential: (process.env.TMDB_API_KEY ?? '').trim(),
  port: Number(process.env.PORT ?? 4010),
  staticDir: process.env.STATIC_DIR?.trim() || '',
};
