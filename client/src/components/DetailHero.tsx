import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { rating, tmdbImage } from '../lib/format';
import type { Genre, MediaType } from '../lib/types';
import { Icon } from './Icon';

interface Props {
  mediaType: MediaType;
  title: string;
  tagline: string | null;
  overview: string;
  poster: string | null;
  backdrop: string | null;
  meta: string[];
  certification: string | null;
  voteAverage: number;
  voteCount: number;
  genres: Genre[];
  actions: ReactNode;
  note?: ReactNode;
  facts?: ReactNode;
}

export function DetailHero(props: Props) {
  const { mediaType, title, tagline, overview, poster, backdrop, meta, certification, voteAverage, voteCount, genres } = props;
  const [expanded, setExpanded] = useState(false);
  const bg = tmdbImage(backdrop, 'w1280');
  const posterUrl = tmdbImage(poster, 'w500');
  const score = rating(voteAverage);
  const long = overview.length > 360;

  return (
    <section className="detail-hero">
      {bg && <div className="detail-hero__bg" style={{ backgroundImage: `url(${bg})` }} aria-hidden="true" />}
      <div className="detail-hero__shade" aria-hidden="true" />
      <div className="detail-hero__inner page-pad">
        <div className="detail-hero__poster">
          {posterUrl ? (
            <img src={posterUrl} alt={`${title} poster`} />
          ) : (
            <div className="card__fallback">
              <Icon name={mediaType === 'movie' ? 'film' : 'tv'} size={36} />
            </div>
          )}
        </div>
        <div className="detail-hero__body">
          <p className="detail-hero__eyebrow">{mediaType === 'movie' ? 'Movie' : 'Series'}</p>
          <h1 className="detail-hero__title">{title}</h1>
          {tagline && <p className="detail-hero__tagline">{tagline}</p>}
          <div className="detail-hero__meta">
            {score && (
              <span className="score" title={`${voteCount.toLocaleString()} votes on TMDB`}>
                <Icon name="star" size={15} /> {score}
                <span className="score__count">({voteCount >= 1000 ? `${(voteCount / 1000).toFixed(1)}k` : voteCount})</span>
              </span>
            )}
            {certification && <span className="cert">{certification}</span>}
            {meta.filter(Boolean).map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
          {genres.length > 0 && (
            <div className="detail-hero__genres">
              {genres.map((g) => (
                <Link key={g.id} to={`/${mediaType === 'movie' ? 'movies' : 'tv'}?genre=${g.id}`} className="chip chip--sm">
                  {g.name}
                </Link>
              ))}
            </div>
          )}
          <div className="detail-hero__actions">{props.actions}</div>
          {props.note && <div className="detail-hero__note">{props.note}</div>}
          {overview && (
            <div className="detail-hero__overview">
              <p className={long && !expanded ? 'clamp-4' : undefined}>{overview}</p>
              {long && (
                <button type="button" className="btn btn--text btn--sm" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>
          )}
          {props.facts}
        </div>
      </div>
    </section>
  );
}

export function DetailSkeleton() {
  return (
    <section className="detail-hero detail-hero--skeleton" aria-hidden="true">
      <div className="detail-hero__inner page-pad">
        <div className="detail-hero__poster shimmer" />
        <div className="detail-hero__body">
          <div className="shimmer shimmer--line" style={{ width: 80 }} />
          <div className="shimmer shimmer--title" />
          <div className="shimmer shimmer--line" style={{ width: '40%' }} />
          <div className="shimmer shimmer--line" style={{ width: '70%', marginTop: 24 }} />
          <div className="shimmer shimmer--line" style={{ width: '64%' }} />
          <div className="shimmer shimmer--line" style={{ width: '50%' }} />
        </div>
      </div>
    </section>
  );
}
