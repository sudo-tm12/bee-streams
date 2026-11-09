import express from 'express';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';
import { getPlaybackUrl } from './playback.js';
import {
  LIST_KINDS,
  TmdbError,
  discover,
  getGenres,
  getList,
  getMovie,
  getPerson,
  getSeason,
  getTrending,
  getTv,
  hasTmdbCredential,
  search,
} from './tmdb.js';

class BadRequest extends Error {}

function positiveInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new BadRequest(`Invalid ${label}`);
  return n;
}

function nonNegativeInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new BadRequest(`Invalid ${label}`);
  return n;
}

function mediaTypeParam(value) {
  if (value !== 'movie' && value !== 'tv') throw new BadRequest('type must be movie or tv');
  return value;
}

/** Wraps an async handler so errors become consistent JSON responses. */
function route(handler) {
  return async (req, res) => {
    try {
      const body = await handler(req);
      res.setHeader('Cache-Control', 'no-store');
      res.json(body);
    } catch (err) {
      if (err instanceof BadRequest) {
        res.status(400).json({ error: err.message, code: 'BAD_REQUEST' });
        return;
      }
      if (err instanceof TmdbError) {
        res.status(err.status).json({ error: err.message, code: err.code });
        return;
      }
      console.error(`[api] ${req.method} ${req.path}:`, err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Something went wrong.', code: 'INTERNAL' });
    }
  };
}

/**
 * @param {{ staticDir?: string, allowedHosts: Set<string> }} options
 */
export function createApp({ staticDir = config.staticDir, allowedHosts }) {
  const app = express();
  app.disable('x-powered-by');

  // Only answer requests addressed to this machine's loopback name (blocks DNS-rebinding
  // tricks where a web page you visit tries to talk to this local server).
  app.use((req, res, next) => {
    const host = String(req.headers.host ?? '').toLowerCase();
    if (!allowedHosts.has(host)) {
      res.status(421).type('text').send('Misdirected request');
      return;
    }
    next();
  });

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    next();
  });

  const api = express.Router();

  api.get(
    '/health',
    route(() => ({ ok: true, name: 'The Bee Streams', tmdbConfigured: hasTmdbCredential() })),
  );

  api.get(
    '/trending/:type',
    route((req) => {
      const type = req.params.type;
      if (!['movie', 'tv', 'all'].includes(type)) throw new BadRequest('type must be movie, tv or all');
      return getTrending(type, req.query.page, req.query.window);
    }),
  );

  api.get(
    '/lists/:kind',
    route((req) => {
      if (!(req.params.kind in LIST_KINDS)) throw new BadRequest(`Unknown list: ${req.params.kind}`);
      return getList(req.params.kind, req.query.page);
    }),
  );

  api.get(
    '/discover/:type',
    route((req) =>
      discover(mediaTypeParam(req.params.type), {
        genre: req.query.genre,
        sort: req.query.sort,
        year: req.query.year,
        rating: req.query.rating,
        page: req.query.page,
      }),
    ),
  );

  api.get(
    '/genres/:type',
    route((req) => getGenres(mediaTypeParam(req.params.type))),
  );

  api.get(
    '/search',
    route((req) => {
      const type = String(req.query.type ?? 'all');
      if (!['all', 'movie', 'tv', 'person'].includes(type)) throw new BadRequest('Invalid search type');
      return search(String(req.query.q ?? '').slice(0, 200), type, req.query.page);
    }),
  );

  api.get(
    '/movie/:id',
    route((req) => getMovie(positiveInt(req.params.id, 'movie id'), req.query.region)),
  );

  api.get(
    '/tv/:id',
    route((req) => getTv(positiveInt(req.params.id, 'show id'), req.query.region)),
  );

  api.get(
    '/tv/:id/season/:season',
    route((req) =>
      getSeason(positiveInt(req.params.id, 'show id'), nonNegativeInt(req.params.season, 'season number')),
    ),
  );

  api.get(
    '/person/:id',
    route((req) => getPerson(positiveInt(req.params.id, 'person id'))),
  );

  api.get(
    '/playback/:type/:id',
    route((req) => {
      const mediaType = mediaTypeParam(req.params.type);
      const tmdbId = positiveInt(req.params.id, 'id');
      if (mediaType === 'movie') {
        return { embedUrl: getPlaybackUrl({ mediaType, tmdbId }), mediaType, tmdbId };
      }
      const season = nonNegativeInt(req.query.season, 'season');
      const episode = positiveInt(req.query.episode, 'episode');
      return { embedUrl: getPlaybackUrl({ mediaType, tmdbId, season, episode }), mediaType, tmdbId, season, episode };
    }),
  );

  api.use((_req, res) => {
    res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
  });

  app.use('/api', api);

  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    const indexFile = path.join(staticDir, 'index.html');
    let playerOrigin = '';
    try {
      const u = new URL(config.playbackBaseUrl);
      if (u.protocol === 'http:') playerOrigin = ` ${u.origin}`;
    } catch {
      /* invalid override — https: below still applies */
    }
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://image.tmdb.org https://i.ytimg.com",
      "font-src 'self' data:",
      "connect-src 'self'",
      `frame-src https:${playerOrigin}`,
      "media-src 'self' https:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
    ].join('; ');

    app.use(
      '/assets',
      express.static(path.join(staticDir, 'assets'), { immutable: true, maxAge: '365d', index: false }),
    );
    app.use(express.static(staticDir, { index: false, maxAge: 0 }));
    app.get('*', (_req, res, next) => {
      res.setHeader('Content-Security-Policy', csp);
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexFile, (err) => {
        if (err) next(err);
      });
    });
  } else {
    app.use((_req, res) => {
      res.status(404).type('text').send('UI build not found.');
    });
  }

  return app;
}
