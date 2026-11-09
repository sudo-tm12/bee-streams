import http from 'http';
import { createApp } from './app.js';
import { config } from './config.js';

export {
  clearCache,
  credentialKind,
  hasTmdbCredential,
  setTmdbCredential,
  validateTmdbCredential,
} from './tmdb.js';

function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(server);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

/**
 * Starts the local API + UI server on loopback only (never reachable from your network).
 * Listens on both 127.0.0.1 and ::1 so `localhost` resolves instantly either way.
 *
 * @param {{ port?: number, staticDir?: string }} [options]
 * @returns {Promise<{ port: number, close: () => Promise<void> }>}
 */
export async function startServer(options = {}) {
  const port = options.port ?? config.port;
  if (options.staticDir) config.staticDir = options.staticDir;

  const allowedHosts = new Set([`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`]);
  const app = createApp({ staticDir: config.staticDir, allowedHosts });

  const servers = [await listen(http.createServer(app), port, '127.0.0.1')];
  try {
    servers.push(await listen(http.createServer(app), port, '::1'));
  } catch (err) {
    // IPv6 loopback can be disabled on some PCs; IPv4 alone is fine.
    if (err?.code === 'EADDRINUSE') {
      await Promise.all(servers.map((s) => new Promise((r) => s.close(() => r()))));
      throw err;
    }
  }

  return {
    port,
    close: () => Promise.all(servers.map((s) => new Promise((r) => s.close(() => r())))).then(() => undefined),
  };
}
