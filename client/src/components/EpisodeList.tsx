import { Link } from 'react-router';
import { isFuture, longDate, runtime, tmdbImage, watchHref } from '../lib/format';
import { isFinished, markWatched, progressFraction, progressKey, useProgressMap } from '../lib/library';
import type { Episode } from '../lib/types';
import { Icon } from './Icon';

interface Props {
  tmdbId: number;
  episodes: Episode[];
  current?: { season: number; episode: number };
  currentLabel?: string;
  compact?: boolean;
  onPick?: () => void;
}

export function EpisodeList({ tmdbId, episodes, current, currentLabel = 'Now playing', compact = false, onPick }: Props) {
  const progress = useProgressMap();

  if (episodes.length === 0) {
    return <p className="muted page-pad-inline">No episode information for this season yet.</p>;
  }

  return (
    <ol className={`episodes${compact ? ' episodes--compact' : ''}`}>
      {episodes.map((ep) => {
        const key = progressKey('tv', tmdbId, ep.seasonNumber, ep.episodeNumber);
        const rec = progress[key];
        const fraction = progressFraction(rec);
        const watched = isFinished(rec);
        const upcoming = isFuture(ep.airDate);
        const isCurrent = current?.season === ep.seasonNumber && current?.episode === ep.episodeNumber;
        const still = tmdbImage(ep.still, 'w300');
        const target = { mediaType: 'tv' as const, tmdbId, season: ep.seasonNumber, episode: ep.episodeNumber };

        return (
          <li
            key={ep.episodeNumber}
            className={`episode${isCurrent ? ' is-current' : ''}${upcoming ? ' is-upcoming' : ''}${watched ? ' is-watched' : ''}`}
          >
            <Link
              to={watchHref('tv', tmdbId, ep.seasonNumber, ep.episodeNumber)}
              className="episode__link"
              onClick={onPick}
              aria-current={isCurrent ? 'true' : undefined}
            >
              <span className="episode__thumb">
                {still ? <img src={still} alt="" loading="lazy" /> : <Icon name="tv" size={22} />}
                <span className="episode__play" aria-hidden="true">
                  <Icon name="play" size={18} />
                </span>
                {fraction != null && fraction > 0 && !watched && (
                  <span className="card__progress">
                    <span style={{ width: `${Math.max(4, fraction * 100)}%` }} />
                  </span>
                )}
              </span>
              <span className="episode__body">
                <span className="episode__title">
                  <span className="episode__num">{ep.episodeNumber}.</span> {ep.name}
                </span>
                <span className="episode__meta">
                  {upcoming ? (
                    <span className="pill pill--accent">Airs {longDate(ep.airDate)}</span>
                  ) : (
                    [runtime(ep.runtime), longDate(ep.airDate)].filter(Boolean).join(' · ')
                  )}
                  {isCurrent && <span className="pill">{currentLabel}</span>}
                </span>
                {!compact && ep.overview && <span className="episode__overview">{ep.overview}</span>}
              </span>
            </Link>
            <button
              type="button"
              className={`icon-btn episode__watched${watched ? ' is-on' : ''}`}
              onClick={() => markWatched(target, !watched)}
              aria-pressed={watched}
              aria-label={watched ? `Mark episode ${ep.episodeNumber} as unwatched` : `Mark episode ${ep.episodeNumber} as watched`}
              title={watched ? 'Watched — click to undo' : 'Mark as watched'}
            >
              <Icon name="check" size={16} />
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function SeasonPicker({
  seasons,
  value,
  onChange,
}: {
  seasons: Array<{ seasonNumber: number; name: string; episodeCount: number }>;
  value: number;
  onChange: (n: number) => void;
}) {
  if (seasons.length <= 1 && seasons[0]?.seasonNumber === value) {
    return <span className="season-single">{seasons[0]?.name ?? `Season ${value}`}</span>;
  }
  return (
    <label className="select select--season">
      <span className="sr-only">Season</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {seasons.map((s) => (
          <option key={s.seasonNumber} value={s.seasonNumber}>
            {s.name} ({s.episodeCount} ep)
          </option>
        ))}
      </select>
      <Icon name="chevronDown" size={15} />
    </label>
  );
}
