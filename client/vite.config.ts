import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import pkg from './package.json' with { type: 'json' };

/**
 * Extras for the static web build on GitHub Pages (`vite build --mode pages`):
 *  - 404.html: Pages has no SPA fallback, so deep links / refreshes (e.g. /bee-streams/movie/550)
 *    get the app via its 404 page and the router takes it from there.
 *  - A Content-Security-Policy <meta>, since there's no server to send it as a header.
 *    (The desktop build doesn't need either: its local server does both.)
 */
function githubPages(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://image.tmdb.org https://i.ytimg.com",
    "font-src 'self' data:",
    "connect-src 'self' https://api.themoviedb.org",
    'frame-src https:',
    "media-src 'self' https:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'bee-github-pages',
    apply: 'build',
    enforce: 'post', // after Vite has emitted index.html
    transformIndexHtml(html) {
      const charset = /<meta charset="UTF-8" \/>/i;
      if (!charset.test(html)) throw new Error('index.html needs <meta charset="UTF-8" /> for the CSP to go after');
      return html.replace(charset, (m) => `${m}\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
    },
    generateBundle(_options, bundle) {
      const index = bundle['index.html'];
      if (index?.type !== 'asset') this.error('index.html was not emitted');
      this.emitFile({ type: 'asset', fileName: '404.html', source: index.source });
    },
  };
}

export default defineConfig(({ mode }) => {
  const pages = mode === 'pages';
  return {
    // The site lives at https://<user>.github.io/bee-streams/. If the repo is renamed, change this
    // (or pass `--base /new-name/` to the build).
    base: pages ? '/bee-streams/' : '/',
    plugins: pages ? [react(), githubPages()] : [react()],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 800,
    },
    // `npm run dev` runs the UI in a normal browser, which talks to TMDB directly (key set in Settings).
    server: { port: 5174 },
  };
});
