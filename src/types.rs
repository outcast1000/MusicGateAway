use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TidalSearchTrack {
    pub tidal_id: String,
    pub title: String,
    pub artist_name: Option<String>,
    pub artist_id: Option<String>,
    pub album_title: Option<String>,
    pub album_id: Option<String>,
    pub cover_id: Option<String>,
    pub duration_secs: Option<f64>,
    pub track_number: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TidalSearchAlbum {
    pub tidal_id: String,
    pub title: String,
    pub artist_name: Option<String>,
    pub cover_id: Option<String>,
    pub year: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TidalSearchArtist {
    pub tidal_id: String,
    pub name: String,
    pub picture_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TidalSearchResult {
    pub tracks: Vec<TidalSearchTrack>,
    pub albums: Vec<TidalSearchAlbum>,
    pub artists: Vec<TidalSearchArtist>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TidalAlbumDetail {
    pub tidal_id: String,
    pub title: String,
    pub artist_name: Option<String>,
    pub cover_id: Option<String>,
    pub year: Option<i32>,
    pub tracks: Vec<TidalSearchTrack>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TidalArtistDetail {
    pub tidal_id: String,
    pub name: String,
    pub picture_id: Option<String>,
    pub albums: Vec<TidalSearchAlbum>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamUrlResponse {
    pub url: String,
    pub mime_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdentityResponse {
    pub name: String,
    pub version: String,
}
