use axum::extract::Query;
use axum::response::Json;
use serde::Deserialize;

use crate::tidal::TidalClient;
use crate::types::*;

fn client() -> TidalClient {
    TidalClient::new()
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

pub async fn identity() -> Json<IdentityResponse> {
    Json(IdentityResponse {
        name: "MusicGateAway".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

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
            // Track search — also fetch artists and albums
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

#[derive(Deserialize)]
pub struct TrackParams {
    pub id: String,
    pub quality: Option<String>,
}

pub async fn track(Query(params): Query<TrackParams>) -> Result<Json<serde_json::Value>, String> {
    tokio::task::spawn_blocking(move || {
        let c = client();
        let quality = params.quality.as_deref().unwrap_or("LOSSLESS");
        // Return raw response for Viboplr compatibility
        let json = c.get_stream_url(&params.id, quality).map_err(|e| e.to_string())?;
        Ok(Json(serde_json::json!({
            "url": json.url,
            "mime_type": json.mime_type,
        })))
    })
    .await
    .map_err(|e| e.to_string())?
}

pub async fn stream_url(
    Query(params): Query<TrackParams>,
) -> Result<Json<StreamUrlResponse>, String> {
    tokio::task::spawn_blocking(move || {
        let c = client();
        let quality = params.quality.as_deref().unwrap_or("LOSSLESS");
        let info = c.get_stream_url(&params.id, quality).map_err(|e| e.to_string())?;
        Ok(Json(StreamUrlResponse {
            url: info.url,
            mime_type: info.mime_type,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Deserialize)]
pub struct InfoParams {
    pub id: String,
}

pub async fn info(Query(params): Query<InfoParams>) -> Result<Json<TidalSearchTrack>, String> {
    tokio::task::spawn_blocking(move || {
        let c = client();
        let track = c.get_track_info(&params.id).map_err(|e| e.to_string())?;
        Ok(Json(track_to_search(track)))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Deserialize)]
pub struct AlbumParams {
    pub id: String,
}

pub async fn album(Query(params): Query<AlbumParams>) -> Result<Json<TidalAlbumDetail>, String> {
    tokio::task::spawn_blocking(move || {
        let c = client();
        let album = c.get_album(&params.id).map_err(|e| e.to_string())?;
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

#[derive(Deserialize)]
#[allow(dead_code)]
pub struct ArtistParams {
    pub id: Option<String>,
    pub f: Option<String>,
    pub skip_tracks: Option<String>,
}

pub async fn artist(
    Query(params): Query<ArtistParams>,
) -> Result<Json<serde_json::Value>, String> {
    tokio::task::spawn_blocking(move || {
        let c = client();

        if let Some(ref artist_id) = params.f {
            // Artist albums
            let albums = c.get_artist_albums(artist_id).map_err(|e| e.to_string())?;
            let artist = c.get_artist(artist_id).map_err(|e| e.to_string())?;
            let detail = TidalArtistDetail {
                tidal_id: artist.id,
                name: artist.name,
                picture_id: artist.picture_id,
                albums: albums.into_iter().map(album_to_search).collect(),
            };
            Ok(Json(serde_json::to_value(detail).unwrap()))
        } else if let Some(ref artist_id) = params.id {
            let artist = c.get_artist(artist_id).map_err(|e| e.to_string())?;
            let albums = c.get_artist_albums(artist_id).unwrap_or_default();
            let detail = TidalArtistDetail {
                tidal_id: artist.id,
                name: artist.name,
                picture_id: artist.picture_id,
                albums: albums.into_iter().map(album_to_search).collect(),
            };
            Ok(Json(serde_json::to_value(detail).unwrap()))
        } else {
            Err("Missing artist id or f parameter".to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
