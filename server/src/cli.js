// Standalone runner for development: `TMDB_API_KEY=... STATIC_DIR=../client/dist node src/cli.js`
import { config } from './config.js';
import { startServer } from './index.js';

const { port } = await startServer();
console.log(`The Bee Streams server on http://localhost:${port}`);
if (!config.tmdbCredential) console.warn('TMDB_API_KEY is not set — API calls will fail until it is.');
if (config.staticDir) console.log(`Serving UI from ${config.staticDir}`);
