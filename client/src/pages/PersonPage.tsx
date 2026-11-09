import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { Icon } from '../components/Icon';
import { PosterCard } from '../components/PosterCard';
import { ErrorState, Spinner } from '../components/States';
import { ApiError, api } from '../lib/api';
import { openExternal } from '../lib/desktop';
import { age, longDate, tmdbImage, year } from '../lib/format';
import { useApi } from '../lib/useApi';

type Filter = 'all' | 'movie' | 'tv';

export function PersonPage() {
  const params = useParams();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const { data, error, loading, reload } = useApi(valid ? `/person/${id}` : null, () => api.person(id));
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (data) document.title = `${data.name} · The Bee Streams`;
    return () => {
      document.title = 'The Bee Streams';
    };
  }, [data]);

  const credits = useMemo(
    () => (data?.credits ?? []).filter((c) => filter === 'all' || c.mediaType === filter),
    [data, filter],
  );

  if (!valid) return <div className="page page-pad page--padded"><ErrorState error={new ApiError('That link isn’t valid.', 'NOT_FOUND', 404)} /></div>;
  if (loading && !data) return <div className="page page--padded"><Spinner /></div>;
  if (error || !data) return <div className="page page-pad page--padded"><ErrorState error={error} onRetry={reload} /></div>;

  const photo = tmdbImage(data.profile, 'w500');
  const years = age(data.birthday, data.deathday);
  const bio = data.biography.trim();
  const longBio = bio.length > 600;

  return (
    <div className="page page--person page--padded">
      <section className="person-hero page-pad">
        <div className="person-hero__photo">{photo ? <img src={photo} alt={data.name} /> : <Icon name="user" size={56} />}</div>
        <div className="person-hero__body">
          {data.knownFor && <p className="detail-hero__eyebrow">{data.knownFor}</p>}
          <h1 className="detail-hero__title">{data.name}</h1>
          <p className="detail-hero__meta">
            {data.birthday && (
              <span>
                Born {longDate(data.birthday)}
                {!data.deathday && years != null ? ` (age ${years})` : ''}
              </span>
            )}
            {data.deathday && <span>Died {longDate(data.deathday)}{years != null ? ` (aged ${years})` : ''}</span>}
            {data.placeOfBirth && <span>{data.placeOfBirth}</span>}
          </p>
          {bio ? (
            <div className="detail-hero__overview">
              <p className={longBio && !expanded ? 'clamp-6' : undefined}>{bio}</p>
              {longBio && (
                <button type="button" className="btn btn--text btn--sm" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? 'Show less' : 'Read more'}
                </button>
              )}
            </div>
          ) : (
            <p className="muted">No biography on TMDB yet.</p>
          )}
          {data.imdbId && (
            <div className="detail-hero__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => openExternal(`https://www.imdb.com/name/${data.imdbId}/`)}>
                IMDb <Icon name="external" size={14} />
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section__head page-pad">
          <h2 className="section__title">Known for</h2>
          <div className="tabs" role="tablist">
            {(['all', 'movie', 'tv'] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                className={`tab${filter === f ? ' is-active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'movie' ? 'Movies' : 'TV'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid page-pad">
          {credits.map((c) => (
            <PosterCard
              key={`${c.mediaType}:${c.tmdbId}`}
              item={c}
              subtitle={[year(c.releaseDate), c.role].filter(Boolean).join(' · ')}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
