import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { CastRow, Facts, PeopleLinks, WhereToWatch } from '../components/DetailParts';
import { DetailHero, DetailSkeleton } from '../components/DetailHero';
import { EpisodeList, SeasonPicker } from '../components/EpisodeList';
import { Icon } from '../components/Icon';
import { ListButton } from '../components/ListButton';
import { TrailerModal } from '../components/Modal';
import { PosterCard } from '../components/PosterCard';
import { Row } from '../components/Row';
import { ErrorState, Spinner } from '../components/States';
import { ApiError, api } from '../lib/api';
import { openExternal } from '../lib/desktop';
import { episodeLabel, longDate, plural, runtime, watchHref, year } from '../lib/format';
import { useContinueWatching, useProgressMap } from '../lib/library';
import { nextUpForShow } from '../lib/resume';
import { useRegion } from '../lib/settings';
import { useApi } from '../lib/useApi';

export function TvDetailPage() {
  const params = useParams();
  const [search, setSearch] = useSearchParams();
  const tmdbId = Number(params.id);
  const valid = Number.isInteger(tmdbId) && tmdbId > 0;
  const region = useRegion();
  const { data, error, loading, reload } = useApi(valid ? `/tv/${tmdbId}?region=${region}` : null, () =>
    api.tv(tmdbId, region),
  );
  const [trailer, setTrailer] = useState(false);
  // Re-render when watch progress changes so "Continue" stays right.
  useContinueWatching();
  useProgressMap();

  const nextUp = data ? nextUpForShow(tmdbId, data.seasons) : null;
  const rawSeason = search.get('season');
  const seasonParam = rawSeason != null && /^\d+$/.test(rawSeason) ? Number(rawSeason) : null;
  const season =
    data && seasonParam != null && data.seasons.some((s) => s.seasonNumber === seasonParam)
      ? seasonParam
      : nextUp?.season ?? data?.seasons[0]?.seasonNumber ?? 1;

  const seasonData = useApi(data ? `/tv/${tmdbId}/season/${season}` : null, () => api.season(tmdbId, season));

  useEffect(() => {
    if (data) document.title = `${data.title} · The Bee Streams`;
    return () => {
      document.title = 'The Bee Streams';
    };
  }, [data]);

  if (!valid) return <div className="page page-pad"><ErrorState error={new ApiError('That link isn’t valid.', 'NOT_FOUND', 404)} /></div>;
  if (loading && !data) return <div className="page"><DetailSkeleton /></div>;
  if (error || !data) return <div className="page page-pad page--padded"><ErrorState error={error} onRetry={reload} /></div>;

  const playLabel = nextUp?.started ? `Continue ${episodeLabel(nextUp.season, nextUp.episode)}` : 'Play S1 · E1';
  const next = data.nextEpisodeToAir;

  return (
    <div className="page page--detail">
      <DetailHero
        mediaType="tv"
        title={data.title}
        tagline={data.tagline}
        overview={data.overview}
        poster={data.poster}
        backdrop={data.backdrop}
        meta={[
          [year(data.releaseDate), data.inProduction ? 'present' : year(data.lastAirDate)]
            .filter(Boolean)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join('–'),
          plural(data.numberOfSeasons, 'season'),
          runtime(data.episodeRuntime) ? `${runtime(data.episodeRuntime)} episodes` : '',
        ]}
        certification={data.certification}
        voteAverage={data.voteAverage}
        voteCount={data.voteCount}
        genres={data.genres}
        actions={
          <>
            <Link to={watchHref('tv', tmdbId, nextUp?.season, nextUp?.episode)} className="btn btn--primary btn--lg">
              <Icon name="play" size={18} /> {playLabel}
            </Link>
            {data.trailer && (
              <button type="button" className="btn btn--glass btn--lg" onClick={() => setTrailer(true)}>
                <Icon name="film" size={18} /> Trailer
              </button>
            )}
            <ListButton item={{ ...data, mediaType: 'tv' }} className="btn--lg" />
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
          next ? (
            <span className="pill pill--accent">
              Next: {episodeLabel(next.seasonNumber, next.episodeNumber)} · {longDate(next.airDate)}
            </span>
          ) : null
        }
        facts={
          <Facts
            items={[
              ['Created by', data.creators.length ? <PeopleLinks people={data.creators} /> : null],
              ['Network', data.networks.map((n) => n.name).join(', ')],
              ['Episodes', data.numberOfEpisodes ? String(data.numberOfEpisodes) : null],
              ['Status', data.status],
              ['First aired', longDate(data.releaseDate)],
            ]}
          />
        }
      />

      <div className="detail-sections">
        <section className="section page-pad" aria-labelledby="episodes-title">
          <div className="section__head">
            <h2 className="section__title" id="episodes-title">
              Episodes
            </h2>
            <SeasonPicker
              seasons={data.seasons}
              value={season}
              onChange={(n) => {
                const p = new URLSearchParams(search);
                p.set('season', String(n));
                setSearch(p, { replace: true, preventScrollReset: true });
              }}
            />
          </div>
          {seasonData.loading && !seasonData.data ? (
            <Spinner label="Loading episodes" />
          ) : seasonData.error ? (
            <ErrorState error={seasonData.error} onRetry={seasonData.reload} compact />
          ) : (
            <EpisodeList
              tmdbId={tmdbId}
              episodes={seasonData.data?.episodes ?? []}
              current={nextUp?.started ? { season: nextUp.season, episode: nextUp.episode } : undefined}
              currentLabel="Up next"
            />
          )}
        </section>

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
