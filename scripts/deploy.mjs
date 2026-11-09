// Installs this build into an existing "The Bee Streams" app folder (the one containing the .exe).
//
//   node scripts/deploy.mjs                      → %LOCALAPPDATA%\Programs\the-bee-streams (the installed app)
//   node scripts/deploy.mjs "C:\path\to\the-bee-streams"
//
// The first deploy moves the original files into resources/backup-v1 so you can roll back:
// delete resources/app, resources/server-dist, resources/client-dist and move backup-v1's contents back.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultTarget = path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'the-bee-streams');
const target = path.resolve(process.argv[2] ?? defaultTarget);
const resources = path.join(target, 'resources');

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(path.join(target, 'The Bee Streams.exe'))) {
  fail(`"${target}" doesn't look like a The Bee Streams folder (no "The Bee Streams.exe").`);
}
const clientDist = path.join(root, 'client', 'dist');
if (!fs.existsSync(path.join(clientDist, 'index.html'))) fail('Client isn’t built yet. Run "npm run build" first.');
if (!fs.existsSync(path.join(root, 'server', 'node_modules', 'express'))) {
  fail('Server dependencies missing. Run "npm --prefix server install" first.');
}

const IN_USE =
  'is in use by another program. Close The Bee Streams (and any editor that has this folder open, e.g. VS Code), then run this again.';

function move(from, to) {
  try {
    fs.renameSync(from, to);
  } catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') fail(`"${from}" ${IN_USE}`);
    throw err;
  }
}

function remove(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch (err) {
    if (err.code === 'EBUSY' || err.code === 'EPERM') fail(`"${p}" ${IN_USE}`);
    throw err;
  }
}

// Fail early (before touching anything) if the original files are locked.
for (const name of ['app.asar', 'server-dist', 'client-dist', 'app']) {
  const p = path.join(resources, name);
  if (!fs.existsSync(p)) continue;
  const probe = `${p}.deploy-probe`;
  move(p, probe);
  move(probe, p);
}

// 1. Back up the original app once (and anything an installer/updater put back since).
const backup = path.join(resources, 'backup-v1');
const originals = ['app.asar', 'app.asar.unpacked', 'server-dist', 'client-dist'];
const alreadyBackedUp = fs.existsSync(backup) && fs.readdirSync(backup).length > 0;
if (!alreadyBackedUp) {
  fs.mkdirSync(backup, { recursive: true });
  for (const name of originals) {
    const p = path.join(resources, name);
    if (fs.existsSync(p)) move(p, path.join(backup, name));
  }
  console.log(`• Backed up the original app to ${backup}`);
} else {
  const stray = path.join(resources, 'app.asar');
  if (fs.existsSync(stray)) {
    const extra = path.join(resources, `backup-${Date.now()}`);
    fs.mkdirSync(extra);
    move(stray, path.join(extra, 'app.asar'));
    console.log(`• Found a reinstalled app.asar — moved it to ${extra}`);
  }
}

// 2. Replace the app files.
for (const name of ['app', 'server-dist', 'client-dist']) remove(path.join(resources, name));

const copy = (from, to, filter) => fs.cpSync(from, to, { recursive: true, filter });

copy(path.join(root, 'desktop'), path.join(resources, 'app'), (src) => !src.endsWith('.md'));
copy(path.join(root, 'server', 'src'), path.join(resources, 'server-dist'));
fs.copyFileSync(path.join(root, 'server', 'package.json'), path.join(resources, 'server-dist', 'package.json'));
copy(path.join(root, 'server', 'node_modules'), path.join(resources, 'server-dist', 'node_modules'));
copy(clientDist, path.join(resources, 'client-dist'));

console.log(`• Installed The Bee Streams ${JSON.parse(fs.readFileSync(path.join(root, 'desktop', 'package.json'), 'utf8')).version} into ${target}`);
console.log('✔ Done. Start "The Bee Streams" as usual.');
