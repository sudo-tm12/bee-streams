import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { detailHref, rating, tmdbImage, year } from '../lib/format';
import { resumeHref } from '../lib/resume';
import type { MediaCard } from '../lib/types';
import { Icon } from './Icon';
import { ListButton } from './ListButton';

const ROTATE_MS = 9000;

export function Hero({ items }: { items: MediaCard[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<number | null>(null);
  const count = items.length;

  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (paused || count < 2) return;
    timer.current = window.setTimeout(() => go(index + 1), ROTATE_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [index, paused, count, go]);

  // Preload the next backdrop so rotation never flashes.
  useEffect(() => {
    const next = items[(index + 1) % Math.max(1, count)];
    const src = next && tmdbImage(next.backdrop, 'w1280');
    if (src) new Image().src = src;
  }, [index, items, count]);

  if (count === 0) return null;
  const item = items[index];
  const kind = item.mediaType === 'movie' ? 'Movie' : 'Series';
  const score = rating(item.voteAverage);

  return (
    <section
      className="hero"
      aria-roledescription="carousel"
      aria-label="Featured"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {items.map((it, i) => (
        <div
          key={`${it.mediaType}:${it.tmdbId}`}
          className={`hero__bg${i === index ? ' is-active' : ''}`}
          style={i === index || Math.abs(i - index) === 1 ? { backgroundImage: `url(${tmdbImage(it.backdrop, 'w1280')})` } : undefined}
          aria-hidden="true"
        />
      ))}
      <div className="hero__shade" aria-hidden="true" />

      <div className="hero__content page-pad" key={`${item.mediaType}:${item.tmdbId}`}>
        <p className="hero__eyebrow">
          <span className="pill pill--accent">Trending</span>
          <span>{kind}</span>
          {year(item.releaseDate) && <span>{year(item.releaseDate)}</span>}
          {score && (
            <span className="hero__score">
              <Icon name="star" size={13} /> {score}
            </span>
          )}
        </p>
        <h2 className="hero__title">{item.title}</h2>
        {item.overview && <p className="hero__overview">{item.overview}</p>}
        <div className="hero__actions">
          <Link to={resumeHref(item.mediaType, item.tmdbId)} className="btn btn--primary btn--lg">
            <Icon name="play" size={18} /> Play
          </Link>
          <Link to={detailHref(item.mediaType, item.tmdbId)} className="btn btn--glass btn--lg">
            <Icon name="info" size={18} /> More info
          </Link>
          <ListButton item={item} variant="icon" className="icon-btn--lg" />
        </div>
      </div>

      {count > 1 && (
        <div className="hero__nav page-pad">
          <div className="hero__dots" role="tablist" aria-label="Featured titles">
            {items.map((it, i) => (
              <button
                key={`${it.mediaType}:${it.tmdbId}`}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={it.title}
                className={`hero__dot${i === index ? ' is-active' : ''}${paused ? ' is-paused' : ''}`}
                onClick={() => go(i)}
              >
                <span style={i === index ? { animationDuration: `${ROTATE_MS}ms` } : undefined} />
              </button>
            ))}
          </div>
          <div className="hero__arrows">
            <button type="button" className="icon-btn icon-btn--glass" onClick={() => go(index - 1)} aria-label="Previous">
              <Icon name="chevronLeft" size={20} />
            </button>
            <button type="button" className="icon-btn icon-btn--glass" onClick={() => go(index + 1)} aria-label="Next">
              <Icon name="chevronRight" size={20} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function HeroSkeleton() {
  return (
    <section className="hero hero--skeleton" aria-hidden="true">
      <div className="hero__content page-pad">
        <div className="shimmer shimmer--line" style={{ width: 160 }} />
        <div className="shimmer shimmer--title" />
        <div className="shimmer shimmer--line" style={{ width: '42%' }} />
        <div className="shimmer shimmer--line" style={{ width: '36%' }} />
      </div>
    </section>
  );
}
