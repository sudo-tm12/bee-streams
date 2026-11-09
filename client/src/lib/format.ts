const IMAGE_BASE = 'https://image.tmdb.org/t/p';

export type ImageSize = 'w92' | 'w154' | 'w185' | 'w300' | 'w342' | 'w500' | 'w780' | 'w1280' | 'h632' | 'original';

/** Builds a TMDB image URL. Accepts raw paths ("/abc.jpg") and legacy full URLs. */
export function tmdbImage(path: string | null | undefined, size: ImageSize): string | null {
  if (!path) return null;
  if (path.startsWith('http')) {
    return path.replace(/\/t\/p\/[a-z0-9]+\//, `/t/p/${size}/`);
  }
  return `${IMAGE_BASE}/${size}${path}`;
}

export function year(date: string | null | undefined): string {
  return date ? date.slice(0, 4) : '';
}

export function runtime(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function rating(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '';
  return value.toFixed(1);
}

const dateFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export function longDate(date: string | null | undefined): string {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '' : dateFormat.format(d);
}

export function isFuture(date: string | null | undefined): boolean {
  if (!date) return false;
  return new Date(`${date}T00:00:00`).getTime() > Date.now();
}

export function plural(n: number, word: string, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

export function age(birthday: string | null, deathday: string | null): number | null {
  if (!birthday) return null;
  const b = new Date(`${birthday}T00:00:00`);
  const end = deathday ? new Date(`${deathday}T00:00:00`) : new Date();
  let a = end.getFullYear() - b.getFullYear();
  const m = end.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && end.getDate() < b.getDate())) a -= 1;
  return Number.isFinite(a) ? a : null;
}

export function episodeLabel(season?: number, episode?: number) {
  if (season == null || episode == null) return '';
  return `S${season} · E${episode}`;
}

export function detailHref(mediaType: 'movie' | 'tv', tmdbId: number) {
  return mediaType === 'movie' ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;
}

export function watchHref(mediaType: 'movie' | 'tv', tmdbId: number, season?: number, episode?: number) {
  return mediaType === 'movie' ? `/watch/movie/${tmdbId}` : `/watch/tv/${tmdbId}/${season ?? 1}/${episode ?? 1}`;
}
