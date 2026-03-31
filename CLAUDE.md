# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run

```bash
cargo tauri dev                          # Run desktop app in dev mode
cargo tauri dev -- -- --silent           # Run headless (server only, no window)
cargo tauri dev -- -- --port 8080        # Custom port (default: 7171)
cargo tauri build                        # Build distributable installer (.dmg / .exe)
```

Port/bind can also be set via `MUSICGATEWAY_PORT` and `MUSICGATEWAY_BIND` env vars.

CLI flags: `--port`, `--bind`, `--silent` (headless server mode, no desktop window).

Frontend files are embedded at compile time via `rust-embed`. Changes to `frontend/` require `touch server/src/lib.rs && cargo build` to re-embed.

No tests exist yet. No linter or formatter config — use standard `cargo fmt` and `cargo clippy`.

## Architecture

MusicGateAway is a TIDAL music proxy with a Tauri desktop UI. A single binary serves as both a desktop app (default) and a headless API server (`--silent`).

### Project Structure

```
Cargo.toml          # Workspace root (members: server, src-tauri)
server/             # Server library crate
  src/lib.rs        # Server library: router, static file serving, start_server()
  src/api.rs        # HTTP handlers
  src/tidal.rs      # TIDAL client
  src/types.rs      # API response types
src-tauri/          # Tauri desktop app (single binary)
  src/main.rs       # Entry point: desktop mode or --silent headless mode
  tauri.conf.json   # Tauri configuration
frontend/           # Vanilla JS web UI (embedded via rust-embed)
```

### Backend (Rust)

- **`server/src/lib.rs`** — Exports `start_server(port, bind, shutdown)`. Axum router setup, rust-embed static file serving, CORS.
- **`server/src/api.rs`** — HTTP handler functions. All TIDAL calls use `spawn_blocking` because `TidalClient` uses `reqwest::blocking`. Each handler creates a fresh `TidalClient` instance (no shared state). The download endpoint supports SSE (`?progress=true`) for real-time progress reporting.
- **`server/src/tidal.rs`** — `TidalClient` wraps `reqwest::blocking::Client`. Discovers TIDAL backend instances from uptime worker URLs, caches them for 24h with failover. Stream URL extraction decodes base64 BTS manifests. Downloads are tagged with metadata (title, artist, album, track number, cover art) via `lofty`.
- **`server/src/types.rs`** — Serde-serializable structs for all API responses.
- **`src-tauri/src/main.rs`** — Single entry point. Parses CLI args (clap). Default: spawns server on background thread, opens Tauri webview window + system tray. `--silent`: runs server directly without UI.

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
