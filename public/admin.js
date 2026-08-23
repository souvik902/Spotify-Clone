(() => {
  const $ = (selector) => document.querySelector(selector);
  const loginPanel = $('#loginPanel');
  const adminPanel = $('#adminPanel');
  const notice = $('#notice');
  const songForm = $('#songForm');
  let editingId = null;

  async function request(path, options = {}) {
    const response = await fetch('/api' + path, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Request failed.');
    return body;
  }
  function message(text, error = false) { notice.textContent = text; notice.style.color = error ? '#ff9aaa' : '#80e9a5'; }
  function showAdmin() { loginPanel.hidden = true; adminPanel.hidden = false; $('#logout').hidden = false; }
  function resetSongForm() {
    editingId = null; songForm.reset(); $('#songFormTitle').textContent = 'Add song'; $('#saveSong').textContent = 'Add song';
    $('#audioLabel').hidden = false; $('#coverLabel').hidden = false; songForm.audio.required = true; $('#cancelEdit').hidden = true;
  }
  function inputValue(form, name) { return form.elements[name].value.trim(); }
  async function loadSettings() {
    const settings = await request('/settings');
    const form = $('#settingsForm');
    form.siteTitle.value = settings.siteTitle || '';
    form.homeHeading.value = settings.homeHeading || '';
    form.accentColor.value = settings.accentColor || '#1db954';
  }
  function renderSongs(songs) {
    $('#catalogStatus').textContent = `${songs.length} song${songs.length === 1 ? '' : 's'}`;
    $('#songs').replaceChildren(...songs.map((song) => {
      const row = document.createElement('article'); row.className = 'song';
      const art = song.coverUrl ? Object.assign(document.createElement('img'), { src: song.coverUrl, alt: '' }) : Object.assign(document.createElement('div'), { className: 'art', textContent: '♫' });
      const meta = document.createElement('div'); meta.className = 'meta';
      const title = document.createElement('strong'); title.textContent = song.title;
      const byline = document.createElement('span'); byline.textContent = [song.artist, song.album, song.genre, song.language].filter(Boolean).join(' · ') || 'Unknown artist'; meta.append(title, byline);
      const actions = document.createElement('div'); actions.className = 'actions';
      const edit = document.createElement('button'); edit.textContent = 'Edit'; edit.type = 'button'; edit.onclick = () => editSong(song);
      const remove = document.createElement('button'); remove.textContent = 'Delete'; remove.type = 'button'; remove.className = 'danger'; remove.onclick = () => deleteSong(song);
      actions.append(edit, remove); row.append(art, meta, actions); return row;
    }));
  }
  async function loadSongs() { renderSongs(await request('/songs')); }
  function editSong(song) {
    editingId = song.id; const form = songForm;
    ['title', 'artist', 'album', 'genre', 'language'].forEach((field) => { form.elements[field].value = song[field] || ''; });
    $('#songFormTitle').textContent = `Edit: ${song.title}`; $('#saveSong').textContent = 'Save changes'; $('#audioLabel').hidden = true; $('#coverLabel').hidden = true; form.audio.required = false; $('#cancelEdit').hidden = false; window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function deleteSong(song) {
    if (!confirm(`Delete “${song.title}”? This also removes it from playlists, likes, and recently played.`)) return;
    try { await request('/songs/' + encodeURIComponent(song.id), { method: 'DELETE' }); message('Song deleted.'); await loadSongs(); } catch (error) { message(error.message, true); }
  }
  $('#loginForm').addEventListener('submit', async (event) => {
    event.preventDefault(); $('#loginError').textContent = '';
    try { await request('/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#password').value }) }); $('#password').value = ''; showAdmin(); await Promise.all([loadSettings(), loadSongs()]); }
    catch (error) { $('#loginError').textContent = error.message; }
  });
  $('#logout').addEventListener('click', async () => { await request('/admin/logout', { method: 'POST' }); location.reload(); });
  $('#settingsForm').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget;
    try { await request('/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteTitle: inputValue(form, 'siteTitle'), homeHeading: inputValue(form, 'homeHeading'), accentColor: form.accentColor.value }) }); message('Settings saved.'); } catch (error) { message(error.message, true); }
  });
  songForm.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget;
    try {
      if (editingId) await request('/songs/' + encodeURIComponent(editingId), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(['title', 'artist', 'album', 'genre', 'language'].map((field) => [field, inputValue(form, field)]))) });
      else await request('/songs', { method: 'POST', body: new FormData(form) });
      message(editingId ? 'Song updated.' : 'Song added.'); resetSongForm(); await loadSongs();
    } catch (error) { message(error.message, true); }
  });
  $('#cancelEdit').addEventListener('click', resetSongForm);
  request('/admin/session').then(async ({ authenticated }) => { if (authenticated) { showAdmin(); await Promise.all([loadSettings(), loadSongs()]); } }).catch(() => {});
})();
