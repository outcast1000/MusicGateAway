# MusicGateAway

A lightweight TIDAL proxy server with a built-in web UI. Search, stream, and download music in lossless quality.

**Website:** [musicgetaway.j-15.com](https://musicgetaway.j-15.com)

## Features

- **Lossless streaming** — FLAC (16-bit/44.1kHz) or high-quality AAC playback in the browser
- **Search** — Find tracks, albums, and artists from TIDAL's catalog
- **Download with metadata** — Downloads are tagged with title, artist, album, track number, and cover art
- **Queue & playback** — Built-in audio player with playlist queue
- **Single binary** — The web UI is embedded at compile time, no separate frontend to deploy
- **REST API** — Full JSON API for building your own tools on top

## Install

Download the latest release from the [website](https://musicgetaway.j-15.com) or [GitHub Releases](https://github.com/outcast1000/MusicGateAway/releases).

| Platform | Installer | Portable |
|----------|-----------|----------|
| macOS (Apple Silicon) | `.pkg` | `.tar.gz` |
| macOS (Intel) | `.pkg` | `.tar.gz` |
| Windows (x64) | Setup `.exe` | `.zip` |

### Build from source

Requires [Rust](https://rustup.rs/) 1.75+.

```bash
git clone https://github.com/outcast1000/MusicGateAway.git
cd MusicGateAway
cargo build --release
```

The binary will be at `target/release/music-gate-away`.

## Usage

```bash
music-gate-away              # starts server, opens browser
music-gate-away --silent     # starts server without opening browser
music-gate-away --port 8080  # custom port (default: 7171)
music-gate-away --bind 0.0.0.0  # listen on all interfaces (default: 127.0.0.1)
```

Port and bind address can also be set via `MUSICGATEWAY_PORT` and `MUSICGATEWAY_BIND` environment variables.

Once running:
- **Web UI:** http://localhost:7171/ui/
- **API:** http://localhost:7171/

## API

See [docs/API.md](docs/API.md) for the full API reference.

| Endpoint | Description |
|----------|-------------|
| `GET /search/?s=query` | Combined search (tracks, albums, artists) |
| `GET /tracks/{id}/stream-url` | Get direct stream URL |
| `GET /tracks/{id}/download?dest=/path` | Download with metadata tagging |
| `GET /albums/{id}` | Album detail with track listing |
| `GET /artists/{id}` | Artist detail with discography |

## Tech Stack

- **Backend:** Rust, Axum, reqwest, lofty (metadata tagging)
- **Frontend:** Vanilla JS, CSS (no build step)
- **Embedding:** rust-embed (frontend baked into the binary)

## License

MIT
