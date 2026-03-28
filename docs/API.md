# MusicGateAway API Guide

Base URL: `http://localhost:7171` (default)

All endpoints return JSON. No authentication required.

---

## Identity

### `GET /`

Returns server name, version, API/UI URLs, and executable path.

```json
{
  "name": "MusicGateAway",
  "version": "1.0.0",
  "api": "http://127.0.0.1:7171/",
  "ui": "http://127.0.0.1:7171/ui/",
  "bin": "/usr/local/bin/music-gate-away"
}
```

| Field | Description |
|-------|-------------|
| `name` | Application name |
| `version` | Semantic version |
| `api` | Base URL for the API |
| `ui` | URL for the web UI |
| `bin` | Absolute path to the running executable |

---

## Search

### `GET /search/`

Combined search returning tracks, albums, and artists.

| Param | Type | Description |
|-------|------|-------------|
| `s` | string | Search query (returns tracks + albums + artists) |
| `a` | string | Search artists only |
| `al` | string | Search albums only |
| `limit` | int | Max results (default: 25) |
| `offset` | int | Pagination offset (default: 0) |

Use exactly one of `s`, `a`, or `al`.

**Example:** `GET /search/?s=radiohead&limit=10`

```json
{
  "tracks": [
    {
      "tidal_id": "3065032",
      "title": "Creep",
      "artist_name": "Radiohead",
      "artist_id": "7033",
      "album_title": "Pablo Honey",
      "album_id": "3065023",
      "cover_id": "ab67616d-0000-b273-df55e326",
      "duration_secs": 238.0,
      "track_number": 2
    }
  ],
  "albums": [...],
  "artists": [...]
}
```

---

## Tracks

### `GET /tracks`

Search tracks.

| Param | Type | Description |
|-------|------|-------------|
| `s` | string | **Required.** Search query |
| `limit` | int | Max results (default: 25) |
| `offset` | int | Pagination offset (default: 0) |

Returns an array of track objects.

### `GET /tracks/{id}`

Get metadata for a single track by TIDAL ID.

**Example:** `GET /tracks/3065032`

```json
{
  "tidal_id": "3065032",
  "title": "Creep",
  "artist_name": "Radiohead",
  "artist_id": "7033",
  "album_title": "Pablo Honey",
  "album_id": "3065023",
  "cover_id": "ab67616d-0000-b273-df55e326",
  "duration_secs": 238.0,
  "track_number": 2
}
```

### `GET /tracks/{id}/stream-url`

Get the direct stream URL for a track.

| Param | Type | Description |
|-------|------|-------------|
| `quality` | string | `LOSSLESS` (FLAC) or `HIGH` (AAC). Default: `LOSSLESS` |

```json
{
  "url": "https://sp-pr-cf.audio.tidal.com/...",
  "mime_type": "audio/flac"
}
```

### `GET /tracks/{id}/stream-data`

Same as stream-url but returns raw stream data as JSON object.

```json
{
  "url": "https://sp-pr-cf.audio.tidal.com/...",
  "mime_type": "audio/flac"
}
```

### `GET /tracks/{id}/download`

Download a track to the server filesystem. The file is tagged with metadata (title, artist, album, track number, cover art).

| Param | Type | Description |
|-------|------|-------------|
| `dest` | string | **Required.** Destination directory path on server |
| `quality` | string | `LOSSLESS` or `HIGH`. Default: `LOSSLESS` |
| `progress` | string | Set to `true` for SSE progress stream |

**Without progress (JSON response):**

```json
{
  "path": "/tmp/downloads/Radiohead - Pablo Honey - 02 - Creep.flac",
  "filename": "Radiohead - Pablo Honey - 02 - Creep.flac",
  "bytes": 28456789,
  "mime_type": "audio/flac"
}
```

**With `progress=true` (Server-Sent Events):**

The endpoint returns `Content-Type: text/event-stream` with events:

```
data: {"stage":"info","message":"Fetching track info..."}
data: {"stage":"info","message":"Fetching stream URL for Radiohead - Creep..."}
data: {"stage":"downloading","bytes":524288,"total":28456789,"percent":1}
data: {"stage":"downloading","bytes":1048576,"total":28456789,"percent":3}
...
data: {"stage":"downloading","bytes":28456789,"total":28456789,"percent":100}
data: {"stage":"tagging","message":"Writing metadata..."}
data: {"stage":"done","path":"/tmp/downloads/Radiohead - Pablo Honey - 02 - Creep.flac","filename":"Radiohead - Pablo Honey - 02 - Creep.flac","bytes":28456789}
```

On error: `data: {"stage":"error","message":"..."}`

---

## Albums

### `GET /albums`

Search albums.

| Param | Type | Description |
|-------|------|-------------|
| `s` | string | **Required.** Search query |
| `limit` | int | Max results (default: 25) |
| `offset` | int | Pagination offset (default: 0) |

Returns an array of album objects.

### `GET /albums/{id}`

Get album detail including track listing.

```json
{
  "tidal_id": "3065023",
  "title": "Pablo Honey",
  "artist_name": "Radiohead",
  "cover_id": "ab67616d-0000-b273-df55e326",
  "year": 1993,
  "tracks": [
    {
      "tidal_id": "3065024",
      "title": "You",
      "artist_name": "Radiohead",
      "track_number": 1,
      "duration_secs": 208.0,
      ...
    }
  ]
}
```

---

## Artists

### `GET /artists`

Search artists.

| Param | Type | Description |
|-------|------|-------------|
| `s` | string | **Required.** Search query |
| `limit` | int | Max results (default: 25) |
| `offset` | int | Pagination offset (default: 0) |

Returns an array of artist objects.

### `GET /artists/{id}`

Get artist detail with discography.

```json
{
  "tidal_id": "7033",
  "name": "Radiohead",
  "picture_id": "ab67616d-0000-1234-5678",
  "albums": [
    {
      "tidal_id": "3065023",
      "title": "Pablo Honey",
      "artist_name": "Radiohead",
      "cover_id": "...",
      "year": 1993
    }
  ]
}
```

---

## Browse

### `GET /browse`

Browse directories on the server filesystem (used by the folder picker UI).

| Param | Type | Description |
|-------|------|-------------|
| `path` | string | Directory to list. Default: user home directory |

```json
{
  "current": "/Users/alex/Music",
  "parent": "/Users/alex",
  "dirs": ["Albums", "Downloads", "Playlists"]
}
```

Hidden directories (starting with `.`) are excluded. Results are sorted alphabetically.

---

## Cover Art URLs

Cover art images are available from TIDAL's CDN. Construct the URL from a `cover_id`:

```
https://resources.tidal.com/images/{cover_id_with_slashes}/{size}x{size}.jpg
```

Replace `-` with `/` in the cover ID. Common sizes: `80`, `320`, `640`, `1280`.

**Example:** cover_id `ab67-616d-0000-b273` becomes:
```
https://resources.tidal.com/images/ab67/616d/0000/b273/320x320.jpg
```

---

## Quality Options

| Value | Format | Typical Size |
|-------|--------|-------------|
| `LOSSLESS` | FLAC (16-bit/44.1kHz) | ~30 MB per track |
| `HIGH` | AAC (320 kbps) | ~10 MB per track |
