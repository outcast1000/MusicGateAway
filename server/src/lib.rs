pub mod api;
pub mod tidal;
pub mod types;

use axum::{
    http::{HeaderValue, Method, header},
    response::{IntoResponse, Redirect, Response},
    routing::get,
    Router,
};
use rust_embed::Embed;
use std::sync::Arc;
use tokio::sync::Notify;
use tower_http::cors::CorsLayer;

#[derive(Embed)]
#[folder = "../frontend/"]
struct Frontend;

async fn serve_frontend(path: axum::extract::Path<String>) -> Response {
    let path = path.0;
    let file_path = if path.is_empty() { "index.html" } else { &path };
    match Frontend::get(file_path) {
        Some(file) => {
            let mime = mime_guess::from_path(file_path)
                .first_or_octet_stream()
                .to_string();
            ([(header::CONTENT_TYPE, mime)], file.data.to_vec()).into_response()
        }
        None => match Frontend::get("index.html") {
            Some(file) => (
                [(header::CONTENT_TYPE, "text/html".to_string())],
                file.data.to_vec(),
            )
                .into_response(),
            None => (axum::http::StatusCode::NOT_FOUND, "Not found").into_response(),
        },
    }
}

async fn serve_ui_root() -> Response {
    match Frontend::get("index.html") {
        Some(file) => (
            [(header::CONTENT_TYPE, "text/html".to_string())],
            file.data.to_vec(),
        )
            .into_response(),
        None => (axum::http::StatusCode::NOT_FOUND, "Not found").into_response(),
    }
}

pub async fn start_server(port: u16, bind: &str, shutdown: Arc<Notify>) {
    let cors = CorsLayer::new()
        .allow_origin("*".parse::<HeaderValue>().unwrap())
        .allow_methods([Method::GET])
        .allow_headers([header::CONTENT_TYPE]);

    let addr = format!("{}:{}", bind, port);
    let state = api::AppState {
        base_url: Arc::new(format!("http://{}", addr)),
        shutdown: shutdown.clone(),
    };

    let app = Router::new()
        .route("/", get(api::identity))
        .route("/shutdown", get(api::shutdown))
        .route("/search/", get(api::search))
        .route("/tracks", get(api::tracks_search))
        .route("/tracks/{id}", get(api::tracks_get))
        .route("/tracks/{id}/stream-url", get(api::tracks_stream_url))
        .route("/tracks/{id}/stream-data", get(api::tracks_stream_data))
        .route("/tracks/{id}/download", get(api::tracks_download))
        .route("/albums", get(api::albums_search))
        .route("/albums/{id}", get(api::albums_get))
        .route("/artists", get(api::artists_search))
        .route("/artists/{id}", get(api::artists_get))
        .route("/browse", get(api::browse_dirs))
        .route("/open-folder", get(api::open_folder))
        .route("/ui", get(|| async { Redirect::permanent("/ui/") }))
        .route("/ui/", get(serve_ui_root))
        .route("/ui/{*path}", get(serve_frontend))
        .layer(cors)
        .with_state(state);

    println!(
        "MusicGateAway v{} listening on http://{}",
        env!("CARGO_PKG_VERSION"),
        addr
    );
    println!("  API: http://{}/", addr);
    println!("  UI:  http://{}/ui/", addr);

    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to bind to {}: {}", addr, e);
            return;
        }
    };
    axum::serve(listener, app)
        .with_graceful_shutdown(async move { shutdown.notified().await })
        .await
        .unwrap();
    println!("Shutdown complete.");
}
