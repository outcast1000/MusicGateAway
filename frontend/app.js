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

let queue = [];
let queueIndex = -1;
let debounceTimer = null;
let navStack = [];

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

searchInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  const q = searchInput.value.trim();
  if (!q) {
    content.innerHTML = `<div class="empty-state">Type in the search bar to search TIDAL</div>`;
    return;
  }
  debounceTimer = setTimeout(() => doSearch(q), 400);
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
  let html = "";

  if (res.tracks && res.tracks.length > 0) {
    html += `<div class="section"><h3>Tracks</h3><div class="track-list">`;
    for (const t of res.tracks) {
      html += trackRow(t);
    }
    html += `</div></div>`;
  }

  if (res.albums && res.albums.length > 0) {
    html += `<div class="section"><h3>Albums</h3><div class="card-grid">`;
    for (const a of res.albums) {
      html += albumCard(a);
    }
    html += `</div></div>`;
  }

  if (res.artists && res.artists.length > 0) {
    html += `<div class="section"><h3>Artists</h3><div class="card-grid">`;
    for (const a of res.artists) {
      html += artistCard(a);
    }
    html += `</div></div>`;
  }

  if (!html) {
    html = `<div class="empty-state">No results found</div>`;
  }

  content.innerHTML = html;
  bindTrackActions();
}

function trackRow(t, showArt = true) {
  const art = coverUrl(t.cover_id, 80);
  const artHtml = showArt
    ? `<div class="track-art">${art ? `<img src="${art}" alt="">` : `<div class="art-placeholder"></div>`}</div>`
    : `<span class="track-num">${t.track_number || ""}</span>`;
  return `
    <div class="track-row" data-id="${t.tidal_id}" data-track='${JSON.stringify(t).replace(/'/g, "&#39;")}'>
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
    const track = JSON.parse(row.dataset.track);
    if (btn.dataset.action === "play") playTrack(track);
    else if (btn.dataset.action === "enqueue") enqueueTrack(track);
    return;
  }

  // Back button
  if (e.target.closest(".back-btn")) { goBack(); return; }

  // Play album
  const playAlbumBtn = e.target.closest("[data-action-play-album]");
  if (playAlbumBtn) {
    const rows = content.querySelectorAll(".track-row");
    const tracks = Array.from(rows).map(r => JSON.parse(r.dataset.track));
    if (tracks.length > 0) {
      queue = tracks;
      queueIndex = 0;
      startPlayback(tracks[0]);
    }
    return;
  }
});

function bindTrackActions() {
  // Event delegation handles everything via content click listener
}

async function loadAlbum(albumId) {
  navStack.push(content.innerHTML);
  content.innerHTML = `<div class="loading-bar">Loading album...</div>`;
  try {
    const album = await api(`/album/?id=${albumId}`);
    renderAlbumDetail(album);
  } catch (e) {
    content.innerHTML = `<div class="empty-state">Failed to load album: ${e.message}</div>`;
  }
}

async function loadArtist(artistId) {
  navStack.push(content.innerHTML);
  content.innerHTML = `<div class="loading-bar">Loading artist...</div>`;
  try {
    const artist = await api(`/artist/?id=${artistId}`);
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
        </div>
      </div>
      <div class="track-list">`;

  for (const t of (album.tracks || [])) {
    html += trackRow(t, false);
  }

  html += `</div></div>`;
  content.innerHTML = html;
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
}

// --- Playback ---

function enqueueTrack(track) {
  queue.push(track);
}

function playTrack(track) {
  // Insert at current position + 1, set as current
  const insertAt = queueIndex + 1;
  queue.splice(insertAt, 0, track);
  queueIndex = insertAt;
  startPlayback(track);
}

async function startPlayback(track) {
  npBar.style.display = "flex";
  npTitle.textContent = track.title;
  npArtist.textContent = track.artist_name || "";
  const art = coverUrl(track.cover_id, 80);
  npArt.src = art || "";
  npArt.style.display = art ? "" : "none";
  npPlayPause.innerHTML = "&#9646;&#9646;";

  try {
    const res = await api(`/stream-url/?id=${track.tidal_id}&quality=LOSSLESS`);
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
