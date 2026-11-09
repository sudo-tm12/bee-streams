import { useMemo } from 'react';
import { Hero, HeroSkeleton } from '../components/Hero';
import { PosterCard } from '../components/PosterCard';
import { Row } from '../components/Row';
import { ErrorState } from '../components/States';
import { api } from '../lib/api';
import { episodeLabel, watchHref } from '../lib/format';
import {
  isFinished,
  progressKey,
  removeFromContinue,
  useContinueWatching,
  useMyList,
  useProgressMap,
} from '../lib/library';
import type { ListKind, MediaCard, MediaType } from '../lib/types';
import { useApi } from '../lib/useApi';

function ApiRow({
  title,
  apiKey,
  load,
  viewAllHref,
  ranked,
}: {
  title: string;
  apiKey: string;
  load: () => Promise<{ results: MediaCard[] }>;
  viewAllHref?: string;
  ranked?: boolean;
}) {
  const { data, error, loading, reload } = useApi(apiKey, load);
  if (!loading && !error && data && data.results.length === 0) return null;
  return (
    <Row title={title} viewAllHref={viewAllHref} loading={loading && !data} error={error} onRetry={reload}>
      {data?.results.map((item, i) => (
        <PosterCard key={`${item.mediaType}:${item.tmdbId}`} item={item} rank={ranked && i < 10 ? i + 1 : undefined} />
      ))}
    </Row>
  );
}

function ContinueRow() {
  const entries = useContinueWatching();
  const progress = useProgressMap();

  const visible = useMemo(
    () =>
      entries
        .map((e) => {
          const rec = progress[progressKey(e.mediaType, e.tmdbId, e.season, e.episode)];
          const fraction =
            rec && rec.d > 0
              ? rec.p / rec.d
              : e.progressSeconds && e.durationSeconds
                ? e.progressSeconds / e.durationSeconds
                : null;
          return { entry: e, fraction, finished: isFinished(rec) };
        })
        // Finished movies drop off; finished episodes stay (the show page offers the next one).
        .filter((x) => !(x.entry.mediaType === 'movie' && x.finished))
        .slice(0, 20),
    [entries, progress],
  );

  if (visible.length === 0) return null;

  return (
    <Row title="Continue watching" variant="landscape" id="continue" viewAllHref="/my-list?tab=continue">
      {visible.map(({ entry: e, fraction, finished }) => {
        const href =
          e.mediaType === 'tv' && finished
            ? `/tv/${e.tmdbId}`
            : watchHref(e.mediaType, e.tmdbId, e.season, e.episode);
        const subtitle =
          e.mediaType === 'tv'
            ? `${episodeLabel(e.season, e.episode)}${e.episodeTitle ? ` · ${e.episodeTitle}` : ''}${finished ? ' · Watched' : ''}`
            : fraction != null
              ? `${Math.round(fraction * 100)}% watched`
              : 'Movie';
        return (
          <PosterCard
            key={`${e.mediaType}:${e.tmdbId}`}
            variant="landscape"
            href={href}
            subtitle={subtitle}
            progress={finished ? 1 : fraction}
            showListButton={false}
            onRemove={() => removeFromContinue(e.mediaType, e.tmdbId)}
            item={{
              tmdbId: e.tmdbId,
              mediaType: e.mediaType,
              title: e.title,
              poster: e.posterPath ?? null,
              backdrop: e.backdropPath ?? null,
              releaseDate: null,
              voteAverage: 0,
            }}
          />
        );
      })}
    </Row>
  );
}

function MyListRow() {
  const list = useMyList();
  if (list.length === 0) return null;
  return (
    <Row title="My List" viewAllHref="/my-list">
      {list.slice(0, 20).map((e) => (
        <PosterCard key={`${e.mediaType}:${e.tmdbId}`} item={e} />
      ))}
    </Row>
  );
}

const LIST_ROWS: Array<{ title: string; kind: ListKind; href: string }> = [
  { title: 'Popular movies', kind: 'popular_movies', href: '/movies' },
  { title: 'In theaters now', kind: 'now_playing', href: '/movies?sort=newest' },
  { title: 'Popular TV', kind: 'popular_tv', href: '/tv' },
  { title: 'Top rated movies', kind: 'top_rated_movies', href: '/movies?sort=top' },
  { title: 'Airing this week', kind: 'on_the_air', href: '/tv?sort=newest' },
  { title: 'Top rated TV', kind: 'top_rated_tv', href: '/tv?sort=top' },
  { title: 'Coming soon', kind: 'upcoming', href: '/movies?sort=newest' },
];

function trendingRow(type: MediaType) {
  return {
    title: type === 'movie' ? 'Trending movies this week' : 'Trending shows this week',
    apiKey: `/trending/${type}?page=1`,
    load: () => api.trending(type),
    viewAllHref: type === 'movie' ? '/movies' : '/tv',
  };
}

export function HomePage() {
  const featured = useApi('/trending/all?page=1', () => api.trending('all'));
  const heroItems = useMemo(
    () => (featured.data?.results ?? []).filter((i) => i.backdrop && i.overview).slice(0, 8),
    [featured.data],
  );

  return (
    <div className="page page--home">
      {featured.loading && !featured.data ? (
        <HeroSkeleton />
      ) : featured.error ? (
        <div className="page-pad hero-error">
          <ErrorState error={featured.error} onRetry={featured.reload} />
        </div>
      ) : (
        <Hero items={heroItems} />
      )}

      <div className="rows">
        <ContinueRow />
        <MyListRow />
        <ApiRow {...trendingRow('movie')} ranked />
        <ApiRow {...trendingRow('tv')} ranked />
        {LIST_ROWS.map((r) => (
          <ApiRow
            key={r.kind}
            title={r.title}
            apiKey={`/lists/${r.kind}?page=1`}
            load={() => api.list(r.kind)}
            viewAllHref={r.href}
          />
        ))}
      </div>
    </div>
  );
}
