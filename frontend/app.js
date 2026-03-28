// MusicGateAway — Vanilla JS frontend

const $ = (sel) => document.querySelector(sel);
const audio = $("#audioEl");
const content = $("#content");
const searchInput = $("#searchInput");
const npBar = $("#nowPlaying");
const npTitle = $("#npTitle");
const npArtist = $("#npArtist");
const npArt = $("#npArt");
const npPlayPause = $("#npPlayPause");
const npPrev = $("#npPrev");
const npNext = $("#npNext");
const npSeek = $("#npSeek");
const npTime = $("#npTime");
const npDuration = $("#npDuration");

const formatSelect = $("#formatSelect");
const searchType = $("#searchType");

let queue = [];
let queueIndex = -1;
let navStack = [];

// Restore saved format preference
const savedFormat = localStorage.getItem("audioFormat");
if (savedFormat) formatSelect.value = savedFormat;
formatSelect.addEventListener("change", () => {
  localStorage.setItem("audioFormat", formatSelect.value);
});

// Download destination
const downloadDestInput = $("#downloadDest");
const savedDest = localStorage.getItem("downloadDest");
if (savedDest) downloadDestInput.value = savedDest;
downloadDestInput.addEventListener("change", () => {
  localStorage.setItem("downloadDest", downloadDestInput.value.trim());
});

// Folder picker
const folderModal = $("#folderModal");
const folderPath = $("#folderPath");
const folderList = $("#folderList");
const folderUp = $("#folderUp");
const folderSelect = $("#folderSelect");
const folderCancel = $("#folderCancel");
const folderModalClose = $("#folderModalClose");
const folderNewDir = $("#folderNewDir");
const browseDest = $("#browseDest");

async function loadFolder(path) {
  folderList.innerHTML = `<div class="folder-empty">Loading...</div>`;
  try {
    const url = path ? `/browse?path=${encodeURIComponent(path)}` : "/browse";
    const res = await api(url);
    folderPath.value = res.current;
    folderUp.disabled = !res.parent;
    folderUp.dataset.parent = res.parent || "";
    if (res.dirs.length === 0) {
      folderList.innerHTML = `<div class="folder-empty">No subfolders</div>`;
    } else {
      folderList.innerHTML = res.dirs.map(d =>
        `<div class="folder-item" data-dir="${esc(d)}"><span class="folder-icon">&#128193;</span><span class="folder-name">${esc(d)}</span></div>`
      ).join("");
    }
  } catch (e) {
    folderList.innerHTML = `<div class="folder-empty">Error: ${esc(e.message)}</div>`;
  }
}

browseDest.addEventListener("click", () => {
  folderModal.style.display = "flex";
  const current = downloadDestInput.value.trim();
  loadFolder(current || null);
});

folderList.addEventListener("click", (e) => {
  const item = e.target.closest(".folder-item");
  if (!item) return;
  const dir = item.dataset.dir;
  const current = folderPath.value;
  const sep = current.endsWith("/") ? "" : "/";
  loadFolder(current + sep + dir);
});

folderUp.addEventListener("click", () => {
  const parent = folderUp.dataset.parent;
  if (parent) loadFolder(parent);
});

folderSelect.addEventListener("click", () => {
  downloadDestInput.value = folderPath.value;
  localStorage.setItem("downloadDest", folderPath.value);
  folderModal.style.display = "none";
});

folderCancel.addEventListener("click", () => { folderModal.style.display = "none"; });
folderModalClose.addEventListener("click", () => { folderModal.style.display = "none"; });
folderModal.addEventListener("click", (e) => {
  if (e.target === folderModal) folderModal.style.display = "none";
});

folderNewDir.addEventListener("click", async () => {
  const name = prompt("New folder name:");
  if (!name || !name.trim()) return;
  const current = folderPath.value;
  const sep = current.endsWith("/") ? "" : "/";
  const newPath = current + sep + name.trim();
  try {
    await fetch(`/browse?path=${encodeURIComponent(newPath)}`);
  } catch {}
  // Even if browse fails (dir doesn't exist yet), set it as destination
  // The download endpoint will create it
  downloadDestInput.value = newPath;
  localStorage.setItem("downloadDest", newPath);
  folderModal.style.display = "none";
});

function getQuality() {
  return formatSelect.value || "LOSSLESS";
}

function getFileExt() {
  return getQuality() === "LOSSLESS" ? "flac" : "m4a";
}

function coverUrl(coverId, size) {
  if (!coverId) return null;
  const path = coverId.replace(/-/g, "/");
  return `https://resources.tidal.com/images/${path}/${size}x${size}.jpg`;
}

function formatDuration(secs) {
  if (!secs) return "--:--";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function api(path) {
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

// --- Search ---

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const q = searchInput.value.trim();
    if (!q) return;
    doSearch(q);
  }
});

async function doSearch(query) {
  content.innerHTML = `<div class="loading-bar">Searching...</div>`;
  navStack = [];
  try {
    const res = await api(`/search/?s=${encodeURIComponent(query)}&limit=25&offset=0`);
    renderSearchResults(res);
  } catch (e) {
    content.innerHTML = `<div class="empty-state">Search failed: ${e.message}</div>`;
  }
}

function renderSearchResults(res) {
  const mode = searchType.value;
  const hasTracks = res.tracks && res.tracks.length > 0;
  const hasAlbums = res.albums && res.albums.length > 0;
  const hasArtists = res.artists && res.artists.length > 0;

  if (mode === "tracks") {
    if (!hasTracks) { content.innerHTML = `<div class="empty-state">No tracks found</div>`; return; }
    let html = `<div class="section"><h3>Tracks</h3>${trackToolbar()}<div class="track-list">`;
    for (const t of res.tracks) html += trackRow(t);
    html += `</div></div>`;
    content.innerHTML = html;
    bindTrackActions();
    return;
  }

  if (mode === "albums") {
    if (!hasAlbums) { content.innerHTML = `<div class="empty-state">No albums found</div>`; return; }
    let html = `<div class="section"><h3>Albums</h3><div class="card-grid">`;
    for (const a of res.albums) html += albumCard(a);
    html += `</div></div>`;
    content.innerHTML = html;
    return;
  }

  if (mode === "artists") {
    if (!hasArtists) { content.innerHTML = `<div class="empty-state">No artists found</div>`; return; }
    let html = `<div class="section"><h3>Artists</h3><div class="card-grid">`;
    for (const a of res.artists) html += artistCard(a);
    html += `</div></div>`;
    content.innerHTML = html;
    return;
  }

  // "all" mode
  if (!hasTracks && !hasAlbums && !hasArtists) {
    content.innerHTML = `<div class="empty-state">No results found</div>`;
    return;
  }

  let html = `<div class="search-columns">`;

  html += `<div class="search-col"><h3>Tracks</h3>`;
  if (hasTracks) {
    html += trackToolbar();
    html += `<div class="track-list">`;
    for (const t of res.tracks) html += trackRow(t);
    html += `</div>`;
  } else {
    html += `<div class="col-empty">No tracks</div>`;
  }
  html += `</div>`;

  html += `<div class="search-col"><h3>Albums</h3>`;
  if (hasAlbums) {
    html += `<div class="card-grid">`;
    for (const a of res.albums) html += albumCard(a);
    html += `</div>`;
  } else {
    html += `<div class="col-empty">No albums</div>`;
  }
  html += `</div>`;

  html += `<div class="search-col"><h3>Artists</h3>`;
  if (hasArtists) {
    html += `<div class="card-grid">`;
    for (const a of res.artists) html += artistCard(a);
    html += `</div>`;
  } else {
    html += `<div class="col-empty">No artists</div>`;
  }
  html += `</div>`;

  html += `</div>`;
  content.innerHTML = html;
  bindTrackActions();
}

function trackToolbar() {
  return `<div class="track-toolbar">
    <button class="btn btn-sel-action" data-tb-all>All</button>
    <button class="btn btn-sel-action" data-tb-none>None</button>
    <span class="sel-count" data-tb-count>0 selected</span>
    <div class="sel-spacer"></div>
    <button class="btn btn-sel-action" data-tb-play disabled>&#9654; Play Tracks</button>
    <button class="btn btn-sel-action" data-tb-enqueue disabled>+ Queue</button>
    <button class="btn btn-sel-action" data-tb-download disabled>&#8681; Download Tracks</button>
  </div>`;
}

function trackRow(t, showArt = true) {
  const art = coverUrl(t.cover_id, 80);
  const artHtml = showArt
    ? `<div class="track-art">${art ? `<img src="${art}" alt="">` : `<div class="art-placeholder"></div>`}</div>`
    : `<span class="track-num">${t.track_number || ""}</span>`;
  return `
    <div class="track-row" data-id="${t.tidal_id}" data-track="${btoa(JSON.stringify(t))}">
      <input type="checkbox" class="track-check" data-check-id="${t.tidal_id}">
      ${artHtml}
      <div class="track-info">
        <span class="track-title">${esc(t.title)}</span>
        <span class="track-meta">
          ${t.artist_name ? `<span class="link" data-artist-id="${t.artist_id || ""}">${esc(t.artist_name)}</span>` : ""}
          ${t.album_title ? ` &mdash; <span class="link" data-album-id="${t.album_id || ""}">${esc(t.album_title)}</span>` : ""}
        </span>
      </div>
      <span class="track-duration">${formatDuration(t.duration_secs)}</span>
      <button class="btn btn-play" data-action="play" title="Play">&#9654;</button>
      <button class="btn btn-enqueue" data-action="enqueue" title="Add to queue">+</button>
      <button class="btn btn-download" data-action="download" title="Download">&#8681;</button>
    </div>`;
}

function albumCard(a) {
  const art = coverUrl(a.cover_id, 320);
  return `
    <div class="card" data-album-nav="${a.tidal_id}">
      <div class="card-art">${art ? `<img src="${art}" alt="">` : `<div class="art-placeholder"></div>`}</div>
      <div class="card-title">${esc(a.title)}</div>
      <div class="card-sub">${esc(a.artist_name || "")}${a.year ? ` &bull; ${a.year}` : ""}</div>
    </div>`;
}

function artistCard(a) {
  const art = coverUrl(a.picture_id, 320);
  return `
    <div class="card" data-artist-nav="${a.tidal_id}">
      <div class="card-art card-art-round">${art ? `<img src="${art}" alt="">` : `<div class="art-placeholder"></div>`}</div>
      <div class="card-title">${esc(a.name)}</div>
    </div>`;
}

function esc(s) {
  if (!s) return "";
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// --- Navigation ---

content.addEventListener("click", (e) => {
  // Checkboxes handle themselves
  if (e.target.classList.contains("track-check")) return;

  // Album navigation
  const albumEl = e.target.closest("[data-album-nav]");
  if (albumEl) { loadAlbum(albumEl.dataset.albumNav); return; }

  const albumLink = e.target.closest("[data-album-id]");
  if (albumLink && albumLink.dataset.albumId) { loadAlbum(albumLink.dataset.albumId); return; }

  // Artist navigation
  const artistEl = e.target.closest("[data-artist-nav]");
  if (artistEl) { loadArtist(artistEl.dataset.artistNav); return; }

  const artistLink = e.target.closest("[data-artist-id]");
  if (artistLink && artistLink.dataset.artistId) { loadArtist(artistLink.dataset.artistId); return; }

  // Track actions
  const btn = e.target.closest("[data-action]");
  if (btn) {
    const row = btn.closest(".track-row");
    const track = JSON.parse(atob(row.dataset.track));
    if (btn.dataset.action === "play") playTrack(track);
    else if (btn.dataset.action === "enqueue") enqueueTrack(track);
    else if (btn.dataset.action === "download") downloadTrack(track);
    return;
  }

  // Back button
  if (e.target.closest(".back-btn")) { goBack(); return; }

  // Play album
  const playAlbumBtn = e.target.closest("[data-action-play-album]");
  if (playAlbumBtn) {
    const checked = getCheckedTracks();
    const tracks = checked.length > 0 ? checked : Array.from(content.querySelectorAll(".track-row")).map(r => JSON.parse(atob(r.dataset.track)));
    if (tracks.length > 0) {
      queue = tracks;
      queueIndex = 0;
      startPlayback(tracks[0]);
      renderPlaylist();
    }
    return;
  }

  // Download album
  const dlAlbumBtn = e.target.closest("[data-action-dl-album]");
  if (dlAlbumBtn) {
    const checked = getCheckedTracks();
    const tracks = checked.length > 0 ? checked : Array.from(content.querySelectorAll(".track-row")).map(r => JSON.parse(atob(r.dataset.track)));
    if (tracks.length === 0) return;
    dlAlbumBtn.disabled = true;
    dlAlbumBtn.textContent = "Downloading...";
    (async () => {
      for (let i = 0; i < tracks.length; i++) {
        try {
          await downloadTrackWithProgress(tracks[i], i + 1, tracks.length);
        } catch (e) {
          console.error(`Download failed for ${tracks[i].title}:`, e);
        }
      }
      dlProgress.style.display = "none";
      dlAlbumBtn.disabled = false;
      dlAlbumBtn.innerHTML = "&#8681; Download Album";
    })();
    return;
  }
});

function bindTrackActions() {
  updateTrackToolbar();
}

async function loadAlbum(albumId) {
  navStack.push(content.innerHTML);
  content.innerHTML = `<div class="loading-bar">Loading album...</div>`;
  try {
    const album = await api(`/albums/${albumId}`);
    renderAlbumDetail(album);
  } catch (e) {
    content.innerHTML = `<div class="empty-state">Failed to load album: ${e.message}</div>`;
  }
}

async function loadArtist(artistId) {
  navStack.push(content.innerHTML);
  content.innerHTML = `<div class="loading-bar">Loading artist...</div>`;
  try {
    const artist = await api(`/artists/${artistId}`);
    renderArtistDetail(artist);
  } catch (e) {
    content.innerHTML = `<div class="empty-state">Failed to load artist: ${e.message}</div>`;
  }
}

function goBack() {
  if (navStack.length > 0) {
    content.innerHTML = navStack.pop();
  }
}

function renderAlbumDetail(album) {
  const art = coverUrl(album.cover_id, 640);
  let html = `
    <div class="detail">
      <button class="back-btn">&larr; Back</button>
      <div class="detail-header">
        <div class="detail-art">${art ? `<img src="${art}" alt="">` : `<div class="art-placeholder art-placeholder-lg"></div>`}</div>
        <div class="detail-info">
          <h2>${esc(album.title)}</h2>
          ${album.artist_name ? `<p class="detail-sub">${esc(album.artist_name)}</p>` : ""}
          ${album.year ? `<p class="detail-sub">${album.year}</p>` : ""}
          <button class="btn btn-play-all" data-action-play-album>&#9654; Play Album</button>
          <button class="btn btn-play-all" data-action-dl-album>&#8681; Download Album</button>
        </div>
      </div>
      ${trackToolbar()}
      <div class="track-list">`;

  for (const t of (album.tracks || [])) {
    html += trackRow(t, false);
  }

  html += `</div></div>`;
  content.innerHTML = html;
  updateTrackToolbar();
}

function renderArtistDetail(artist) {
  const art = coverUrl(artist.picture_id, 640);
  let html = `
    <div class="detail">
      <button class="back-btn">&larr; Back</button>
      <div class="detail-header">
        <div class="detail-art detail-art-round">${art ? `<img src="${art}" alt="">` : `<div class="art-placeholder art-placeholder-lg"></div>`}</div>
        <div class="detail-info">
          <h2>${esc(artist.name)}</h2>
          <p class="detail-sub">${(artist.albums || []).length} albums</p>
        </div>
      </div>
      <h3>Discography</h3>
      <div class="card-grid">`;

  for (const a of (artist.albums || [])) {
    html += albumCard(a);
  }

  html += `</div></div>`;
  content.innerHTML = html;
  updateTrackToolbar();
}

// --- Selection / Track toolbar ---

function getCheckedTracks() {
  return Array.from(content.querySelectorAll(".track-check:checked")).map(cb => {
    const row = cb.closest(".track-row");
    return JSON.parse(atob(row.dataset.track));
  });
}

function updateTrackToolbar() {
  const all = content.querySelectorAll(".track-check");
  const checked = content.querySelectorAll(".track-check:checked");
  const hasSelection = checked.length > 0;
  content.querySelectorAll("[data-tb-count]").forEach(el => {
    el.textContent = `${checked.length} / ${all.length} selected`;
  });
  content.querySelectorAll("[data-tb-play]").forEach(el => el.disabled = !hasSelection);
  content.querySelectorAll("[data-tb-enqueue]").forEach(el => el.disabled = !hasSelection);
  content.querySelectorAll("[data-tb-download]").forEach(el => el.disabled = !hasSelection);
  // Update album detail buttons
  const playAlbumBtn = content.querySelector("[data-action-play-album]");
  const dlAlbumBtn = content.querySelector("[data-action-dl-album]");
  if (playAlbumBtn) playAlbumBtn.innerHTML = hasSelection ? "&#9654; Play Tracks" : "&#9654; Play Album";
  if (dlAlbumBtn) dlAlbumBtn.innerHTML = hasSelection ? "&#8681; Download Tracks" : "&#8681; Download Album";
}

content.addEventListener("change", (e) => {
  if (e.target.classList.contains("track-check")) {
    updateTrackToolbar();
  }
});

content.addEventListener("click", (e) => {
  const tb = e.target.closest("[data-tb-all]");
  if (tb) {
    content.querySelectorAll(".track-check").forEach(cb => cb.checked = true);
    updateTrackToolbar();
    return;
  }
  const tbNone = e.target.closest("[data-tb-none]");
  if (tbNone) {
    content.querySelectorAll(".track-check").forEach(cb => cb.checked = false);
    updateTrackToolbar();
    return;
  }
  const tbPlay = e.target.closest("[data-tb-play]");
  if (tbPlay) {
    const tracks = getCheckedTracks();
    if (tracks.length === 0) return;
    queue = tracks;
    queueIndex = 0;
    startPlayback(tracks[0]);
    renderPlaylist();
    return;
  }
  const tbEnqueue = e.target.closest("[data-tb-enqueue]");
  if (tbEnqueue) {
    const tracks = getCheckedTracks();
    if (tracks.length === 0) return;
    queue.push(...tracks);
    renderPlaylist();
    return;
  }
  const tbDl = e.target.closest("[data-tb-download]");
  if (tbDl) {
    const tracks = getCheckedTracks();
    if (tracks.length === 0) return;
    tbDl.disabled = true;
    tbDl.textContent = "Downloading...";
    (async () => {
      for (let i = 0; i < tracks.length; i++) {
        try {
          await downloadTrackWithProgress(tracks[i], i + 1, tracks.length);
        } catch (e) {
          console.error(`Download failed for ${tracks[i].title}:`, e);
        }
      }
      dlProgress.style.display = "none";
      tbDl.disabled = false;
      tbDl.innerHTML = "&#8681; Download Tracks";
    })();
    return;
  }
});

// --- Playlist panel ---

const playlistPanel = $("#playlistPanel");
const playlistList = $("#playlistList");
const npPlaylistBtn = $("#npPlaylist");
const plClose = $("#plClose");
const plClear = $("#plClear");
let playlistVisible = false;

function renderPlaylist() {
  // Auto-show when 2+ tracks, auto-hide when <= 1
  if (queue.length > 1 && !playlistVisible) {
    playlistVisible = true;
    playlistPanel.style.display = "flex";
    npPlaylistBtn.classList.add("active");
  }
  if (queue.length <= 1 && playlistVisible) {
    playlistVisible = false;
    playlistPanel.style.display = "none";
    npPlaylistBtn.classList.remove("active");
  }

  if (queue.length === 0) {
    playlistList.innerHTML = "";
    return;
  }

  playlistList.innerHTML = queue.map((t, i) => {
    const active = i === queueIndex ? " pl-active" : "";
    const art = coverUrl(t.cover_id, 80);
    const playing = i === queueIndex ? "&#9654; " : "";
    return `<div class="pl-item${active}" data-pl-idx="${i}">
      <span class="pl-item-num">${playing}${i + 1}</span>
      <div class="pl-item-art">${art ? `<img src="${art}" alt="">` : ""}</div>
      <div class="pl-item-info">
        <div class="pl-item-title">${esc(t.title)}</div>
        <div class="pl-item-artist">${esc(t.artist_name || "")}</div>
      </div>
      <span class="pl-item-dur">${formatDuration(t.duration_secs)}</span>
      <button class="pl-item-remove" data-pl-remove="${i}" title="Remove">&times;</button>
    </div>`;
  }).join("");

  // Scroll active into view
  const activeEl = playlistList.querySelector(".pl-active");
  if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
}

npPlaylistBtn.addEventListener("click", () => {
  playlistVisible = !playlistVisible;
  playlistPanel.style.display = playlistVisible ? "flex" : "none";
  npPlaylistBtn.classList.toggle("active", playlistVisible);
});

plClose.addEventListener("click", () => {
  playlistVisible = false;
  playlistPanel.style.display = "none";
  npPlaylistBtn.classList.remove("active");
});

plClear.addEventListener("click", () => {
  queue = [];
  queueIndex = -1;
  audio.pause();
  audio.src = "";
  npBar.style.display = "none";
  playlistVisible = false;
  playlistPanel.style.display = "none";
  npPlaylistBtn.classList.remove("active");
  renderPlaylist();
});

playlistList.addEventListener("click", (e) => {
  // Remove button
  const removeBtn = e.target.closest("[data-pl-remove]");
  if (removeBtn) {
    const idx = parseInt(removeBtn.dataset.plRemove);
    queue.splice(idx, 1);
    if (idx < queueIndex) queueIndex--;
    else if (idx === queueIndex) {
      if (queue.length === 0) {
        queueIndex = -1;
        audio.pause();
        audio.src = "";
        npBar.style.display = "none";
      } else {
        queueIndex = Math.min(queueIndex, queue.length - 1);
        startPlayback(queue[queueIndex]);
      }
    }
    renderPlaylist();
    return;
  }
  // Click to play
  const item = e.target.closest("[data-pl-idx]");
  if (item) {
    const idx = parseInt(item.dataset.plIdx);
    queueIndex = idx;
    startPlayback(queue[idx]);
  }
});

// --- Playback ---

function enqueueTrack(track) {
  queue.push(track);
  renderPlaylist();
}

// --- Download log ---

const dlLogToggle = $("#dlLogToggle");
const dlLogBadge = $("#dlLogBadge");
const dlLogPanel = $("#dlLogPanel");
const dlLogList = $("#dlLogList");
const dlLogClear = $("#dlLogClear");
const dlLogClose = $("#dlLogClose");
let downloadLog = [];

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function addLogEntry(entry) {
  downloadLog.unshift(entry);
  dlLogBadge.textContent = downloadLog.length;
  dlLogBadge.style.display = "";
  renderLog();
}

function renderLog() {
  if (downloadLog.length === 0) {
    dlLogList.innerHTML = `<div class="folder-empty">No downloads yet</div>`;
    return;
  }
  dlLogList.innerHTML = downloadLog.map(e => {
    const icon = e.ok ? `<span class="log-entry-icon ok">&#10003;</span>` : `<span class="log-entry-icon err">&#10007;</span>`;
    const detail = e.ok
      ? `<span>${formatBytes(e.bytes)}</span> &mdash; ${esc(e.path)}`
      : esc(e.error);
    return `<div class="log-entry">
      ${icon}
      <div class="log-entry-body">
        <div class="log-entry-name">${esc(e.filename)}</div>
        <div class="log-entry-detail">${detail}</div>
      </div>
      <span class="log-entry-time">${e.time}</span>
    </div>`;
  }).join("");
}

dlLogToggle.addEventListener("click", () => {
  dlLogPanel.style.display = dlLogPanel.style.display === "none" ? "flex" : "none";
});

dlLogClose.addEventListener("click", () => { dlLogPanel.style.display = "none"; });

dlLogClear.addEventListener("click", () => {
  downloadLog = [];
  dlLogBadge.style.display = "none";
  renderLog();
});

// --- Download progress ---

const dlProgress = $("#downloadProgress");
const dlStep = $("#dlStep");
const dlTrack = $("#dlTrack");
const dlBar = $("#dlBar");
const dlPercent = $("#dlPercent");
const dlStage = $("#dlStage");

function downloadTrackWithProgress(track, step, total) {
  return new Promise((resolve, reject) => {
    const dest = downloadDestInput.value.trim() || "/tmp/mga-downloads";
    const url = `/tracks/${track.tidal_id}/download?dest=${encodeURIComponent(dest)}&quality=${getQuality()}&progress=true`;

    dlProgress.style.display = "flex";
    dlStep.textContent = total > 1 ? `${step}/${total}` : "";
    dlTrack.textContent = `${track.artist_name || "Unknown"} - ${track.title}`;
    dlBar.style.width = "0%";
    dlPercent.textContent = "0%";
    dlStage.textContent = "";

    const es = new EventSource(url);

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.stage === "downloading") {
        dlBar.style.width = data.percent + "%";
        dlPercent.textContent = data.percent + "%";
        dlStage.textContent = "";
      } else if (data.stage === "tagging") {
        dlBar.style.width = "100%";
        dlPercent.textContent = "100%";
        dlStage.textContent = "Tagging...";
      } else if (data.stage === "info") {
        dlStage.textContent = data.message || "";
      } else if (data.stage === "done") {
        es.close();
        const now = new Date();
        addLogEntry({
          ok: true,
          filename: data.filename,
          path: data.path,
          bytes: data.bytes,
          time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
        resolve(data);
      } else if (data.stage === "error") {
        es.close();
        const now = new Date();
        addLogEntry({
          ok: false,
          filename: `${track.artist_name || "Unknown"} - ${track.title}`,
          error: data.message,
          bytes: 0,
          path: "",
          time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
        reject(new Error(data.message));
      }
    };

    es.onerror = () => {
      es.close();
      const now = new Date();
      addLogEntry({
        ok: false,
        filename: `${track.artist_name || "Unknown"} - ${track.title}`,
        error: "Connection lost",
        bytes: 0,
        path: "",
        time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
      reject(new Error("Connection lost"));
    };
  });
}

async function downloadTrack(track) {
  try {
    await downloadTrackWithProgress(track, 1, 1);
  } catch (e) {
    console.error("Download failed:", e);
  } finally {
    dlProgress.style.display = "none";
  }
}

function playTrack(track) {
  const insertAt = queueIndex + 1;
  queue.splice(insertAt, 0, track);
  queueIndex = insertAt;
  startPlayback(track);
  renderPlaylist();
}

async function startPlayback(track) {
  npBar.style.display = "flex";
  npTitle.textContent = track.title;
  npArtist.textContent = track.artist_name || "";
  const art = coverUrl(track.cover_id, 80);
  npArt.src = art || "";
  npArt.style.display = art ? "" : "none";
  npPlayPause.innerHTML = "&#9646;&#9646;";

  renderPlaylist();

  try {
    const res = await api(`/tracks/${track.tidal_id}/stream-url?quality=${getQuality()}`);
    audio.src = res.url;
    audio.play();
  } catch (e) {
    console.error("Playback failed:", e);
    npTitle.textContent = `Error: ${e.message}`;
  }
}

npPlayPause.addEventListener("click", () => {
  if (audio.paused) {
    audio.play();
    npPlayPause.innerHTML = "&#9646;&#9646;";
  } else {
    audio.pause();
    npPlayPause.innerHTML = "&#9654;";
  }
});

npNext.addEventListener("click", () => {
  if (queueIndex < queue.length - 1) {
    queueIndex++;
    startPlayback(queue[queueIndex]);
  }
});

npPrev.addEventListener("click", () => {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
  } else if (queueIndex > 0) {
    queueIndex--;
    startPlayback(queue[queueIndex]);
  }
});

audio.addEventListener("timeupdate", () => {
  if (!audio.duration) return;
  npTime.textContent = formatDuration(audio.currentTime);
  npDuration.textContent = formatDuration(audio.duration);
  npSeek.value = (audio.currentTime / audio.duration) * 100;
});

npSeek.addEventListener("input", () => {
  if (audio.duration) {
    audio.currentTime = (npSeek.value / 100) * audio.duration;
  }
});

audio.addEventListener("ended", () => {
  if (queueIndex < queue.length - 1) {
    queueIndex++;
    startPlayback(queue[queueIndex]);
  } else {
    npPlayPause.innerHTML = "&#9654;";
  }
});
