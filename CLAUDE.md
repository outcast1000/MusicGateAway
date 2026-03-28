# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
cargo build                    # Debug build
cargo build --release          # Release build
cargo run                      # Run (opens browser by default)
cargo run -- --silent          # Run without opening browser
cargo run -- --port 8080       # Custom port (default: 7171)
cargo run -- --bind 0.0.0.0    # Custom bind address (default: 127.0.0.1)
```

Port/bind can also be set via `MUSICGATEWAY_PORT` and `MUSICGATEWAY_BIND` env vars.

Frontend files are embedded at compile time via `rust-embed`. Changes to `frontend/` require `touch src/main.rs && cargo build` to re-embed.

No tests exist yet. No linter or formatter config — use standard `cargo fmt` and `cargo clippy`.

## Architecture

MusicGateAway is a TIDAL music proxy server (Rust/Axum) with an embedded vanilla JS web UI.

### Backend (Rust)

- **`src/main.rs`** — Axum router setup, CLI args (clap), and static file serving.
- **`src/api.rs`** — HTTP handler functions. All TIDAL calls use `spawn_blocking` because `TidalClient` uses `reqwest::blocking`. Each handler creates a fresh `TidalClient` instance (no shared state). The download endpoint supports SSE (`?progress=true`) for real-time progress reporting.
- **`src/tidal.rs`** — `TidalClient` wraps `reqwest::blocking::Client`. Discovers TIDAL backend instances from uptime worker URLs, caches them for 24h with failover. Stream URL extraction decodes base64 BTS manifests. Downloads are tagged with metadata (title, artist, album, track number, cover art) via `lofty`.
- **`src/types.rs`** — Serde-serializable structs for all API responses.

### API Routes

| Route | Purpose |
|-------|---------|
| `GET /` | Identity (name + version) |
| `GET /search/?s=&limit=&offset=` | Combined search (tracks + albums + artists) |
| `GET /search/?a=` | Search artists only |
| `GET /search/?al=` | Search albums only |
| `GET /tracks?s=&limit=&offset=` | Search tracks |
| `GET /tracks/{id}` | Track metadata |
| `GET /tracks/{id}/stream-url?quality=` | Get direct stream URL |
| `GET /tracks/{id}/stream-data?quality=` | Get stream data (manifest decoded) |
| `GET /tracks/{id}/download?dest=&quality=` | Download track to server filesystem |
| `GET /albums?s=&limit=&offset=` | Search albums |
| `GET /albums/{id}` | Album detail with tracks |
| `GET /artists?s=&limit=&offset=` | Search artists |
| `GET /artists/{id}` | Artist detail with albums |
| `GET /browse?path=` | Browse server directories (for folder picker) |
| `GET /ui/` | Web UI |

### Frontend (`frontend/`)

Single-page vanilla JS app (no build step). `index.html`, `style.css`, `app.js`, `logo.svg`, `debug.html`. Dark theme with warm amber accent ("Matte Black Hi-Fi" aesthetic). Google Fonts: Syne (display) + Outfit (body). Features: search on Enter key, 3-column results (tracks/albums/artists), search type filter, format selector (FLAC/AAC), album/artist detail views with nav stack, audio playback with queue, track selection with batch play/queue/download, SSE download progress bar, folder picker modal, server-side downloads with metadata tagging.
