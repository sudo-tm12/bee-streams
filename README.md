# The Bee Streams — source

**Web version: <https://sudo-tm12.github.io/bee-streams/>** — no install and no server. Open it, go to
Settings → TMDB connection, and paste your free TMDB key once (it's saved only in that browser).

| Folder              | What it is                                                                 |
| ------------------- | -------------------------------------------------------------------------- |
| `client/`           | React UI (Vite + TypeScript) — the whole web version                       |
| `desktop/`          | Electron shell: windows, settings/key storage, popup & redirect protection |
| `server/`           | Desktop app only: local API on `localhost:4010` that serves the UI         |
| `scripts/`          | `deploy.mjs` — installs a build into an app folder                         |
| `.github/workflows` | `pages.yml` — builds `client/` and publishes it to GitHub Pages            |

## How the web version works

In a normal browser the UI talks to TMDB directly (`client/src/lib/tmdb.ts`, a port of
`server/src/tmdb.js` that returns the same data), builds the player link itself, and keeps the key,
My List and watch history in the browser's local storage. Inside the desktop app (`window.bee` is
present) it keeps using the local server as before.

Every push to `master` rebuilds and redeploys the site (GitHub → Actions → "Deploy web app").

Differences from the desktop app: popups opened by embedded players are left to the browser's own
blocker (an ad blocker such as uBlock Origin helps), there's no mini player, and My List / history
aren't shared between the desktop app and the website.

## Common tasks

```sh
npm run setup        # first time: install all dependencies
npm run build:web    # build the website into client/dist (served under /bee-streams/)
npm --prefix client run dev            # UI in a normal browser at http://localhost:5174 (talks to TMDB directly)
npm --prefix client run preview:pages  # preview the website build at http://localhost:4173/bee-streams/

npm run dev          # build the UI and open it in Electron
npm run deploy       # build + install into the installed desktop app (close it first)
npm run deploy -- "D:\other\copy"   # …or into another app folder
```

The first deploy moves the original files to `resources/backup-v1`. To roll back, delete
`resources/app`, `resources/server-dist` and `resources/client-dist`, then move the contents of
`backup-v1` back into `resources/`.

## Notes

- Desktop settings live in `%APPDATA%\the-bee-streams\bee-streams-config.json`; the TMDB key is
  encrypted with Windows data protection. My List / history live in the app's local storage.
- Keep `desktop/package.json` `"name": "the-bee-streams"` and the port `4010` unchanged, or the app
  will lose access to saved settings and history.
- Both TMDB credential types work: the 32-character **API Key** and the long **API Read Access Token**.
- If the repo is renamed, change `base` in `client/vite.config.ts` to match the new Pages path.
- Testing overrides: `BEE_USER_DATA` (separate profile), `BEE_PORT`, `PLAYBACK_BASE_URL`.
