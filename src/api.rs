use axum::extract::{Path, Query, State};
use axum::response::{Json, IntoResponse, Response};
use axum::response::sse::{Event, Sse};
use serde::Deserialize;
use std::convert::Infallible;
use std::sync::Arc;
use tokio_stream::wrappers::ReceiverStream;
use tokio_stream::StreamExt;

use crate::tidal::TidalClient;
use crate::types::*;

#[derive(Clone)]
pub struct AppState {
    pub base_url: Arc<String>,
    pub shutdown: Arc<tokio::sync::Notify>,
}

fn client() -> TidalClient {
    TidalClient::new(None)
}

fn track_to_search(t: crate::tidal::TidalTrackInfo) -> TidalSearchTrack {
    TidalSearchTrack {
        tidal_id: t.id,
        title: t.title,
        artist_name: t.artist_name,
        artist_id: t.artist_id,
        album_title: t.album_title,
        album_id: t.album_id,
        cover_id: t.cover_id,
        duration_secs: t.duration_secs,
        track_number: t.track_number,
    }
}

fn album_to_search(a: crate::tidal::TidalAlbumInfo) -> TidalSearchAlbum {
    TidalSearchAlbum {
        tidal_id: a.id,
        title: a.title,
        artist_name: a.artist_name,
        cover_id: a.cover_id,
        year: a.year,
    }
}

fn artist_to_search(a: crate::tidal::TidalArtistInfo) -> TidalSearchArtist {
    TidalSearchArtist {
        tidal_id: a.id,
        name: a.name,
        picture_id: a.picture_id,
    }
}

pub async fn identity(State(state): State<AppState>) -> Json<IdentityResponse> {
    let bin = std::env::current_exe()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default();
    Json(IdentityResponse {
        name: "MusicGateAway".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        api: format!("{}/", state.base_url),
        ui: format!("{}/ui/", state.base_url),
        bin,
    })
}

pub async fn shutdown(State(state): State<AppState>) -> Json<serde_json::Value> {
    state.shutdown.notify_one();
    Json(serde_json::json!({ "status": "shutting down" }))
}

// --- Search (combined) ---

#[derive(Deserialize)]
pub struct SearchParams {
    pub s: Option<String>,
    pub a: Option<String>,
    pub al: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

pub async fn search(Query(params): Query<SearchParams>) -> Result<Json<serde_json::Value>, String> {
    let limit = params.limit.unwrap_or(25);
    let offset = params.offset.unwrap_or(0);

    tokio::task::spawn_blocking(move || {
        let c = client();

        if let Some(ref q) = params.s {
            let tracks = c.search_tracks(q, limit, offset).map_err(|e| e.to_string())?;
            let artists = c.search_artists(q, 5, 0).unwrap_or_default();
            let albums = c.search_albums(q, 5, 0).unwrap_or_default();
            let result = TidalSearchResult {
                tracks: tracks.into_iter().map(track_to_search).collect(),
                albums: albums.into_iter().map(album_to_search).collect(),
                artists: artists.into_iter().map(artist_to_search).collect(),
            };
            Ok(Json(serde_json::to_value(result).unwrap()))
        } else if let Some(ref q) = params.a {
            let artists = c.search_artists(q, limit, offset).map_err(|e| e.to_string())?;
            let result: Vec<TidalSearchArtist> = artists.into_iter().map(artist_to_search).collect();
            Ok(Json(serde_json::json!({ "data": { "artists": { "items": result } } })))
        } else if let Some(ref q) = params.al {
            let albums = c.search_albums(q, limit, offset).map_err(|e| e.to_string())?;
            let result: Vec<TidalSearchAlbum> = albums.into_iter().map(album_to_search).collect();
            Ok(Json(serde_json::json!({ "data": { "albums": { "items": result } } })))
        } else {
            Err("Missing search parameter (s, a, or al)".to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

// --- Tracks ---

#[derive(Deserialize)]
pub struct TracksSearchParams {
    pub s: String,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

pub async fn tracks_search(
    Query(params): Query<TracksSearchParams>,
) -> Result<Json<Vec<TidalSearchTrack>>, String> {
    let limit = params.limit.unwrap_or(25);
    let offset = params.offset.unwrap_or(0);

    tokio::task::spawn_blocking(move || {
        let c = client();
        let tracks = c.search_tracks(&params.s, limit, offset).map_err(|e| e.to_string())?;
        Ok(Json(tracks.into_iter().map(track_to_search).collect()))
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn tracks_get(Path(id): Path<String>) -> Result<Json<TidalSearchTrack>, String> {
    tokio::task::spawn_blocking(move || {
        let c = client();
        let track = c.get_track_info(&id).map_err(|e| e.to_string())?;
        Ok(Json(track_to_search(track)))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Deserialize)]
pub struct StreamParams {
    pub quality: Option<String>,
}

pub async fn tracks_stream_url(
    Path(id): Path<String>,
    Query(params): Query<StreamParams>,
) -> Result<Json<StreamUrlResponse>, String> {
    tokio::task::spawn_blocking(move || {
        let c = client();
        let quality = params.quality.as_deref().unwrap_or("LOSSLESS");
        let info = c.get_stream_url(&id, quality).map_err(|e| e.to_string())?;
        Ok(Json(StreamUrlResponse {
            url: info.url,
            mime_type: info.mime_type,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn tracks_stream_data(
    Path(id): Path<String>,
    Query(params): Query<StreamParams>,
) -> Result<Json<serde_json::Value>, String> {
    tokio::task::spawn_blocking(move || {
        let c = client();
        let quality = params.quality.as_deref().unwrap_or("LOSSLESS");
        let info = c.get_stream_url(&id, quality).map_err(|e| e.to_string())?;
        Ok(Json(serde_json::json!({
            "url": info.url,
            "mime_type": info.mime_type,
        })))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Deserialize)]
pub struct DownloadParams {
    pub dest: String,
    pub quality: Option<String>,
    pub progress: Option<String>,
}

pub async fn tracks_download(
    Path(id): Path<String>,
    Query(params): Query<DownloadParams>,
) -> Response {
    if params.progress.as_deref() == Some("true") {
        tracks_download_sse(id, params).into_response()
    } else {
        tracks_download_json(id, params).await.into_response()
    }
}

async fn tracks_download_json(id: String, params: DownloadParams) -> Response {
    let result = tokio::task::spawn_blocking(move || {
        let c = client();
        let quality = params.quality.as_deref().unwrap_or("LOSSLESS");
        let dest = std::path::Path::new(&params.dest);
        c.download_track(&id, quality, dest, None)
            .map_err(|e| e.to_string())
    })
    .await;

    match result {
        Ok(Ok(r)) => Json(DownloadResponse {
            path: r.path,
            filename: r.filename,
            bytes: r.bytes,
            mime_type: r.mime_type,
        })
        .into_response(),
        Ok(Err(e)) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
        Err(e) => {
            (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
        }
    }
}

fn tracks_download_sse(
    id: String,
    params: DownloadParams,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let (tx, rx) = tokio::sync::mpsc::channel::<String>(64);

    tokio::task::spawn_blocking(move || {
        let c = client();
        let quality = params.quality.as_deref().unwrap_or("LOSSLESS");
        let dest = std::path::Path::new(&params.dest);
        if let Err(e) = c.download_track(&id, quality, dest, Some(tx.clone())) {
            let _ = tx.blocking_send(format!(
                r#"{{"stage":"error","message":"{}"}}"#,
                e.to_string().replace('"', "\\\"")
            ));
        }
    });

    let stream = ReceiverStream::new(rx).map(|data| Ok(Event::default().data(data)));
    Sse::new(stream)
}

// --- Browse directories ---

#[derive(Deserialize)]
pub struct BrowseParams {
    pub path: Option<String>,
}

#[derive(serde::Serialize)]
pub struct BrowseResponse {
    pub current: String,
    pub parent: Option<String>,
    pub dirs: Vec<String>,
}

pub async fn browse_dirs(
    Query(params): Query<BrowseParams>,
) -> Result<Json<BrowseResponse>, String> {
    let base = params
        .path
        .filter(|p| !p.is_empty())
        .unwrap_or_else(|| {
            dirs::home_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|| "/".to_string())
        });

    let base_path = std::path::Path::new(&base);
    if !base_path.is_dir() {
        return Err(format!("Not a directory: {}", base));
    }

    let parent = base_path.parent().map(|p| p.to_string_lossy().to_string());

    let mut dirs = Vec::new();
    let entries = std::fs::read_dir(base_path).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        if let Ok(ft) = entry.file_type() {
            if ft.is_dir() {
                if let Some(name) = entry.file_name().to_str() {
                    if !name.starts_with('.') {
                        dirs.push(name.to_string());
                    }
                }
            }
        }
    }
    dirs.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));

    Ok(Json(BrowseResponse {
        current: base_path.to_string_lossy().to_string(),
        parent,
        dirs,
    }))
}

// --- Albums ---

#[derive(Deserialize)]
pub struct AlbumsSearchParams {
    pub s: String,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

pub async fn albums_search(
    Query(params): Query<AlbumsSearchParams>,
) -> Result<Json<Vec<TidalSearchAlbum>>, String> {
    let limit = params.limit.unwrap_or(25);
    let offset = params.offset.unwrap_or(0);

    tokio::task::spawn_blocking(move || {
        let c = client();
        let albums = c.search_albums(&params.s, limit, offset).map_err(|e| e.to_string())?;
        Ok(Json(albums.into_iter().map(album_to_search).collect()))
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn albums_get(Path(id): Path<String>) -> Result<Json<TidalAlbumDetail>, String> {
    tokio::task::spawn_blocking(move || {
        let c = client();
        let album = c.get_album(&id).map_err(|e| e.to_string())?;
        Ok(Json(TidalAlbumDetail {
            tidal_id: album.id,
            title: album.title,
            artist_name: album.artist_name,
            cover_id: album.cover_id,
            year: album.year,
            tracks: album.tracks.into_iter().map(track_to_search).collect(),
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}


// --- Artists ---

#[derive(Deserialize)]
pub struct ArtistsSearchParams {
    pub s: String,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

pub async fn artists_search(
    Query(params): Query<ArtistsSearchParams>,
) -> Result<Json<Vec<TidalSearchArtist>>, String> {
    let limit = params.limit.unwrap_or(25);
    let offset = params.offset.unwrap_or(0);

    tokio::task::spawn_blocking(move || {
        let c = client();
        let artists = c.search_artists(&params.s, limit, offset).map_err(|e| e.to_string())?;
        Ok(Json(artists.into_iter().map(artist_to_search).collect()))
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn artists_get(Path(id): Path<String>) -> Result<Json<TidalArtistDetail>, String> {
    tokio::task::spawn_blocking(move || {
        let c = client();
        let artist = c.get_artist(&id).map_err(|e| e.to_string())?;
        let albums = c.get_artist_albums(&id).unwrap_or_default();
        Ok(Json(TidalArtistDetail {
            tidal_id: artist.id,
            name: artist.name,
            picture_id: artist.picture_id,
            albums: albums.into_iter().map(album_to_search).collect(),
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

