import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { CardSkeleton } from './PosterCard';
import { Icon } from './Icon';
import { ErrorState } from './States';

interface Props {
  title: string;
  children?: ReactNode;
  viewAllHref?: string;
  variant?: 'portrait' | 'landscape' | 'cast';
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  id?: string;
  action?: ReactNode;
}

/** Horizontally scrolling shelf with arrow buttons that appear only when there's more to see. */
export function Row({ title, children, viewAllHref, variant = 'portrait', loading, error, onRetry, id, action }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft <= 4,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, children, loading]);

  function scrollBy(dir: 1 | -1) {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(300, el.clientWidth * 0.85), behavior: 'smooth' });
  }

  return (
    <section className={`row row--${variant}`} id={id} aria-label={title}>
      <header className="row__head">
        <h2 className="row__title">{title}</h2>
        <div className="row__head-actions">
          {action}
          {viewAllHref && (
            <Link to={viewAllHref} className="row__link">
              View all <Icon name="chevronRight" size={15} />
            </Link>
          )}
        </div>
      </header>
      {error ? (
        <div className="page-pad">
          <ErrorState error={error} onRetry={onRetry} compact />
        </div>
      ) : (
        <div className="row__viewport">
          <button
            type="button"
            className="row__arrow row__arrow--left"
            onClick={() => scrollBy(-1)}
            aria-label={`Scroll ${title} left`}
            hidden={edges.start}
            tabIndex={-1}
          >
            <Icon name="chevronLeft" size={26} />
          </button>
          <div className="row__scroller" ref={scroller} onScroll={measure}>
            {loading
              ? Array.from({ length: 8 }, (_, i) => (
                  <CardSkeleton key={i} variant={variant === 'landscape' ? 'landscape' : 'portrait'} />
                ))
              : children}
          </div>
          <button
            type="button"
            className="row__arrow row__arrow--right"
            onClick={() => scrollBy(1)}
            aria-label={`Scroll ${title} right`}
            hidden={edges.end}
            tabIndex={-1}
          >
            <Icon name="chevronRight" size={26} />
          </button>
        </div>
      )}
    </section>
  );
}
