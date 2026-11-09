import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Icon } from '../components/Icon';
import { ConfirmModal } from '../components/Modal';
import { PosterCard } from '../components/PosterCard';
import { EmptyState } from '../components/States';
import { desktop } from '../lib/desktop';
import { episodeLabel, watchHref } from '../lib/format';
import {
  clearContinue,
  clearMyList,
  isFinished,
  progressKey,
  removeFromContinue,
  toggleInList,
  useContinueWatching,
  useMyList,
  useProgressMap,
} from '../lib/library';

type Tab = 'list' | 'continue';
type Sort = 'added' | 'title' | 'year' | 'rating';

export function MyListPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'continue' ? 'continue' : 'list';
  const list = useMyList();
  const history = useContinueWatching();
  const progress = useProgressMap();
  const [sort, setSort] = useState<Sort>('added');
  const [type, setType] = useState<'all' | 'movie' | 'tv'>('all');
  const [confirm, setConfirm] = useState<Tab | null>(null);

  const sortedList = useMemo(() => {
    const items = list.filter((e) => type === 'all' || e.mediaType === type);
    switch (sort) {
      case 'title':
        return [...items].sort((a, b) => a.title.localeCompare(b.title));
      case 'year':
        return [...items].sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));
      case 'rating':
        return [...items].sort((a, b) => b.voteAverage - a.voteAverage);
      default:
        return [...items].sort((a, b) => b.addedAt - a.addedAt);
    }
  }, [list, sort, type]);

  function setTab(next: Tab) {
    setParams(next === 'list' ? {} : { tab: next }, { replace: true });
  }

  return (
    <div className="page page--mylist">
      <header className="page-head page-pad">
        <div>
          <h1 className="page-title">My Stuff</h1>
          <p className="page-sub">
            Saved titles and everything you’ve started. Stored {desktop ? 'on this PC' : 'in this browser'} only.
          </p>
        </div>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'list'} className={`tab${tab === 'list' ? ' is-active' : ''}`} onClick={() => setTab('list')}>
            My List <span className="tab__count">{list.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'continue'} className={`tab${tab === 'continue' ? ' is-active' : ''}`} onClick={() => setTab('continue')}>
            Watch history <span className="tab__count">{history.length}</span>
          </button>
        </div>
      </header>

      {tab === 'list' ? (
        list.length === 0 ? (
          <div className="page-pad">
            <EmptyState icon="bookmark" title="Your list is empty" text="Hit the + on any poster to save it here for later.">
              <Link to="/" className="btn btn--primary btn--sm">
                Find something to watch
              </Link>
            </EmptyState>
          </div>
        ) : (
          <>
            <div className="toolbar page-pad">
              <div className="chips">
                {(['all', 'movie', 'tv'] as const).map((t) => (
                  <button key={t} type="button" className={`chip${type === t ? ' is-active' : ''}`} onClick={() => setType(t)}>
                    {t === 'all' ? 'All' : t === 'movie' ? 'Movies' : 'TV Shows'}
                  </button>
                ))}
              </div>
              <div className="toolbar__right">
                <label className="select">
                  <span className="sr-only">Sort</span>
                  <Icon name="sliders" size={15} />
                  <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                    <option value="added">Recently added</option>
                    <option value="title">Title A–Z</option>
                    <option value="year">Newest release</option>
                    <option value="rating">Highest rated</option>
                  </select>
                </label>
                <button type="button" className="btn btn--text btn--sm" onClick={() => setConfirm('list')}>
                  <Icon name="trash" size={14} /> Clear
                </button>
              </div>
            </div>
            <div className="grid page-pad">
              {sortedList.map((e) => (
                <PosterCard key={`${e.mediaType}:${e.tmdbId}`} item={e} showListButton={false} onRemove={() => toggleInList(e)} />
              ))}
            </div>
          </>
        )
      ) : history.length === 0 ? (
        <div className="page-pad">
          <EmptyState icon="clock" title="Nothing watched yet" text="Anything you start playing shows up here so you can jump back in." />
        </div>
      ) : (
        <>
          <div className="toolbar page-pad">
            <span className="muted">Most recent first</span>
            <button type="button" className="btn btn--text btn--sm" onClick={() => setConfirm('continue')}>
              <Icon name="trash" size={14} /> Clear history
            </button>
          </div>
          <div className="grid grid--landscape page-pad">
            {history.map((e) => {
              const rec = progress[progressKey(e.mediaType, e.tmdbId, e.season, e.episode)];
              const finished = isFinished(rec);
              const fraction = rec && rec.d > 0 ? rec.p / rec.d : null;
              return (
                <PosterCard
                  key={`${e.mediaType}:${e.tmdbId}`}
                  variant="landscape"
                  href={e.mediaType === 'tv' && finished ? `/tv/${e.tmdbId}` : watchHref(e.mediaType, e.tmdbId, e.season, e.episode)}
                  subtitle={
                    e.mediaType === 'tv'
                      ? `${episodeLabel(e.season, e.episode)}${e.episodeTitle ? ` · ${e.episodeTitle}` : ''}`
                      : finished
                        ? 'Watched'
                        : fraction != null
                          ? `${Math.round(fraction * 100)}% watched`
                          : 'Movie'
                  }
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
          </div>
        </>
      )}

      <ConfirmModal
        open={confirm != null}
        title={confirm === 'list' ? 'Clear My List?' : 'Clear watch history?'}
        text={
          confirm === 'list'
            ? `This removes all ${list.length} saved titles.`
            : 'This removes everything from Continue Watching. Episode progress marks are kept.'
        }
        confirmLabel="Clear"
        danger
        onConfirm={() => (confirm === 'list' ? clearMyList() : clearContinue())}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
