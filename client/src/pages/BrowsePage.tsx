import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { Icon } from '../components/Icon';
import { InfiniteGrid } from '../components/InfiniteGrid';
import { api } from '../lib/api';
import type { MediaType } from '../lib/types';
import { useApi } from '../lib/useApi';

const SORTS = [
  ['popular', 'Most popular'],
  ['top', 'Highest rated'],
  ['newest', 'Newest'],
  ['votes', 'Most voted'],
] as const;

const RATINGS = [
  ['', 'Any rating'],
  ['6', '6+'],
  ['7', '7+'],
  ['8', '8+'],
] as const;

function yearOptions() {
  const now = new Date().getFullYear();
  const years = Array.from({ length: 6 }, (_, i) => String(now - i));
  const decades = ['2020s', '2010s', '2000s', '1990s', '1980s', '1970s', '1960s', '1950s'];
  return { years, decades };
}

export function BrowsePage({ mediaType }: { mediaType: MediaType }) {
  const [params, setParams] = useSearchParams();
  const genre = params.get('genre') ?? '';
  const sort = params.get('sort') ?? 'popular';
  const year = params.get('year') ?? '';
  const rating = params.get('rating') ?? '';

  const genres = useApi(`/genres/${mediaType}`, () => api.genres(mediaType));
  const { years, decades } = useMemo(yearOptions, []);
  const chipsRef = useRef<HTMLDivElement>(null);

  // Keep the selected genre chip visible (e.g. when arriving from a "Science Fiction" link).
  useEffect(() => {
    const active = chipsRef.current?.querySelector<HTMLElement>('.chip.is-active');
    active?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [genre, genres.data]);

  const path = useMemo(() => {
    const q = new URLSearchParams();
    if (genre) q.set('genre', genre);
    if (sort) q.set('sort', sort);
    if (year) q.set('year', year);
    if (rating) q.set('rating', rating);
    return `/discover/${mediaType}?${q.toString()}`;
  }, [mediaType, genre, sort, year, rating]);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'sort' && value === 'popular') next.delete('sort');
    setParams(next, { replace: true });
  }

  const activeFilters = Boolean(genre || year || rating || (sort && sort !== 'popular'));
  const title = mediaType === 'movie' ? 'Movies' : 'TV Shows';
  const genreName = genres.data?.find((g) => String(g.id) === genre)?.name;

  return (
    <div className="page page--browse">
      <header className="page-head page-pad">
        <div>
          <h1 className="page-title">{genreName ? `${genreName} ${mediaType === 'movie' ? 'movies' : 'shows'}` : title}</h1>
          <p className="page-sub">
            {mediaType === 'movie' ? 'Browse thousands of films.' : 'Find your next series.'} Filters update instantly.
          </p>
        </div>
      </header>

      <div className="filters page-pad" role="group" aria-label="Filters">
        <div className="chips" role="radiogroup" aria-label="Genre" ref={chipsRef}>
          <button
            type="button"
            className={`chip${genre === '' ? ' is-active' : ''}`}
            role="radio"
            aria-checked={genre === ''}
            onClick={() => update('genre', '')}
          >
            All genres
          </button>
          {(genres.data ?? []).map((g) => (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={genre === String(g.id)}
              className={`chip${genre === String(g.id) ? ' is-active' : ''}`}
              onClick={() => update('genre', genre === String(g.id) ? '' : String(g.id))}
            >
              {g.name}
            </button>
          ))}
        </div>

        <div className="filters__selects">
          <label className="select">
            <span className="sr-only">Sort by</span>
            <Icon name="sliders" size={15} />
            <select value={sort} onChange={(e) => update('sort', e.target.value)}>
              {SORTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="select">
            <span className="sr-only">Release year</span>
            <Icon name="clock" size={15} />
            <select value={year} onChange={(e) => update('year', e.target.value)}>
              <option value="">Any year</option>
              <optgroup label="Year">
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Decade">
                {decades.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label className="select">
            <span className="sr-only">Minimum rating</span>
            <Icon name="star" size={14} />
            <select value={rating} onChange={(e) => update('rating', e.target.value)}>
              {RATINGS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {activeFilters && (
            <button type="button" className="btn btn--text btn--sm" onClick={() => setParams({}, { replace: true })}>
              <Icon name="x" size={14} /> Reset
            </button>
          )}
        </div>
      </div>

      <InfiniteGrid
        path={path}
        emptyTitle="No titles match these filters"
        emptyText="Try a different genre or widen the year range."
      />
    </div>
  );
}
