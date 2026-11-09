import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { CastRow, Facts, PeopleLinks, WhereToWatch } from '../components/DetailParts';
import { DetailHero, DetailSkeleton } from '../components/DetailHero';
import { Icon } from '../components/Icon';
import { ListButton } from '../components/ListButton';
import { TrailerModal } from '../components/Modal';
import { PosterCard } from '../components/PosterCard';
import { Row } from '../components/Row';
import { ErrorState } from '../components/States';
import { ApiError, api } from '../lib/api';
import { openExternal } from '../lib/desktop';
import { isFuture, longDate, runtime, watchHref, year } from '../lib/format';
import { isFinished, markWatched, progressFraction, progressKey, useProgressMap } from '../lib/library';
import { useRegion } from '../lib/settings';
import { useApi } from '../lib/useApi';

export function MovieDetailPage() {
  const params = useParams();
  const tmdbId = Number(params.id);
  const valid = Number.isInteger(tmdbId) && tmdbId > 0;
  const region = useRegion();
  const { data, error, loading, reload } = useApi(valid ? `/movie/${tmdbId}?region=${region}` : null, () =>
    api.movie(tmdbId, region),
  );
  const [trailer, setTrailer] = useState(false);
  const progress = useProgressMap()[progressKey('movie', tmdbId)];

  useEffect(() => {
    if (data) document.title = `${data.title} · The Bee Streams`;
    return () => {
      document.title = 'The Bee Streams';
    };
  }, [data]);

  if (!valid) return <div className="page page-pad"><ErrorState error={new ApiError('That link isn’t valid.', 'NOT_FOUND', 404)} /></div>;
  if (loading && !data) return <div className="page"><DetailSkeleton /></div>;
  if (error || !data) return <div className="page page-pad page--padded"><ErrorState error={error} onRetry={reload} /></div>;

  const fraction = progressFraction(progress);
  const finished = isFinished(progress);
  const unreleased = isFuture(data.releaseDate);

  return (
    <div className="page page--detail">
      <DetailHero
        mediaType="movie"
        title={data.title}
        tagline={data.tagline}
        overview={data.overview}
        poster={data.poster}
        backdrop={data.backdrop}
        meta={[year(data.releaseDate), runtime(data.runtime)]}
        certification={data.certification}
        voteAverage={data.voteAverage}
        voteCount={data.voteCount}
        genres={data.genres}
        actions={
          <>
            <Link to={watchHref('movie', tmdbId)} className="btn btn--primary btn--lg">
              <Icon name="play" size={18} /> {fraction && !finished ? 'Continue' : finished ? 'Watch again' : 'Play'}
            </Link>
            {data.trailer && (
              <button type="button" className="btn btn--glass btn--lg" onClick={() => setTrailer(true)}>
                <Icon name="film" size={18} /> Trailer
              </button>
            )}
            <ListButton item={{ ...data, mediaType: 'movie' }} className="btn--lg" />
            {data.imdbId && (
              <button
                type="button"
                className="icon-btn icon-btn--glass icon-btn--lg"
                onClick={() => openExternal(`https://www.imdb.com/title/${data.imdbId}/`)}
                title="Open on IMDb"
                aria-label="Open on IMDb"
              >
                <Icon name="external" size={18} />
              </button>
            )}
          </>
        }
        note={
          unreleased ? (
            <span className="pill pill--accent">Releases {longDate(data.releaseDate)}</span>
          ) : fraction != null ? (
            <div className="watch-note">
              {finished ? (
                <>
                  <Icon name="check" size={15} /> Watched
                </>
              ) : (
                <>
                  <span className="meter" aria-hidden="true">
                    <span style={{ width: `${Math.round(fraction * 100)}%` }} />
                  </span>
                  {Math.round(fraction * 100)}% watched
                </>
              )}
              <button type="button" className="btn btn--text btn--sm" onClick={() => markWatched({ mediaType: 'movie', tmdbId }, !finished)}>
                {finished ? 'Mark unwatched' : 'Mark watched'}
              </button>
            </div>
          ) : null
        }
        facts={
          <Facts
            items={[
              ['Director', data.directors.length ? <PeopleLinks people={data.directors} /> : null],
              ['Writing', data.writers.length ? <PeopleLinks people={data.writers} /> : null],
              ['Released', longDate(data.releaseDate)],
              ['Status', data.status && data.status !== 'Released' ? data.status : null],
              ['Original title', data.originalTitle && data.originalTitle !== data.title ? data.originalTitle : null],
            ]}
          />
        }
      />

      <div className="detail-sections">
        <CastRow cast={data.cast} />
        <WhereToWatch providers={data.providers} region={region} />
        {data.recommendations.length > 0 && (
          <Row title="More like this">
            {data.recommendations.map((r) => (
              <PosterCard key={`${r.mediaType}:${r.tmdbId}`} item={r} />
            ))}
          </Row>
        )}
      </div>

      <TrailerModal trailer={trailer ? data.trailer : null} title={data.title} onClose={() => setTrailer(false)} />
    </div>
  );
}
