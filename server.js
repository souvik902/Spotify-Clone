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

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Paths ----------
const DATA_DIR = path.join(__dirname, 'data');
const SONGS_FILE = path.join(DATA_DIR, 'songs.json');
const PLAYLISTS_FILE = path.join(DATA_DIR, 'playlists.json');
const LIKES_FILE = path.join(DATA_DIR, 'likes.json');
const RECENT_FILE = path.join(DATA_DIR, 'recent.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const AUDIO_DIR = path.join(UPLOADS_DIR, 'audio');
const COVER_DIR = path.join(UPLOADS_DIR, 'covers');

[DATA_DIR, UPLOADS_DIR, AUDIO_DIR, COVER_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});
[
  [SONGS_FILE, '[]'],
  [PLAYLISTS_FILE, '[]'],
  [LIKES_FILE, '[]'],
  [RECENT_FILE, '[]'],
].forEach(([file, initial]) => {
  if (!fs.existsSync(file)) fs.writeFileSync(file, initial);
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

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- Middleware ----------
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

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

app.delete('/api/songs/:id', (req, res) => {
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
    fs.unlink(path.join(__dirname, relUrl), (err) => {
      if (err && err.code !== 'ENOENT') console.error('Could not delete file:', relUrl, err);
    });
  });

  res.json({ success: true });
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
