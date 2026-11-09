import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { EpisodeList, SeasonPicker } from '../components/EpisodeList';
import { Icon } from '../components/Icon';
import { ErrorState, Spinner } from '../components/States';
import { ApiError, api } from '../lib/api';
import { desktop } from '../lib/desktop';
import { detailHref, episodeLabel, isFuture, tmdbImage, watchHref, year } from '../lib/format';
import { autoplayStore, recordWatchStart, saveProgress, useAutoplay } from '../lib/library';
import { isEndEvent, parsePlayerMessage } from '../lib/playerMessages';
import { useRegion } from '../lib/settings';
import type { MediaType, MovieDetails, SeasonDetails, TvDetails } from '../lib/types';
import { useApi } from '../lib/useApi';

const UP_NEXT_SECONDS = 10;

interface EpisodeTarget {
  season: number;
  episode: number;
  name?: string;
}

function useNeighbors(
  tv: TvDetails | undefined,
  seasonData: SeasonDetails | undefined,
  season: number | undefined,
  episode: number | undefined,
) {
  return useMemo(() => {
    const none = { prev: null as EpisodeTarget | null, next: null as EpisodeTarget | null };
    if (!tv || !seasonData || season == null || episode == null) return none;
    const eps = [...seasonData.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber);
    const seasonNumbers = tv.seasons
      .filter((s) => (season === 0 ? true : s.seasonNumber > 0))
      .map((s) => s.seasonNumber)
      .sort((a, b) => a - b);

    let next: EpisodeTarget | null = null;
    const nextEp = eps.find((e) => e.episodeNumber > episode);
    if (nextEp) {
      if (!isFuture(nextEp.airDate)) next = { season, episode: nextEp.episodeNumber, name: nextEp.name };
    } else {
      const ns = seasonNumbers.find((n) => n > season);
      const nsInfo = tv.seasons.find((s) => s.seasonNumber === ns);
      if (ns != null && nsInfo && !isFuture(nsInfo.airDate)) next = { season: ns, episode: 1 };
    }

    let prev: EpisodeTarget | null = null;
    const prevEp = [...eps].reverse().find((e) => e.episodeNumber < episode);
    if (prevEp) {
      prev = { season, episode: prevEp.episodeNumber, name: prevEp.name };
    } else {
      const ps = [...seasonNumbers].reverse().find((n) => n < season);
      const psInfo = tv.seasons.find((s) => s.seasonNumber === ps);
      if (ps != null && psInfo && psInfo.episodeCount > 0) prev = { season: ps, episode: psInfo.episodeCount };
    }
    return { prev, next };
  }, [tv, seasonData, season, episode]);
}

export function WatchPage({ mediaType }: { mediaType: MediaType }) {
  const params = useParams();
  const navigate = useNavigate();
  const region = useRegion();
  const autoplay = useAutoplay();

  const tmdbId = Number(params.id);
  const season = mediaType === 'tv' ? Number(params.season) : undefined;
  const episode = mediaType === 'tv' ? Number(params.episode) : undefined;
  const valid =
    Number.isInteger(tmdbId) &&
    tmdbId > 0 &&
    (mediaType === 'movie' || (Number.isInteger(season) && season! >= 0 && Number.isInteger(episode) && episode! > 0));

  const details = useApi<MovieDetails | TvDetails>(
    valid ? `/${mediaType}/${tmdbId}?region=${region}` : null,
    () => (mediaType === 'movie' ? api.movie(tmdbId, region) : api.tv(tmdbId, region)),
  );
  const seasonData = useApi(
    valid && mediaType === 'tv' ? `/tv/${tmdbId}/season/${season}` : null,
    () => api.season(tmdbId, season!),
  );
  const playback = useApi(
    valid ? `/playback/${mediaType}/${tmdbId}${mediaType === 'tv' ? `?season=${season}&episode=${episode}` : ''}` : null,
    () => api.playback(mediaType, tmdbId, season, episode),
  );

  const tv = mediaType === 'tv' ? (details.data as TvDetails | undefined) : undefined;
  const { prev, next } = useNeighbors(tv, seasonData.data, season, episode);
  const currentEpisode = seasonData.data?.episodes.find((e) => e.episodeNumber === episode);

  const [reloadNonce, setReloadNonce] = useState(0);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSeason, setDrawerSeason] = useState<number | undefined>(season);
  const [mini, setMini] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [blocked, setBlocked] = useState<{ count: number; last: string; at: number }>({ count: 0, last: '', at: 0 });
  const [upNextDeadline, setUpNextDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const upNextDismissed = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const embedUrl = playback.data?.embedUrl;
  const target = useMemo(() => ({ mediaType, tmdbId, season, episode }), [mediaType, tmdbId, season, episode]);
  const backHref = detailHref(mediaType, tmdbId);
  const nextHref = next ? watchHref('tv', tmdbId, next.season, next.episode) : null;
  const prevHref = prev ? watchHref('tv', tmdbId, prev.season, prev.episode) : null;

  // Reset per-episode state.
  useEffect(() => {
    setFrameLoaded(false);
    setUpNextDeadline(null);
    upNextDismissed.current = false;
    setDrawerSeason(season);
  }, [embedUrl, season, episode]);

  // Title + continue-watching entry.
  useEffect(() => {
    const d = details.data;
    if (!d) return;
    const label = mediaType === 'tv' ? ` ${episodeLabel(season, episode)}` : '';
    document.title = `${d.title}${label} · The Bee Streams`;
    recordWatchStart({
      tmdbId,
      mediaType,
      title: d.title,
      posterPath: d.poster,
      backdropPath: d.backdrop,
      season,
      episode,
      episodeTitle: currentEpisode?.name,
    });
    return () => {
      document.title = 'The Bee Streams';
    };
  }, [details.data, mediaType, tmdbId, season, episode, currentEpisode?.name]);

  // Progress messages from the player.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const msg = parsePlayerMessage(e.data);
      if (!msg) return;
      const ended = isEndEvent(msg);
      if (msg.time != null) saveProgress(target, msg.time, msg.duration ?? undefined, ended);
      const nearEnd = msg.time != null && msg.duration != null && msg.time / msg.duration >= 0.97;
      if (ended && msg.time == null && msg.duration == null) saveProgress(target, 1, 1, true);
      if (
        (ended || nearEnd) &&
        mediaType === 'tv' &&
        nextHref &&
        autoplayStore.get() &&
        !upNextDismissed.current
      ) {
        setUpNextDeadline((d) => d ?? Date.now() + UP_NEXT_SECONDS * 1000);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [target, mediaType, nextHref]);

  // Up-next countdown.
  useEffect(() => {
    if (upNextDeadline == null) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [upNextDeadline]);

  useEffect(() => {
    if (upNextDeadline != null && now >= upNextDeadline && nextHref) {
      setUpNextDeadline(null);
      navigate(nextHref);
    }
  }, [now, upNextDeadline, nextHref, navigate]);

  // Blocked popups/redirects from the player.
  useEffect(() => {
    if (!desktop) return;
    return desktop.onBlocked((e) => {
      setBlocked((b) => ({ count: b.count + 1, last: e.host || e.kind, at: Date.now() }));
    });
  }, []);

  // Re-render once the "Blocked …" flash should disappear.
  useEffect(() => {
    if (!blocked.at) return;
    const t = window.setTimeout(() => setNow(Date.now()), 3600);
    return () => window.clearTimeout(t);
  }, [blocked.at]);

  // Mini player + fullscreen state.
  useEffect(() => {
    if (!desktop) return;
    const off = desktop.onMiniChanged(setMini);
    return () => {
      off();
      void desktop?.setMiniPlayer(false);
    };
  }, []);

  useEffect(() => {
    const onFs = () => setFullscreen(document.fullscreenElement != null);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      /* ignore */
    }
  }, []);

  const toggleMini = useCallback(async () => {
    if (!desktop) return;
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    setMini(await desktop.setMiniPlayer(!mini));
  }, [mini]);

  const reloadPlayer = useCallback(() => {
    setFrameLoaded(false);
    setReloadNonce((n) => n + 1);
  }, []);

  const cancelUpNext = useCallback(() => {
    upNextDismissed.current = true;
    setUpNextDeadline(null);
  }, []);

  // Keyboard shortcuts (work whenever focus isn't inside the player itself).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        if (upNextDeadline != null) cancelUpNext();
        else if (drawerOpen) setDrawerOpen(false);
        else if (mini) void toggleMini();
        else if (!document.fullscreenElement) navigate(backHref);
        return;
      }
      if (k === 'f') {
        e.preventDefault();
        void toggleFullscreen();
      } else if (k === 'm' || k === 'p') {
        e.preventDefault();
        void toggleMini();
      } else if (k === 'r') {
        e.preventDefault();
        reloadPlayer();
      } else if (k === 'n' && nextHref) {
        e.preventDefault();
        navigate(nextHref);
      } else if (k === 'b' && prevHref) {
        e.preventDefault();
        navigate(prevHref);
      } else if (k === 'e' && mediaType === 'tv') {
        e.preventDefault();
        setDrawerOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [upNextDeadline, drawerOpen, mini, backHref, nextHref, prevHref, mediaType, navigate, toggleFullscreen, toggleMini, reloadPlayer, cancelUpNext]);

  const drawerSeasonData = useApi(
    drawerOpen && tv && drawerSeason != null ? `/tv/${tmdbId}/season/${drawerSeason}` : null,
    () => api.season(tmdbId, drawerSeason!),
  );

  if (!valid) {
    return (
      <div className="watch watch--error">
        <ErrorState error={new ApiError('That player link isn’t valid.', 'NOT_FOUND', 404)} />
      </div>
    );
  }

  const d = details.data;
  const backdrop = tmdbImage(d?.backdrop ?? null, 'w1280');
  const recentlyBlocked = blocked.at > 0 && Date.now() - blocked.at < 3500;
  const remaining = upNextDeadline != null ? Math.max(0, Math.ceil((upNextDeadline - now) / 1000)) : 0;
  const error = details.error ?? playback.error;

  return (
    <div className={`watch${mini ? ' is-mini' : ''}${fullscreen ? ' is-fullscreen' : ''}`}>
      {backdrop && <div className="watch__backdrop" style={{ backgroundImage: `url(${backdrop})` }} aria-hidden="true" />}

      <header className="watch__bar">
        <Link to={backHref} className="icon-btn icon-btn--glass" aria-label="Back to details" title="Back (Esc)">
          <Icon name="arrowLeft" size={20} />
        </Link>
        <div className="watch__titles">
          <h1 className="watch__title">{d?.title ?? 'Loading…'}</h1>
          <p className="watch__sub">
            {mediaType === 'tv'
              ? `${episodeLabel(season, episode)}${currentEpisode?.name ? ` · ${currentEpisode.name}` : ''}`
              : [year(d?.releaseDate), 'Movie'].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="watch__tools">
          {desktop && (
            <span
              className={`shield${recentlyBlocked ? ' is-flash' : ''}`}
              title={
                blocked.count
                  ? `Blocked ${blocked.count} popup${blocked.count === 1 ? '' : 's'}/redirect${blocked.count === 1 ? '' : 's'} on this page (last: ${blocked.last})`
                  : 'Popups, redirects and downloads from the player are blocked'
              }
            >
              <Icon name="shield" size={15} />
              {blocked.count > 0 ? `${blocked.count} blocked` : 'Protected'}
            </span>
          )}
          {mediaType === 'tv' && (
            <button
              type="button"
              className={`toggle${autoplay ? ' is-on' : ''}`}
              onClick={() => autoplayStore.set(!autoplay)}
              aria-pressed={autoplay}
              title="Play the next episode automatically"
            >
              <span className="toggle__track" aria-hidden="true">
                <span className="toggle__thumb" />
              </span>
              Autoplay
            </button>
          )}
          <button type="button" className="icon-btn icon-btn--glass" onClick={reloadPlayer} title="Reload player (R)" aria-label="Reload player">
            <Icon name="refresh" size={18} />
          </button>
          {mediaType === 'tv' && (
            <button
              type="button"
              className={`icon-btn icon-btn--glass${drawerOpen ? ' is-on' : ''}`}
              onClick={() => setDrawerOpen((v) => !v)}
              title="Episodes (E)"
              aria-label="Episodes"
              aria-expanded={drawerOpen}
            >
              <Icon name="list" size={18} />
            </button>
          )}
          {desktop && (
            <button type="button" className="icon-btn icon-btn--glass" onClick={() => void toggleMini()} title="Mini player (M)" aria-label="Mini player">
              <Icon name="pip" size={18} />
            </button>
          )}
          <button
            type="button"
            className="icon-btn icon-btn--glass"
            onClick={() => void toggleFullscreen()}
            title="Fullscreen (F)"
            aria-label="Fullscreen"
          >
            <Icon name={fullscreen ? 'minimize' : 'maximize'} size={18} />
          </button>
        </div>
      </header>

      <div className="watch__stage">
        <div className="player" ref={stageRef}>
          {error ? (
            <div className="player__overlay">
              <ErrorState error={error} onRetry={() => { details.reload(); playback.reload(); }} />
            </div>
          ) : (
            <>
              {embedUrl && (
                <iframe
                  key={`${embedUrl}#${reloadNonce}`}
                  src={embedUrl}
                  title={d ? `${d.title} player` : 'Player'}
                  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                  allowFullScreen
                  referrerPolicy="origin"
                  onLoad={() => setFrameLoaded(true)}
                />
              )}
              {!frameLoaded && (
                <div className="player__overlay player__overlay--loading">
                  <Spinner label="Loading player" />
                  <p>Loading player…</p>
                </div>
              )}
            </>
          )}

          {recentlyBlocked && (
            <div className="player__blocked" role="status">
              <Icon name="shield" size={14} /> Blocked {blocked.last}
            </div>
          )}

          {upNextDeadline != null && next && (
            <div className="upnext" role="dialog" aria-label="Up next">
              <p className="upnext__label">Up next in {remaining}s</p>
              <p className="upnext__title">
                {episodeLabel(next.season, next.episode)}
                {next.name ? ` · ${next.name}` : ''}
              </p>
              <div className="upnext__bar" aria-hidden="true">
                <span style={{ animationDuration: `${UP_NEXT_SECONDS}s` }} />
              </div>
              <div className="upnext__actions">
                <button type="button" className="btn btn--primary btn--sm" onClick={() => nextHref && navigate(nextHref)}>
                  <Icon name="play" size={14} /> Play now
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={cancelUpNext}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {mini && (
            <div className="mini-controls">
              <button type="button" className="icon-btn icon-btn--glass" onClick={() => void toggleMini()} title="Back to full window" aria-label="Exit mini player">
                <Icon name="maximize" size={16} />
              </button>
              {nextHref && (
                <button type="button" className="icon-btn icon-btn--glass" onClick={() => navigate(nextHref)} title="Next episode" aria-label="Next episode">
                  <Icon name="skipNext" size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="watch__below">
        {mediaType === 'tv' && (
          <div className="watch__nav">
            {prevHref && prev ? (
              <Link to={prevHref} className="btn btn--ghost" title="Previous episode (B)">
                <Icon name="skipPrev" size={16} /> {episodeLabel(prev.season, prev.episode)}
              </Link>
            ) : (
              <span />
            )}
            {nextHref && next ? (
              <Link to={nextHref} className="btn btn--primary" title="Next episode (N)">
                Next: {episodeLabel(next.season, next.episode)}
                {next.name ? ` · ${next.name}` : ''} <Icon name="skipNext" size={16} />
              </Link>
            ) : (
              <span className="muted">You’re on the latest episode.</span>
            )}
          </div>
        )}
        {(currentEpisode?.overview || (mediaType === 'movie' && d?.overview)) && (
          <p className="watch__overview">{currentEpisode?.overview || d?.overview}</p>
        )}
        <p className="watch__keys">
          <kbd>F</kbd> fullscreen · {desktop && <><kbd>M</kbd> mini player · </>}<kbd>R</kbd> reload
          {mediaType === 'tv' && (
            <>
              {' '}· <kbd>N</kbd>/<kbd>B</kbd> next/previous · <kbd>E</kbd> episodes
            </>
          )}{' '}
          · <kbd>Esc</kbd> back
        </p>
      </div>

      {drawerOpen && tv && (
        <>
          <button type="button" className="drawer-scrim" aria-label="Close episodes" onClick={() => setDrawerOpen(false)} />
          <aside className="drawer" aria-label="Episodes">
            <header className="drawer__head">
              <h2>Episodes</h2>
              <SeasonPicker seasons={tv.seasons} value={drawerSeason ?? season ?? 1} onChange={setDrawerSeason} />
              <button type="button" className="icon-btn" onClick={() => setDrawerOpen(false)} aria-label="Close">
                <Icon name="x" size={18} />
              </button>
            </header>
            <div className="drawer__body">
              {drawerSeasonData.loading && !drawerSeasonData.data ? (
                <Spinner />
              ) : drawerSeasonData.error ? (
                <ErrorState error={drawerSeasonData.error} onRetry={drawerSeasonData.reload} compact />
              ) : (
                <EpisodeList
                  tmdbId={tmdbId}
                  episodes={drawerSeasonData.data?.episodes ?? []}
                  current={season != null && episode != null ? { season, episode } : undefined}
                  compact
                  onPick={() => setDrawerOpen(false)}
                />
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
