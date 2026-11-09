import { memo } from 'react';
import { Link } from 'react-router';
import { detailHref, rating, tmdbImage, year } from '../lib/format';
import type { MediaType } from '../lib/types';
import { Icon } from './Icon';
import { ListButton } from './ListButton';

export interface CardItem {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  poster: string | null;
  backdrop: string | null;
  releaseDate: string | null;
  voteAverage: number;
}

interface Props {
  item: CardItem;
  variant?: 'portrait' | 'landscape';
  href?: string;
  /** Replaces the default "2024 · Movie" line. */
  subtitle?: string;
  /** 0–1, draws a progress bar. */
  progress?: number | null;
  onRemove?: () => void;
  showListButton?: boolean;
  rank?: number;
}

function PosterCardImpl({
  item,
  variant = 'portrait',
  href,
  subtitle,
  progress,
  onRemove,
  showListButton = true,
  rank,
}: Props) {
  const landscape = variant === 'landscape';
  const image = landscape
    ? tmdbImage(item.backdrop, 'w780') ?? tmdbImage(item.poster, 'w500')
    : tmdbImage(item.poster, 'w342');
  const meta =
    subtitle ?? [year(item.releaseDate), item.mediaType === 'movie' ? 'Movie' : 'Series'].filter(Boolean).join(' · ');
  const score = rating(item.voteAverage);

  return (
    <article className={`card card--${variant}`}>
      <Link to={href ?? detailHref(item.mediaType, item.tmdbId)} className="card__link" draggable={false}>
        <div className="card__media">
          {image ? (
            <img src={image} alt="" loading="lazy" decoding="async" draggable={false} />
          ) : (
            <div className="card__fallback" aria-hidden="true">
              <Icon name={item.mediaType === 'movie' ? 'film' : 'tv'} size={28} />
              <span>{item.title}</span>
            </div>
          )}
          {landscape && (
            <span className="card__play" aria-hidden="true">
              <Icon name="play" size={20} />
            </span>
          )}
          {score && !landscape && (
            <span className="card__score" aria-label={`Rated ${score} out of 10`}>
              <Icon name="star" size={11} /> {score}
            </span>
          )}
          {rank != null && <span className="card__rank" aria-hidden="true">{rank}</span>}
          {progress != null && progress > 0 && (
            <span className="card__progress" aria-label={`${Math.round(progress * 100)}% watched`}>
              <span style={{ width: `${Math.max(4, Math.min(100, progress * 100))}%` }} />
            </span>
          )}
        </div>
        <div className="card__info">
          <h3 className="card__title">{item.title}</h3>
          {meta && <p className="card__meta">{meta}</p>}
        </div>
      </Link>
      <div className="card__actions">
        {showListButton && <ListButton item={item} variant="icon" />}
        {onRemove && (
          <button
            type="button"
            className="icon-btn icon-btn--glass"
            onClick={onRemove}
            aria-label={`Remove ${item.title}`}
            title="Remove"
          >
            <Icon name="x" size={16} />
          </button>
        )}
      </div>
    </article>
  );
}

export const PosterCard = memo(PosterCardImpl);

export function CardSkeleton({ variant = 'portrait' }: { variant?: 'portrait' | 'landscape' }) {
  return (
    <div className={`card card--${variant} card--skeleton`} aria-hidden="true">
      <div className="card__media shimmer" />
      <div className="card__info">
        <div className="shimmer shimmer--line" />
        <div className="shimmer shimmer--line shimmer--short" />
      </div>
    </div>
  );
}
