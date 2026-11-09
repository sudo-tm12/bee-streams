import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Icon } from '../components/Icon';
import { InfiniteGrid } from '../components/InfiniteGrid';
import { PosterCard } from '../components/PosterCard';
import { Row } from '../components/Row';
import { EmptyState, ErrorState, Spinner } from '../components/States';
import { focusSearch } from '../components/TopBar';
import { apiGet, api } from '../lib/api';
import { tmdbImage } from '../lib/format';
import { recentSearchStore, rememberSearch } from '../lib/library';
import { useStore } from '../lib/store';
import type { PersonCard, SearchResponse } from '../lib/types';
import { useApi } from '../lib/useApi';

type Tab = 'all' | 'movie' | 'tv' | 'person';
const TABS: Array<[Tab, string]> = [
  ['all', 'All'],
  ['movie', 'Movies'],
  ['tv', 'TV Shows'],
  ['person', 'People'],
];

function PersonTile({ p }: { p: PersonCard }) {
  const img = tmdbImage(p.profile, 'w185');
  return (
    <Link to={`/person/${p.id}`} className="person">
      <span className="person__photo">{img ? <img src={img} alt="" loading="lazy" /> : <Icon name="user" size={28} />}</span>
      <span className="person__name">{p.name}</span>
      <span className="person__role">{p.knownForTitles.join(', ') || p.knownFor || ''}</span>
    </Link>
  );
}

function PeopleResults({ q }: { q: string }) {
  const key = `/search?q=${encodeURIComponent(q)}&type=person&page=1`;
  const { data, error, loading, reload } = useApi(key, () => apiGet<SearchResponse>(key));
  if (loading && !data) return <Spinner />;
  if (error) return <div className="page-pad"><ErrorState error={error} onRetry={reload} /></div>;
  if (!data || data.people.length === 0) {
    return <div className="page-pad"><EmptyState icon="user" title={`No people found for “${q}”`} /></div>;
  }
  return (
    <div className="people-grid page-pad">
      {data.people.map((p) => (
        <PersonTile key={p.id} p={p} />
      ))}
    </div>
  );
}

function PeopleRow({ q }: { q: string }) {
  const key = `/search?q=${encodeURIComponent(q)}&type=all&page=1`;
  const { data } = useApi(key, () => apiGet<SearchResponse>(key));
  if (!data || data.people.length === 0) return null;
  return (
    <Row title="People" variant="cast">
      {data.people.map((p) => (
        <PersonTile key={p.id} p={p} />
      ))}
    </Row>
  );
}

function Discover() {
  const recent = useStore(recentSearchStore);
  const trending = useApi('/trending/all?page=1', () => api.trending('all'));
  return (
    <>
      {recent.length > 0 && (
        <section className="section page-pad">
          <div className="section__head">
            <h2 className="section__title">Recent searches</h2>
            <button type="button" className="btn btn--text btn--sm" onClick={() => recentSearchStore.set([])}>
              Clear
            </button>
          </div>
          <div className="chips chips--wrap">
            {recent.map((s) => (
              <Link key={s} to={`/search?q=${encodeURIComponent(s)}`} className="chip" replace>
                <Icon name="clock" size={13} /> {s}
              </Link>
            ))}
          </div>
        </section>
      )}
      <section className="section">
        <div className="section__head page-pad">
          <h2 className="section__title">Trending today</h2>
        </div>
        {trending.error ? (
          <div className="page-pad"><ErrorState error={trending.error} onRetry={trending.reload} /></div>
        ) : (
          <div className="grid page-pad">
            {(trending.data?.results ?? []).map((item) => (
              <PosterCard key={`${item.mediaType}:${item.tmdbId}`} item={item} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const tab = (params.get('type') as Tab) || 'all';
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!q) focusSearch();
  }, [q]);

  // Remember a search once the person has paused on it for a moment.
  useEffect(() => {
    if (!q) return;
    const t = window.setTimeout(() => rememberSearch(q), 1500);
    return () => window.clearTimeout(t);
  }, [q]);

  function setTab(next: Tab) {
    const p = new URLSearchParams(params);
    if (next === 'all') p.delete('type');
    else p.set('type', next);
    setParams(p, { replace: true });
  }

  return (
    <div className="page page--search">
      <header className="page-head page-pad">
        <div>
          <h1 className="page-title">{q ? <>Results for “{q}”</> : 'Search'}</h1>
          <p className="page-sub">
            {q
              ? tab !== 'person' && count > 0
                ? `${count.toLocaleString()} ${count === 1 ? 'result' : 'results'}`
                : ' '
              : 'Type in the search box above — press / anywhere to jump to it.'}
          </p>
        </div>
        {q && (
          <div className="tabs" role="tablist" aria-label="Result type">
            {TABS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                className={`tab${tab === value ? ' is-active' : ''}`}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </header>

      {!q ? (
        <Discover />
      ) : tab === 'person' ? (
        <PeopleResults q={q} />
      ) : (
        <>
          {tab === 'all' && <PeopleRow q={q} />}
          <InfiniteGrid
            path={`/search?q=${encodeURIComponent(q)}&type=${tab}`}
            emptyTitle={`Nothing found for “${q}”`}
            emptyText="Check the spelling, or try a shorter title."
            onCount={setCount}
          />
        </>
      )}
    </div>
  );
}
