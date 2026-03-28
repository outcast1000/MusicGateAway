mod api;
mod tidal;
mod types;

use axum::{
    http::{HeaderValue, Method, header},
    response::{IntoResponse, Redirect, Response},
    routing::get,
    Router,
};
use clap::Parser;
use rust_embed::Embed;
use tower_http::cors::CorsLayer;

#[derive(Embed)]
#[folder = "frontend/"]
struct Frontend;

#[derive(Parser)]
#[command(name = "MusicGateAway", version, about = "TIDAL proxy with web UI")]
struct Args {
    #[arg(long, default_value = "7171", env = "MUSICGATEWAY_PORT")]
    port: u16,

    #[arg(long, default_value = "127.0.0.1", env = "MUSICGATEWAY_BIND")]
    bind: String,

    /// Do not open the web UI in the browser on startup
    #[arg(long)]
    silent: bool,
}

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

#[tokio::main]
async fn main() {
    let args = Args::parse();

    let cors = CorsLayer::new()
        .allow_origin("*".parse::<HeaderValue>().unwrap())
        .allow_methods([Method::GET])
        .allow_headers([header::CONTENT_TYPE]);

    let app = Router::new()
        .route("/", get(api::identity))
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
        .route("/ui", get(|| async { Redirect::permanent("/ui/") }))
        .route("/ui/", get(serve_ui_root))
        .route("/ui/{*path}", get(serve_frontend))
        .layer(cors);

    let addr = format!("{}:{}", args.bind, args.port);
    println!(
        "MusicGateAway v{} listening on http://{}",
        env!("CARGO_PKG_VERSION"),
        addr
    );
    println!("  API: http://{}/", addr);
    println!("  UI:  http://{}/ui/", addr);

    if !args.silent {
        let ui_url = format!("http://{}/ui/", addr);
        if let Err(e) = open::that(&ui_url) {
            eprintln!("Failed to open browser: {}", e);
        }
    }

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
