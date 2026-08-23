(function () {
  // ================= State =================
  let songs = [];
  let playlists = [];
  let likedIds = [];      // array of song ids
  let recentIds = [];     // array of song ids, most recent first

  let queue = [];         // array of song objects currently being played through
  let currentIndex = -1;
  let isPlaying = false;
  let isShuffle = false;
  let repeatMode = 0;     // 0 off, 1 all, 2 one

  let currentView = 'home';
  let currentPlaylistId = null;
  let currentArtistName = null;
  let addToPlaylistSongId = null;
  let searchDebounce = null;

  const API = '/api';

  // ================= DOM refs =================
  const audioEl = document.getElementById('audioEl');
  const appEl = document.querySelector('.app');
  const toast = document.getElementById('toast');

  const views = {
    home: document.getElementById('view-home'),
    search: document.getElementById('view-search'),
    liked: document.getElementById('view-liked'),
    playlist: document.getElementById('view-playlist'),
    artist: document.getElementById('view-artist'),
  };

  const libraryList = document.getElementById('libraryList');
  const quickGrid = document.getElementById('quickGrid');
  const recentGrid = document.getElementById('recentGrid');
  const playlistGrid = document.getElementById('playlistGrid');
  const cardGrid = document.getElementById('cardGrid');
  const emptyState = document.getElementById('emptyState');

  const searchInput = document.getElementById('searchInput');
  const topbarSearch = document.getElementById('topbarSearch');
  const searchEmpty = document.getElementById('searchEmpty');
  const searchResults = document.getElementById('searchResults');
  const searchSongs = document.getElementById('searchSongs');
  const searchArtists = document.getElementById('searchArtists');
  const searchPlaylists = document.getElementById('searchPlaylists');

  const likedTable = document.getElementById('likedTable');
  const likedCount = document.getElementById('likedCount');

  const playlistName = document.getElementById('playlistName');
  const playlistCover = document.getElementById('playlistCover');
  const playlistCount = document.getElementById('playlistCount');
  const playlistTable = document.getElementById('playlistTable');
  const playlistAddTable = document.getElementById('playlistAddTable');

  const artistName = document.getElementById('artistName');
  const artistCover = document.getElementById('artistCover');
  const artistCount = document.getElementById('artistCount');
  const artistTable = document.getElementById('artistTable');

  const queuePanel = document.getElementById('queuePanel');
  const queueNowPlaying = document.getElementById('queueNowPlaying');
  const queueNext = document.getElementById('queueNext');

  const npArt = document.getElementById('npArt');
  const npTitle = document.getElementById('npTitle');
  const npArtist = document.getElementById('npArtist');
  const likeBtn = document.getElementById('likeBtn');
  const playBtn = document.getElementById('playBtn');
  const seekBar = document.getElementById('seekBar');
  const seekFill = document.getElementById('seekFill');
  const seekThumb = document.getElementById('seekThumb');
  const curTime = document.getElementById('curTime');
  const durTime = document.getElementById('durTime');
  const volBar = document.getElementById('volBar');
  const volFill = document.getElementById('volFill');
  const shuffleBtn = document.getElementById('shuffleBtn');
  const repeatBtn = document.getElementById('repeatBtn');
  const muteBtn = document.getElementById('muteBtn');
  const queueBtn = document.getElementById('queueBtn');

  const ICON_PLAY = '<path d="M8 5v14l11-7z"/>';
  const ICON_PAUSE = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';
  const ICON_TRASH = '<path d="M6 7h12l-1 13H7L6 7zm3-3h6l1 2H8l1-2zM9 10v7M12 10v7M15 10v7" fill="none" stroke="currentColor" stroke-width="1.6"/>';
  const ICON_HEART = '<path d="M12 21s-7.5-4.7-10-9.3C.5 8 2 4 6 4c2.2 0 3.7 1.1 4.5 2.3.8 1.2 1.5 2.3 1.5 2.3s.7-1.1 1.5-2.3C14.3 5.1 15.8 4 18 4c4 0 5.5 4 4 7.7C19.5 16.3 12 21 12 21z"/>';
  const ICON_PLUS = '<path d="M12 4a1 1 0 0 1 1 1v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5a1 1 0 0 1 1-1z"/>';
  const ICON_CHECK = '<path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2.5"/>';

  const COVER_GRADIENTS = [
    'linear-gradient(135deg,#1db954,#191414)', 'linear-gradient(135deg,#450af5,#c4efd9)',
    'linear-gradient(135deg,#e91429,#f8d800)', 'linear-gradient(135deg,#af2896,#509bf5)',
    'linear-gradient(135deg,#e8115b,#8c1932)', 'linear-gradient(135deg,#0d73ec,#e8115b)',
    'linear-gradient(135deg,#dc148c,#7d2edb)',
  ];
  function gradientFor(id) {
    let hash = 0;
    for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    return COVER_GRADIENTS[hash % COVER_GRADIENTS.length];
  }
  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : str;
    return d.innerHTML;
  }
  function showToast(msg, isError) {
    toast.textContent = msg;
    toast.classList.toggle('error', !!isError);
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 2600);
  }
  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    return Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0');
  }
  function songById(id) { return songs.find((s) => s.id === id); }

  // ================= API =================
  async function api(path, opts) {
    const res = await fetch(API + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed.');
    return data;
  }
  const getSongs = () => api('/songs');
  const postSong = (fd) => api('/songs', { method: 'POST', body: fd });
  const deleteSongApi = (id) => api('/songs/' + id, { method: 'DELETE' });
  const getPlaylists = () => api('/playlists');
  const createPlaylistApi = (name, description) =>
    api('/playlists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description }) });
  const patchPlaylistApi = (id, body) =>
    api('/playlists/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const deletePlaylistApi = (id) => api('/playlists/' + id, { method: 'DELETE' });
  const addSongToPlaylistApi = (playlistId, songId) =>
    api(`/playlists/${playlistId}/songs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ songId }) });
  const removeSongFromPlaylistApi = (playlistId, songId) =>
    api(`/playlists/${playlistId}/songs/${songId}`, { method: 'DELETE' });
  const getLikes = () => api('/likes');
  const likeSongApi = (id) => api('/likes/' + id, { method: 'POST' });
  const unlikeSongApi = (id) => api('/likes/' + id, { method: 'DELETE' });
  const getRecent = () => api('/recent');
  const markRecentApi = (id) => api('/recent/' + id, { method: 'POST' });
  const searchApi = (q) => api('/search?q=' + encodeURIComponent(q));

  // ================= Bootstrap =================
  async function bootstrap() {
    try {
      const [s, p, l, r] = await Promise.all([getSongs(), getPlaylists(), getLikes(), getRecent()]);
      songs = s; playlists = p; likedIds = l; recentIds = r;
    } catch (err) {
      showToast('Could not reach the server. Is it running?', true);
    }
    renderSidebar();
    renderHome();
  }

  // ================= Navigation =================
  function switchView(name) {
    Object.entries(views).forEach(([key, el]) => { el.style.display = key === name ? '' : 'none'; });
    currentView = name;
    document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));
    if (name === 'home') document.querySelector('[data-nav="home"]').classList.add('active');
    if (name === 'search') document.querySelector('[data-nav="search"]').classList.add('active');
    topbarSearch.style.display = name === 'search' ? 'flex' : 'none';
    document.getElementById('mainScroll').scrollTop = 0;
  }

  document.querySelector('[data-nav="home"]').addEventListener('click', () => { switchView('home'); renderHome(); });
  document.querySelector('[data-nav="search"]').addEventListener('click', () => { switchView('search'); searchInput.focus(); });
  document.getElementById('backBtn').addEventListener('click', () => { switchView('home'); renderHome(); });

  // ================= Sidebar rendering =================
  let libFilter = 'all';
  document.querySelectorAll('.lib-filters .pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.lib-filters .pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      libFilter = pill.dataset.filter;
      renderSidebar();
    });
  });

  function renderSidebar() {
    libraryList.innerHTML = '';

    // Liked Songs pinned item
    if (libFilter === 'all' || libFilter === 'playlists') {
      const likedEl = document.createElement('div');
      likedEl.className = 'lib-item';
      likedEl.innerHTML = `
        <div class="art" style="background:linear-gradient(135deg,#450af5,#c8b6ff); display:flex;align-items:center;justify-content:center;">
          <svg viewBox="0 0 24 24" fill="#fff" width="22" height="22">${ICON_HEART}</svg>
        </div>
        <div class="meta">
          <div class="title">Liked Songs</div>
          <div class="sub">Playlist • ${likedIds.length} songs</div>
        </div>`;
      likedEl.addEventListener('click', () => openLiked());
      libraryList.appendChild(likedEl);
    }

    if (libFilter === 'all' || libFilter === 'playlists') {
      playlists.forEach((p) => {
        const el = document.createElement('div');
        el.className = 'lib-item';
        const coverSong = p.songIds.length ? songById(p.songIds[0]) : null;
        el.innerHTML = `
          <div class="art">${coverSong && coverSong.coverUrl ? `<img src="${coverSong.coverUrl}">` : `<div style="width:100%;height:100%;background:${gradientFor(p.id)};display:flex;align-items:center;justify-content:center;">🎵</div>`}</div>
          <div class="meta">
            <div class="title">${escapeHtml(p.name)}</div>
            <div class="sub">Playlist • ${p.songIds.length} songs</div>
          </div>`;
        el.addEventListener('click', () => openPlaylist(p.id));
        libraryList.appendChild(el);
      });
    }

    if (libFilter === 'all' || libFilter === 'songs') {
      songs.forEach((song) => {
        const el = document.createElement('div');
        el.className = 'lib-item' + (queue[currentIndex] && queue[currentIndex].id === song.id ? ' playing' : '');
        el.innerHTML = `
          <div class="art">${song.coverUrl ? `<img src="${song.coverUrl}">` : `<div style="width:100%;height:100%;background:${gradientFor(song.id)};display:flex;align-items:center;justify-content:center;">🎵</div>`}</div>
          <div class="meta">
            <div class="title">${escapeHtml(song.title)}</div>
            <div class="sub">Song • ${escapeHtml(song.artist)}${song.language ? ' • ' + escapeHtml(song.language) : ''}</div>
          </div>
          <button class="remove-btn" title="Delete"><svg viewBox="0 0 24 24">${ICON_TRASH}</svg></button>`;
        el.querySelector('.remove-btn').addEventListener('click', (e) => { e.stopPropagation(); handleDeleteSong(song.id); });
        el.addEventListener('click', () => playContext(songs, songs.indexOf(song)));
        libraryList.appendChild(el);
      });
    }

    if (!libraryList.children.length) {
      libraryList.innerHTML = `<div class="empty-lib">Nothing here yet.</div>`;
    }
  }

  // ================= Track row builder (reused across views) =================
  function buildTrackRow(song, idx, opts) {
    opts = opts || {};
    const isCurrent = queue[currentIndex] && queue[currentIndex].id === song.id;
    const isLiked = likedIds.includes(song.id);
    const row = document.createElement('div');
    row.className = 'track-row' + (isCurrent && isPlaying ? ' playing' : '');
    row.innerHTML = `
      <div class="idx">
        <span class="row-num">${idx + 1}</span>
        <svg class="row-play-icon" viewBox="0 0 24 24" fill="currentColor">${isCurrent && isPlaying ? ICON_PAUSE : ICON_PLAY}</svg>
      </div>
      <div class="info">
        <div class="art">${song.coverUrl ? `<img src="${song.coverUrl}">` : `<div style="width:100%;height:100%;background:${gradientFor(song.id)};display:flex;align-items:center;justify-content:center;">🎵</div>`}</div>
        <div class="text">
          <div class="track-title">${escapeHtml(song.title)}</div>
          <div class="track-artist">${escapeHtml(song.artist)}${song.language ? ' • ' + escapeHtml(song.language) : ''}</div>
        </div>
      </div>
      <div class="duration">${opts.rightLabel || ''}</div>
      <div class="row-actions">
        ${opts.showLike !== false ? `<button class="like-row-btn ${isLiked ? 'liked' : ''}" title="Like"><svg viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">${ICON_HEART}</svg></button>` : ''}
        ${opts.showAdd !== false ? `<button class="add-row-btn" title="Add to playlist"><svg viewBox="0 0 24 24" fill="currentColor">${ICON_PLUS}</svg></button>` : ''}
        ${opts.showRemove ? `<button class="remove-row-btn" title="${opts.removeLabel || 'Remove'}"><svg viewBox="0 0 24 24">${opts.removeIcon || ICON_TRASH}</svg></button>` : ''}
      </div>
    `;
    row.querySelector('.track-artist').addEventListener('click', (e) => { e.stopPropagation(); openArtist(song.artist); });
    const likeRowBtn = row.querySelector('.like-row-btn');
    if (likeRowBtn) likeRowBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleLike(song.id); });
    const addRowBtn = row.querySelector('.add-row-btn');
    if (addRowBtn) addRowBtn.addEventListener('click', (e) => { e.stopPropagation(); openAddToPlaylist(song.id); });
    const removeRowBtn = row.querySelector('.remove-row-btn');
    if (removeRowBtn) removeRowBtn.addEventListener('click', (e) => { e.stopPropagation(); opts.onRemove && opts.onRemove(song.id); });
    row.addEventListener('click', () => { opts.onPlay ? opts.onPlay() : playContext(opts.context || songs, idx); });
    return row;
  }

  function renderTrackTable(container, list, opts) {
    container.innerHTML = '';
    if (!list.length) {
      container.innerHTML = `<div class="table-empty">${opts && opts.emptyText ? opts.emptyText : 'No songs here yet.'}</div>`;
      return;
    }
    list.forEach((song, idx) => {
      container.appendChild(buildTrackRow(song, idx, Object.assign({ context: list }, opts)));
    });
  }

  // ================= HOME =================
  function renderHome() {
    const hasSongs = songs.length > 0;
    emptyState.style.display = hasSongs ? 'none' : 'block';

    quickGrid.innerHTML = '';
    songs.slice(0, 6).forEach((song) => {
      const realIdx = songs.indexOf(song);
      const el = document.createElement('div');
      el.className = 'quick-card';
      el.innerHTML = `
        <div class="art">${song.coverUrl ? `<img src="${song.coverUrl}">` : `<div style="width:100%;height:100%;background:${gradientFor(song.id)};display:flex;align-items:center;justify-content:center;">🎵</div>`}</div>
        <span>${escapeHtml(song.title)}</span>
        <div class="play-fab"><svg viewBox="0 0 24 24">${ICON_PLAY}</svg></div>`;
      el.addEventListener('click', () => playContext(songs, realIdx));
      quickGrid.appendChild(el);
    });

    recentGrid.innerHTML = '';
    recentIds.map(songById).filter(Boolean).slice(0, 6).forEach((song) => {
      recentGrid.appendChild(buildMusicCard(song, songs.indexOf(song), songs));
    });

    playlistGrid.innerHTML = '';
    playlists.slice(0, 6).forEach((p) => {
      const el = document.createElement('div');
      el.className = 'music-card';
      const coverSong = p.songIds.length ? songById(p.songIds[0]) : null;
      el.innerHTML = `
        <div class="art">${coverSong && coverSong.coverUrl ? `<img src="${coverSong.coverUrl}">` : `<div style="width:100%;height:100%;background:${gradientFor(p.id)};display:flex;align-items:center;justify-content:center;font-size:40px;">🎵</div>`}</div>
        <div class="title">${escapeHtml(p.name)}</div>
        <div class="sub">${p.songIds.length} songs</div>`;
      el.addEventListener('click', () => openPlaylist(p.id));
      playlistGrid.appendChild(el);
    });

    cardGrid.innerHTML = '';
    songs.forEach((song, idx) => cardGrid.appendChild(buildMusicCard(song, idx, songs, true)));
  }

  function buildMusicCard(song, idx, context, showRemove) {
    const isCurrent = queue[currentIndex] && queue[currentIndex].id === song.id;
    const el = document.createElement('div');
    el.className = 'music-card' + (isCurrent && isPlaying ? ' playing' : '');
    el.innerHTML = `
      ${showRemove ? `<button class="remove-btn" title="Remove"><svg viewBox="0 0 24 24">${ICON_TRASH}</svg></button>` : ''}
      <div class="art">${song.coverUrl ? `<img src="${song.coverUrl}">` : `<div style="width:100%;height:100%;background:${gradientFor(song.id)};display:flex;align-items:center;justify-content:center;font-size:40px;">🎵</div>`}
        <div class="play-fab"><svg viewBox="0 0 24 24">${isCurrent && isPlaying ? ICON_PAUSE : ICON_PLAY}</svg></div>
      </div>
      <div class="title">${escapeHtml(song.title)}</div>
      <div class="sub">${escapeHtml(song.artist)}${song.language ? ' • ' + escapeHtml(song.language) : ''}</div>`;
    el.querySelector('.play-fab').addEventListener('click', (e) => {
      e.stopPropagation();
      isCurrent ? togglePlay() : playContext(context, idx);
    });
    if (showRemove) {
      el.querySelector('.remove-btn').addEventListener('click', (e) => { e.stopPropagation(); handleDeleteSong(song.id); });
    }
    el.addEventListener('click', () => { isCurrent ? togglePlay() : playContext(context, idx); });
    return el;
  }

  document.getElementById('emptyAddBtn').addEventListener('click', openAddModal);

  // ================= SEARCH =================
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    const q = searchInput.value.trim();
    if (!q) { searchEmpty.style.display = 'block'; searchResults.style.display = 'none'; return; }
    searchDebounce = setTimeout(() => runSearch(q), 250);
  });

  async function runSearch(q) {
    try {
      const result = await searchApi(q);
      searchEmpty.style.display = 'none';
      searchResults.style.display = 'block';
      renderTrackTable(searchSongs, result.songs, { emptyText: 'No matching songs.' });
      searchArtists.innerHTML = '';
      result.artists.forEach((name) => {
        const chip = document.createElement('div');
        chip.className = 'artist-chip';
        chip.innerHTML = `<div class="art">🎤</div><div class="name">${escapeHtml(name)}</div>`;
        chip.addEventListener('click', () => openArtist(name));
        searchArtists.appendChild(chip);
      });
      searchPlaylists.innerHTML = '';
      result.playlists.forEach((p) => {
        const el = document.createElement('div');
        el.className = 'music-card';
        el.innerHTML = `<div class="art"><div style="width:100%;height:100%;background:${gradientFor(p.id)};display:flex;align-items:center;justify-content:center;font-size:40px;">🎵</div></div>
          <div class="title">${escapeHtml(p.name)}</div><div class="sub">${p.songIds.length} songs</div>`;
        el.addEventListener('click', () => openPlaylist(p.id));
        searchPlaylists.appendChild(el);
      });
    } catch (err) {
      showToast(err.message, true);
    }
  }

  // ================= LIKED SONGS =================
  function openLiked() {
    switchView('liked');
    renderLiked();
  }
  function renderLiked() {
    const likedSongs = likedIds.map(songById).filter(Boolean);
    likedCount.textContent = likedSongs.length + (likedSongs.length === 1 ? ' song' : ' songs');
    renderTrackTable(likedTable, likedSongs, { emptyText: 'Songs you like will appear here.', showLike: true, showAdd: true });
  }
  document.getElementById('likedPlayBtn').addEventListener('click', () => {
    const likedSongs = likedIds.map(songById).filter(Boolean);
    if (likedSongs.length) playContext(likedSongs, 0);
  });

  // ================= PLAYLIST DETAIL =================
  function openPlaylist(id) {
    currentPlaylistId = id;
    switchView('playlist');
    renderPlaylistView();
  }
  function renderPlaylistView() {
    const p = playlists.find((x) => x.id === currentPlaylistId);
    if (!p) { switchView('home'); renderHome(); return; }
    playlistName.textContent = p.name;
    playlistCount.textContent = p.songIds.length + (p.songIds.length === 1 ? ' song' : ' songs');
    const coverSong = p.songIds.length ? songById(p.songIds[0]) : null;
    playlistCover.innerHTML = coverSong && coverSong.coverUrl ? `<img src="${coverSong.coverUrl}">` : '🎵';
    playlistCover.style.background = coverSong ? '' : gradientFor(p.id);

    const playlistSongs = p.songIds.map(songById).filter(Boolean);
    renderTrackTable(playlistTable, playlistSongs, {
      emptyText: 'This playlist is empty. Add some songs below.',
      showRemove: true, removeLabel: 'Remove from playlist',
      onRemove: (songId) => handleRemoveFromPlaylist(p.id, songId),
    });

    // "Add songs" list: all songs not already in playlist
    const remaining = songs.filter((s) => !p.songIds.includes(s.id));
    playlistAddTable.innerHTML = '';
    if (!remaining.length) {
      playlistAddTable.innerHTML = `<div class="table-empty">All your songs are already in this playlist.</div>`;
    } else {
      remaining.forEach((song, idx) => {
        const row = buildTrackRow(song, idx, {
          showLike: false, showAdd: false, showRemove: true,
          removeLabel: 'Add to playlist', removeIcon: ICON_PLUS,
          onRemove: () => handleAddToPlaylist(p.id, song.id),
          onPlay: () => handleAddToPlaylist(p.id, song.id),
        });
        playlistAddTable.appendChild(row);
      });
    }
  }
  playlistName.addEventListener('blur', async () => {
    const p = playlists.find((x) => x.id === currentPlaylistId);
    if (!p) return;
    const newName = playlistName.textContent.trim() || p.name;
    playlistName.textContent = newName;
    if (newName !== p.name) {
      try {
        await patchPlaylistApi(p.id, { name: newName });
        p.name = newName;
        renderSidebar();
      } catch (err) { showToast(err.message, true); }
    }
  });
  playlistName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); playlistName.blur(); } });

  document.getElementById('playlistPlayBtn').addEventListener('click', () => {
    const p = playlists.find((x) => x.id === currentPlaylistId);
    const playlistSongs = p ? p.songIds.map(songById).filter(Boolean) : [];
    if (playlistSongs.length) playContext(playlistSongs, 0);
  });
  document.getElementById('deletePlaylistBtn').addEventListener('click', async () => {
    if (!currentPlaylistId) return;
    try {
      await deletePlaylistApi(currentPlaylistId);
      playlists = playlists.filter((p) => p.id !== currentPlaylistId);
      showToast('Playlist deleted');
      switchView('home'); renderHome(); renderSidebar();
    } catch (err) { showToast(err.message, true); }
  });

  async function handleAddToPlaylist(playlistId, songId) {
    try {
      const updated = await addSongToPlaylistApi(playlistId, songId);
      const p = playlists.find((x) => x.id === playlistId);
      if (p) p.songIds = updated.songIds;
      renderSidebar();
      if (currentView === 'playlist' && currentPlaylistId === playlistId) renderPlaylistView();
      if (document.getElementById('addToPlaylistOverlay').classList.contains('open')) renderAddToPlaylistList();
      showToast('Added to playlist');
    } catch (err) { showToast(err.message, true); }
  }
  async function handleRemoveFromPlaylist(playlistId, songId) {
    try {
      const updated = await removeSongFromPlaylistApi(playlistId, songId);
      const p = playlists.find((x) => x.id === playlistId);
      if (p) p.songIds = updated.songIds;
      renderSidebar();
      renderPlaylistView();
    } catch (err) { showToast(err.message, true); }
  }

  // ================= ARTIST VIEW =================
  function openArtist(name) {
    currentArtistName = name;
    switchView('artist');
    renderArtistView();
  }
  function renderArtistView() {
    const artistSongs = songs.filter((s) => s.artist === currentArtistName);
    artistName.textContent = currentArtistName;
    artistCount.textContent = artistSongs.length + (artistSongs.length === 1 ? ' song' : ' songs');
    const withCover = artistSongs.find((s) => s.coverUrl);
    artistCover.innerHTML = withCover ? `<img src="${withCover.coverUrl}">` : '🎤';
    renderTrackTable(artistTable, artistSongs, { emptyText: 'No songs by this artist.' });
  }
  document.getElementById('artistPlayBtn').addEventListener('click', () => {
    const artistSongs = songs.filter((s) => s.artist === currentArtistName);
    if (artistSongs.length) playContext(artistSongs, 0);
  });

  // ================= LIKES =================
  async function toggleLike(songId) {
    const isLiked = likedIds.includes(songId);
    try {
      if (isLiked) { likedIds = await unlikeSongApi(songId); }
      else { likedIds = await likeSongApi(songId); }
      likeBtn.classList.toggle('liked', likedIds.includes(currentSong() ? currentSong().id : null));
      if (currentView === 'liked') renderLiked();
      else refreshVisibleTrackTables();
    } catch (err) { showToast(err.message, true); }
  }
  function refreshVisibleTrackTables() {
    if (currentView === 'search' && searchResults.style.display !== 'none') runSearch(searchInput.value.trim());
    if (currentView === 'playlist') renderPlaylistView();
    if (currentView === 'artist') renderArtistView();
  }

  // ================= ADD TO PLAYLIST POPUP =================
  const addToPlaylistOverlay = document.getElementById('addToPlaylistOverlay');
  function openAddToPlaylist(songId) {
    addToPlaylistSongId = songId;
    renderAddToPlaylistList();
    addToPlaylistOverlay.classList.add('open');
  }
  function renderAddToPlaylistList() {
    const list = document.getElementById('addToPlaylistList');
    list.innerHTML = '';
    if (!playlists.length) {
      list.innerHTML = `<div class="table-empty">You don't have any playlists yet. Create one first.</div>`;
      return;
    }
    playlists.forEach((p) => {
      const inPlaylist = p.songIds.includes(addToPlaylistSongId);
      const row = document.createElement('div');
      row.className = 'track-row';
      row.innerHTML = `
        <div class="idx"></div>
        <div class="info">
          <div class="art"><div style="width:100%;height:100%;background:${gradientFor(p.id)};display:flex;align-items:center;justify-content:center;">🎵</div></div>
          <div class="text"><div class="track-title">${escapeHtml(p.name)}</div><div class="track-artist" style="pointer-events:none;">${p.songIds.length} songs</div></div>
        </div>
        <div class="duration"></div>
        <div class="row-actions">
          <button class="like-row-btn ${inPlaylist ? 'liked' : ''}" title="${inPlaylist ? 'Remove' : 'Add'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">${inPlaylist ? ICON_CHECK : ICON_PLUS}</svg>
          </button>
        </div>`;
      row.querySelector('.like-row-btn').addEventListener('click', () => {
        inPlaylist ? handleRemoveFromPlaylist(p.id, addToPlaylistSongId) : handleAddToPlaylist(p.id, addToPlaylistSongId);
      });
      list.appendChild(row);
    });
  }
  document.getElementById('closeAddToPlaylist').addEventListener('click', () => addToPlaylistOverlay.classList.remove('open'));
  addToPlaylistOverlay.addEventListener('click', (e) => { if (e.target === addToPlaylistOverlay) addToPlaylistOverlay.classList.remove('open'); });

  // ================= CREATE PLAYLIST =================
  const playlistModalOverlay = document.getElementById('playlistModalOverlay');
  const playlistNameInput = document.getElementById('playlistNameInput');
  const playlistDescInput = document.getElementById('playlistDescInput');
  const confirmPlaylist = document.getElementById('confirmPlaylist');

  document.getElementById('createPlaylistBtn').addEventListener('click', () => playlistModalOverlay.classList.add('open'));
  document.getElementById('cancelPlaylist').addEventListener('click', closePlaylistModal);
  playlistModalOverlay.addEventListener('click', (e) => { if (e.target === playlistModalOverlay) closePlaylistModal(); });
  function closePlaylistModal() {
    playlistModalOverlay.classList.remove('open');
    playlistNameInput.value = ''; playlistDescInput.value = ''; confirmPlaylist.disabled = true;
  }
  playlistNameInput.addEventListener('input', () => { confirmPlaylist.disabled = !playlistNameInput.value.trim(); });
  confirmPlaylist.addEventListener('click', async () => {
    if (!playlistNameInput.value.trim()) return;
    try {
      const p = await createPlaylistApi(playlistNameInput.value.trim(), playlistDescInput.value.trim());
      playlists.unshift(p);
      renderSidebar();
      closePlaylistModal();
      showToast(`Created "${p.name}"`);
      openPlaylist(p.id);
    } catch (err) { showToast(err.message, true); }
  });

  // ================= DELETE SONG =================
  async function handleDeleteSong(id) {
    try {
      await deleteSongApi(id);
      const wasCurrent = currentSong() && currentSong().id === id;
      songs = songs.filter((s) => s.id !== id);
      playlists.forEach((p) => { p.songIds = p.songIds.filter((sid) => sid !== id); });
      likedIds = likedIds.filter((sid) => sid !== id);
      recentIds = recentIds.filter((sid) => sid !== id);
      if (wasCurrent) {
        audioEl.pause(); audioEl.src = ''; isPlaying = false;
        queue = []; currentIndex = -1;
        updateNowPlaying(); updatePlayUI();
      }
      renderSidebar();
      if (currentView === 'home') renderHome();
      if (currentView === 'playlist') renderPlaylistView();
      if (currentView === 'liked') renderLiked();
      if (currentView === 'artist') renderArtistView();
      renderQueuePanel();
      showToast('Song deleted');
    } catch (err) { showToast(err.message, true); }
  }

  // ================= PLAYBACK =================
  function currentSong() { return queue[currentIndex] || null; }

  function playContext(list, startIdx) {
    if (!list.length) return;
    queue = list.slice();
    currentIndex = startIdx;
    const song = queue[currentIndex];
    audioEl.src = song.audioUrl;
    audioEl.play().then(() => { isPlaying = true; updatePlayUI(); }).catch(() => showToast('Could not play this file.', true));
    updateNowPlaying();
    markRecentApi(song.id).then((r) => { recentIds = r; }).catch(() => {});
    refreshAllViews();
  }

  function togglePlay() {
    if (currentIndex === -1) {
      if (songs.length) playContext(songs, 0);
      return;
    }
    if (isPlaying) { audioEl.pause(); isPlaying = false; }
    else { audioEl.play(); isPlaying = true; }
    updatePlayUI();
    refreshAllViews();
  }

  function updatePlayUI() {
    playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor">${isPlaying ? ICON_PAUSE : ICON_PLAY}</svg>`;
  }

  function updateNowPlaying() {
    const song = currentSong();
    if (!song) {
      npTitle.textContent = 'No song playing';
      npArtist.textContent = 'Add a song to get started';
      npArt.innerHTML = '🎵';
      npArt.style.background = 'linear-gradient(135deg,#1db954,#191414)';
      likeBtn.classList.remove('liked');
      return;
    }
    npTitle.textContent = song.title;
    npArtist.textContent = song.artist;
    if (song.coverUrl) { npArt.innerHTML = `<img src="${song.coverUrl}">`; npArt.style.background = 'none'; }
    else { npArt.innerHTML = '🎵'; npArt.style.background = gradientFor(song.id); }
    likeBtn.classList.toggle('liked', likedIds.includes(song.id));
    renderQueuePanel();
  }

  function refreshAllViews() {
    renderSidebar();
    if (currentView === 'home') renderHome();
    if (currentView === 'playlist') renderPlaylistView();
    if (currentView === 'liked') renderLiked();
    if (currentView === 'artist') renderArtistView();
    if (currentView === 'search' && searchResults.style.display !== 'none') runSearch(searchInput.value.trim());
    renderQueuePanel();
  }

  function playNext(auto) {
    if (!queue.length) return;
    if (repeatMode === 2 && auto) { audioEl.currentTime = 0; audioEl.play(); return; }
    let nextIdx;
    if (isShuffle) nextIdx = Math.floor(Math.random() * queue.length);
    else {
      nextIdx = currentIndex + 1;
      if (nextIdx >= queue.length) {
        if (repeatMode === 1) nextIdx = 0;
        else { isPlaying = false; updatePlayUI(); refreshAllViews(); return; }
      }
    }
    playContext(queue, nextIdx);
  }
  function playPrev() {
    if (!queue.length) return;
    if (audioEl.currentTime > 3) { audioEl.currentTime = 0; return; }
    let prevIdx = currentIndex - 1;
    if (prevIdx < 0) prevIdx = isShuffle ? Math.floor(Math.random() * queue.length) : queue.length - 1;
    playContext(queue, prevIdx);
  }

  audioEl.addEventListener('ended', () => playNext(true));
  audioEl.addEventListener('timeupdate', () => {
    if (!audioEl.duration) return;
    const pct = (audioEl.currentTime / audioEl.duration) * 100;
    seekFill.style.width = pct + '%'; seekThumb.style.left = pct + '%';
    curTime.textContent = formatTime(audioEl.currentTime);
    durTime.textContent = formatTime(audioEl.duration);
  });
  audioEl.addEventListener('loadedmetadata', () => { durTime.textContent = formatTime(audioEl.duration); });

  playBtn.addEventListener('click', togglePlay);
  document.getElementById('nextBtn').addEventListener('click', () => playNext(false));
  document.getElementById('prevBtn').addEventListener('click', playPrev);
  shuffleBtn.addEventListener('click', () => { isShuffle = !isShuffle; shuffleBtn.classList.toggle('shuffle-active', isShuffle); showToast(isShuffle ? 'Shuffle on' : 'Shuffle off'); });
  repeatBtn.addEventListener('click', () => {
    repeatMode = (repeatMode + 1) % 3;
    repeatBtn.classList.toggle('repeat-active', repeatMode !== 0);
    showToast(repeatMode === 0 ? 'Repeat off' : repeatMode === 1 ? 'Repeat all' : 'Repeat one');
  });
  likeBtn.addEventListener('click', () => { const s = currentSong(); if (s) toggleLike(s.id); });
  muteBtn.addEventListener('click', () => { audioEl.muted = !audioEl.muted; volFill.style.width = audioEl.muted ? '0%' : audioEl.volume * 100 + '%'; });

  let seeking = false;
  function seekTo(clientX) {
    const rect = seekBar.getBoundingClientRect();
    let pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    if (audioEl.duration) { audioEl.currentTime = pct * audioEl.duration; seekFill.style.width = pct * 100 + '%'; seekThumb.style.left = pct * 100 + '%'; }
  }
  seekBar.addEventListener('mousedown', (e) => { seeking = true; seekTo(e.clientX); });
  window.addEventListener('mousemove', (e) => { if (seeking) seekTo(e.clientX); });
  window.addEventListener('mouseup', () => { seeking = false; });

  let volSeeking = false;
  function volTo(clientX) {
    const rect = volBar.getBoundingClientRect();
    let pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audioEl.volume = pct; audioEl.muted = false; volFill.style.width = pct * 100 + '%';
  }
  volBar.addEventListener('mousedown', (e) => { volSeeking = true; volTo(e.clientX); });
  window.addEventListener('mousemove', (e) => { if (volSeeking) volTo(e.clientX); });
  window.addEventListener('mouseup', () => { volSeeking = false; });
  audioEl.volume = 0.7; volFill.style.width = '70%';

  // ================= QUEUE PANEL =================
  queueBtn.addEventListener('click', () => {
    appEl.classList.toggle('queue-open');
    queueBtn.classList.toggle('queue-active', appEl.classList.contains('queue-open'));
    renderQueuePanel();
  });
  document.getElementById('closeQueueBtn').addEventListener('click', () => { appEl.classList.remove('queue-open'); queueBtn.classList.remove('queue-active'); });

  function renderQueuePanel() {
    if (!appEl.classList.contains('queue-open')) return;
    queueNowPlaying.innerHTML = '';
    const song = currentSong();
    if (song) {
      queueNowPlaying.appendChild(buildQueueItem(song, currentIndex, true));
    } else {
      queueNowPlaying.innerHTML = `<div class="queue-empty">Nothing playing.</div>`;
    }
    queueNext.innerHTML = '';
    const upcoming = queue.slice(currentIndex + 1);
    if (!upcoming.length) {
      queueNext.innerHTML = `<div class="queue-empty">No songs queued next.</div>`;
    } else {
      upcoming.forEach((s, i) => queueNext.appendChild(buildQueueItem(s, currentIndex + 1 + i, false)));
    }
  }
  function buildQueueItem(song, idx, isCurrent) {
    const el = document.createElement('div');
    el.className = 'queue-item' + (isCurrent ? ' current' : '');
    el.innerHTML = `
      <div class="art">${song.coverUrl ? `<img src="${song.coverUrl}">` : `<div style="width:100%;height:100%;background:${gradientFor(song.id)};display:flex;align-items:center;justify-content:center;">🎵</div>`}</div>
      <div class="qi-meta"><div class="qi-title">${escapeHtml(song.title)}</div><div class="qi-artist">${escapeHtml(song.artist)}</div></div>`;
    el.addEventListener('click', () => playContext(queue, idx));
    return el;
  }

  // ================= ADD SONG MODAL =================
  const modalOverlay = document.getElementById('modalOverlay');
  const fileInput = document.getElementById('fileInput');
  const fileDrop = document.getElementById('fileDrop');
  const coverInput = document.getElementById('coverInput');
  const coverDrop = document.getElementById('coverDrop');
  const titleInput = document.getElementById('titleInput');
  const artistInput = document.getElementById('artistInput');
  const albumInput = document.getElementById('albumInput');
  const languageInput = document.getElementById('languageInput');
  const confirmAdd = document.getElementById('confirmAdd');
  let pendingFile = null, pendingCover = null;

  function openAddModal() { modalOverlay.classList.add('open'); }
  function closeAddModal() {
    modalOverlay.classList.remove('open');
    pendingFile = null; pendingCover = null;
    fileInput.value = ''; coverInput.value = ''; titleInput.value = ''; artistInput.value = ''; albumInput.value = ''; languageInput.value = '';
    fileDrop.textContent = 'Click to choose an audio file (mp3, wav, m4a...)'; fileDrop.classList.remove('has-file');
    coverDrop.textContent = 'Click to choose a cover image'; coverDrop.classList.remove('has-file');
    confirmAdd.disabled = true; confirmAdd.textContent = 'Add song';
  }
  document.getElementById('openAddModal').addEventListener('click', openAddModal);
  document.getElementById('topAddBtn').addEventListener('click', openAddModal);
  document.getElementById('cancelAdd').addEventListener('click', closeAddModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeAddModal(); });
  fileDrop.addEventListener('click', () => fileInput.click());
  coverDrop.addEventListener('click', () => coverInput.click());
  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0]; if (!f) return;
    pendingFile = f; fileDrop.textContent = f.name; fileDrop.classList.add('has-file');
    if (!titleInput.value) titleInput.value = f.name.replace(/\.[^/.]+$/, '');
    checkFormValid();
  });
  coverInput.addEventListener('change', () => {
    const f = coverInput.files[0]; if (!f) return;
    pendingCover = f; coverDrop.textContent = f.name; coverDrop.classList.add('has-file');
  });
  titleInput.addEventListener('input', checkFormValid);
  function checkFormValid() { confirmAdd.disabled = !(pendingFile && titleInput.value.trim()); }

  confirmAdd.addEventListener('click', async () => {
    if (!pendingFile || !titleInput.value.trim()) return;
    const fd = new FormData();
    fd.append('title', titleInput.value.trim());
    fd.append('artist', artistInput.value.trim());
    fd.append('album', albumInput.value.trim());
    fd.append('language', languageInput.value);
    fd.append('audio', pendingFile);
    if (pendingCover) fd.append('cover', pendingCover);
    confirmAdd.disabled = true; confirmAdd.textContent = 'Uploading…';
    try {
      const song = await postSong(fd);
      songs.unshift(song);
      showToast(`Added "${song.title}" to Your Library`);
      closeAddModal();
      renderSidebar();
      if (currentView === 'home') renderHome();
    } catch (err) {
      showToast(err.message, true);
      confirmAdd.disabled = false; confirmAdd.textContent = 'Add song';
    }
  });

  // ================= Topbar scroll effect =================
  const mainScroll = document.getElementById('mainScroll');
  const topbar = document.getElementById('topbar');
  mainScroll.addEventListener('scroll', () => topbar.classList.toggle('scrolled', mainScroll.scrollTop > 20));

  // ================= Greeting =================
  (function setGreeting() {
    const h = new Date().getHours();
    document.getElementById('greeting').textContent = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  })();

  // ================= Keyboard shortcut =================
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT' && !document.activeElement.isContentEditable) {
      e.preventDefault(); togglePlay();
    }
  });

  bootstrap();
})();
