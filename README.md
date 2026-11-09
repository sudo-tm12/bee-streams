# The Bee Streams — source

| Folder     | What it is                                                                 |
| ---------- | -------------------------------------------------------------------------- |
| `desktop/` | Electron shell: windows, settings/key storage, popup & redirect protection |
| `server/`  | Local API on `localhost:4010` (TMDB requests + caching), serves the UI      |
| `client/`  | React UI (Vite + TypeScript)                                               |
| `scripts/` | `deploy.mjs` — installs a build into an app folder                         |

## Common tasks

```sh
npm run setup        # first time: install all dependencies
npm run dev          # build the UI and open it in Electron
npm run deploy       # build + install into the installed app (close it first)
npm run deploy -- "D:\other\copy"   # …or into another app folder
```

The first deploy moves the original files to `resources/backup-v1`. To roll back, delete
`resources/app`, `resources/server-dist` and `resources/client-dist`, then move the contents of
`backup-v1` back into `resources/`.

## Notes

- Settings live in `%APPDATA%\the-bee-streams\bee-streams-config.json`; the TMDB key is encrypted
  with Windows data protection. My List / history live in the app's local storage.
- Keep `desktop/package.json` `"name": "the-bee-streams"` and the port `4010` unchanged, or the app
  will lose access to saved settings and history.
- Both TMDB credential types work: the 32-character **API Key** and the long **API Read Access Token**.
- Testing overrides: `BEE_USER_DATA` (separate profile), `BEE_PORT`, `PLAYBACK_BASE_URL`.
