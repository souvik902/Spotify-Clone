/**
 * Spotify Web — Full Clone backend
 * ------------------------------------------------
 * Real REST API + JSON-file persistence for:
 *   - songs (upload, list, delete)
 *   - playlists (create, rename, delete, add/remove songs)
 *   - liked songs
 *   - recently played
 *   - search
 */
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Paths ----------
// Vercel deploys application files as read-only. Keep runtime data in /tmp
// there, while retaining the project folder for normal local development.
const APP_ROOT = __dirname;
const STORAGE_ROOT = process.env.VERCEL ? path.join(os.tmpdir(), 'spotify-web-full') : APP_ROOT;
const DATA_DIR = path.join(STORAGE_ROOT, 'data');
const SONGS_FILE = path.join(DATA_DIR, 'songs.json');
const PLAYLISTS_FILE = path.join(DATA_DIR, 'playlists.json');
const LIKES_FILE = path.join(DATA_DIR, 'likes.json');
const RECENT_FILE = path.join(DATA_DIR, 'recent.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const UPLOADS_DIR = path.join(STORAGE_ROOT, 'uploads');
const AUDIO_DIR = path.join(UPLOADS_DIR, 'audio');
const COVER_DIR = path.join(UPLOADS_DIR, 'covers');

[DATA_DIR, UPLOADS_DIR, AUDIO_DIR, COVER_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
function initialData(file, fallback) {
  const bundledFile = path.join(APP_ROOT, 'data', path.basename(file));
  if (STORAGE_ROOT !== APP_ROOT && fs.existsSync(bundledFile)) {
    return fs.readFileSync(bundledFile, 'utf-8');
  }
  return fallback;
}

[
  [SONGS_FILE, '[]'],
  [PLAYLISTS_FILE, '[]'],
  [LIKES_FILE, '[]'],
  [RECENT_FILE, '[]'],
  [SETTINGS_FILE, JSON.stringify({ siteTitle: 'Spotify Web', homeHeading: '', accentColor: '#1db954' }, null, 2)],
].forEach(([file, initial]) => {
  if (!fs.existsSync(file)) fs.writeFileSync(file, initialData(file, initial));
});

// ---------- JSON "database" helpers ----------
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    console.error('Failed to read', file, err);
    return [];
  }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
const readSongs = () => readJson(SONGS_FILE);
const writeSongs = (d) => writeJson(SONGS_FILE, d);
const readPlaylists = () => readJson(PLAYLISTS_FILE);
const writePlaylists = (d) => writeJson(PLAYLISTS_FILE, d);
const readLikes = () => readJson(LIKES_FILE);
const writeLikes = (d) => writeJson(LIKES_FILE, d);
const readRecent = () => readJson(RECENT_FILE);
const writeRecent = (d) => writeJson(RECENT_FILE, d);
const defaultSettings = { siteTitle: 'Spotify Web', homeHeading: '', accentColor: '#1db954' };
const readSettings = () => ({ ...defaultSettings, ...readJson(SETTINGS_FILE) });
const writeSettings = (d) => writeJson(SETTINGS_FILE, d);

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- Middleware ----------
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// ---------- Owner authentication ----------
// Credentials live only in deployment secrets. Session cookies are signed and
// expire after eight hours; no password is returned to the browser.
const SESSION_COOKIE = 'spotify_admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => {
    const index = part.indexOf('=');
    return index === -1 ? [] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}
function signSession(payload) {
  return crypto.createHmac('sha256', process.env.ADMIN_SESSION_SECRET).update(payload).digest('base64url');
}
function sessionValue() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  return `${payload}.${signSession(payload)}`;
}
function isOwner(req) {
  if (!process.env.ADMIN_SESSION_SECRET) return false;
  const value = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!value || !value.includes('.')) return false;
  const [payload, signature] = value.split('.');
  const expected = signSession(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).exp > Date.now(); } catch (_) { return false; }
}
function requireOwner(req, res, next) {
  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) {
    return res.status(503).json({ error: 'Admin authentication is not configured.' });
  }
  if (!isOwner(req)) return res.status(401).json({ error: 'Owner authentication required.' });
  next();
}

app.post('/api/admin/login', (req, res) => {
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured || !process.env.ADMIN_SESSION_SECRET) {
    return res.status(503).json({ error: 'Admin authentication is not configured.' });
  }
  const matches = password.length === configured.length && crypto.timingSafeEqual(Buffer.from(password), Buffer.from(configured));
  if (!matches) return res.status(401).json({ error: 'Invalid password.' });
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${sessionValue()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  res.status(204).end();
});
app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  res.status(204).end();
});
app.get('/api/admin/session', (req, res) => res.json({ authenticated: isOwner(req) }));

// ---------- Multer (uploads) ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'audio') return cb(null, AUDIO_DIR);
    if (file.fieldname === 'cover') return cb(null, COVER_DIR);
    cb(new Error('Unexpected field: ' + file.fieldname), null);
  },
  filename: (req, file, cb) => {
    cb(null, genId() + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'audio' && !file.mimetype.startsWith('audio/')) {
      return cb(new Error('The song file must be an audio file.'));
    }
    if (file.fieldname === 'cover' && !file.mimetype.startsWith('image/')) {
      return cb(new Error('The cover file must be an image.'));
    }
    cb(null, true);
  },
});

// =========================================================
//  SONGS
// =========================================================
app.get('/api/songs', (req, res) => res.json(readSongs()));

app.post(
  '/api/songs',
  requireOwner,
  upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'cover', maxCount: 1 }]),
  (req, res) => {
    const { title, artist, album, genre, language } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'A song title is required.' });
    if (!req.files || !req.files.audio) return res.status(400).json({ error: 'An audio file is required.' });

    const audioFile = req.files.audio[0];
    const coverFile = req.files.cover ? req.files.cover[0] : null;

    const song = {
      id: genId(),
      title: title.trim(),
      artist: (artist || 'Unknown Artist').trim(),
      album: (album || '').trim(),
      genre: (genre || '').trim(),
      language: (language || '').trim(),
      audioUrl: '/uploads/audio/' + audioFile.filename,
      coverUrl: coverFile ? '/uploads/covers/' + coverFile.filename : null,
      createdAt: new Date().toISOString(),
    };

    const songs = readSongs();
    songs.unshift(song);
    writeSongs(songs);
    res.status(201).json(song);
  }
);

app.patch('/api/songs/:id', requireOwner, (req, res) => {
  const songs = readSongs();
  const song = songs.find((item) => item.id === req.params.id);
  if (!song) return res.status(404).json({ error: 'Song not found.' });
  ['title', 'artist', 'album', 'genre', 'language'].forEach((field) => {
    if (typeof req.body[field] === 'string') song[field] = req.body[field].trim();
  });
  if (!song.title) return res.status(400).json({ error: 'A song title is required.' });
  writeSongs(songs);
  res.json(song);
});

app.delete('/api/songs/:id', requireOwner, (req, res) => {
  const songs = readSongs();
  const idx = songs.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Song not found.' });

  const [removed] = songs.splice(idx, 1);
  writeSongs(songs);

  // Cascade: remove from playlists, likes, recently played
  const playlists = readPlaylists().map((p) => ({
    ...p,
    songIds: p.songIds.filter((id) => id !== removed.id),
  }));
  writePlaylists(playlists);
  writeLikes(readLikes().filter((id) => id !== removed.id));
  writeRecent(readRecent().filter((id) => id !== removed.id));

  [removed.audioUrl, removed.coverUrl].forEach((relUrl) => {
    if (!relUrl) return;
    if (!relUrl.startsWith('/uploads/')) return;
    fs.unlink(path.join(STORAGE_ROOT, relUrl), (err) => {
      if (err && err.code !== 'ENOENT') console.error('Could not delete file:', relUrl, err);
    });
  });

  res.json({ success: true });
});

// =========================================================
//  SITE SETTINGS
// =========================================================
app.get('/api/settings', (req, res) => res.json(readSettings()));
app.put('/api/settings', requireOwner, (req, res) => {
  const settings = {
    siteTitle: typeof req.body.siteTitle === 'string' ? req.body.siteTitle.trim().slice(0, 80) : readSettings().siteTitle,
    homeHeading: typeof req.body.homeHeading === 'string' ? req.body.homeHeading.trim().slice(0, 120) : readSettings().homeHeading,
    accentColor: typeof req.body.accentColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(req.body.accentColor) ? req.body.accentColor : readSettings().accentColor,
  };
  if (!settings.siteTitle) return res.status(400).json({ error: 'A site title is required.' });
  writeSettings(settings);
  res.json(settings);
});

// =========================================================
//  SEARCH
// =========================================================
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.json({ songs: [], artists: [], playlists: [] });

  const songs = readSongs();
  const matchedSongs = songs.filter(
    (s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q) ||
      (s.language || '').toLowerCase().includes(q) || (s.genre || '').toLowerCase().includes(q)
  );

  const artistNames = [...new Set(songs.map((s) => s.artist))].filter((a) =>
    a.toLowerCase().includes(q)
  );

  const playlists = readPlaylists().filter((p) => p.name.toLowerCase().includes(q));

  res.json({ songs: matchedSongs, artists: artistNames, playlists });
});

// =========================================================
//  PLAYLISTS
// =========================================================
app.get('/api/playlists', (req, res) => res.json(readPlaylists()));

app.get('/api/playlists/:id', (req, res) => {
  const playlist = readPlaylists().find((p) => p.id === req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found.' });
  res.json(playlist);
});

app.post('/api/playlists', (req, res) => {
  const { name, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'A playlist name is required.' });

  const playlist = {
    id: genId(),
    name: name.trim(),
    description: (description || '').trim(),
    songIds: [],
    createdAt: new Date().toISOString(),
  };
  const playlists = readPlaylists();
  playlists.unshift(playlist);
  writePlaylists(playlists);
  res.status(201).json(playlist);
});

app.patch('/api/playlists/:id', (req, res) => {
  const playlists = readPlaylists();
  const playlist = playlists.find((p) => p.id === req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found.' });

  if (typeof req.body.name === 'string' && req.body.name.trim()) playlist.name = req.body.name.trim();
  if (typeof req.body.description === 'string') playlist.description = req.body.description.trim();

  writePlaylists(playlists);
  res.json(playlist);
});

app.delete('/api/playlists/:id', (req, res) => {
  const playlists = readPlaylists();
  const idx = playlists.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Playlist not found.' });
  playlists.splice(idx, 1);
  writePlaylists(playlists);
  res.json({ success: true });
});

app.post('/api/playlists/:id/songs', (req, res) => {
  const { songId } = req.body;
  if (!songId) return res.status(400).json({ error: 'songId is required.' });

  const playlists = readPlaylists();
  const playlist = playlists.find((p) => p.id === req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found.' });

  const songExists = readSongs().some((s) => s.id === songId);
  if (!songExists) return res.status(404).json({ error: 'Song not found.' });

  if (!playlist.songIds.includes(songId)) playlist.songIds.push(songId);
  writePlaylists(playlists);
  res.json(playlist);
});

app.delete('/api/playlists/:id/songs/:songId', (req, res) => {
  const playlists = readPlaylists();
  const playlist = playlists.find((p) => p.id === req.params.id);
  if (!playlist) return res.status(404).json({ error: 'Playlist not found.' });

  playlist.songIds = playlist.songIds.filter((id) => id !== req.params.songId);
  writePlaylists(playlists);
  res.json(playlist);
});

// =========================================================
//  LIKES
// =========================================================
app.get('/api/likes', (req, res) => res.json(readLikes()));

app.post('/api/likes/:songId', (req, res) => {
  const likes = readLikes();
  if (!likes.includes(req.params.songId)) likes.unshift(req.params.songId);
  writeLikes(likes);
  res.json(likes);
});

app.delete('/api/likes/:songId', (req, res) => {
  const likes = readLikes().filter((id) => id !== req.params.songId);
  writeLikes(likes);
  res.json(likes);
});

// =========================================================
//  RECENTLY PLAYED
// =========================================================
app.get('/api/recent', (req, res) => res.json(readRecent()));

app.post('/api/recent/:songId', (req, res) => {
  let recent = readRecent().filter((id) => id !== req.params.songId);
  recent.unshift(req.params.songId);
  recent = recent.slice(0, 20); // keep last 20
  writeRecent(recent);
  res.json(recent);
});

// ---------- Error handler ----------
app.use((err, req, res, next) => {
  console.error(err);
  res.status(400).json({ error: err.message || 'Something went wrong.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🎧 Spotify Web (Full) running at http://localhost:${PORT}`);
  });
}

module.exports = app;
