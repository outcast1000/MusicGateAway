#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::Parser;
use std::sync::Arc;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::WebviewWindowBuilder,
    Manager, WebviewUrl,
};
use tokio::sync::Notify;

#[derive(Parser)]
#[command(name = "MusicGateAway", version, about = "TIDAL music proxy with desktop UI")]
struct Args {
    #[arg(long, default_value = "7171", env = "MUSICGATEWAY_PORT")]
    port: u16,

    #[arg(long, default_value = "127.0.0.1", env = "MUSICGATEWAY_BIND")]
    bind: String,

    /// Run as headless server without the desktop UI
    #[arg(long)]
    silent: bool,
}

fn main() {
    let args = Args::parse();

    if args.silent {
        run_headless(args);
    } else {
        run_desktop(args);
    }
}

fn run_headless(args: Args) {
    let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
    rt.block_on(async {
        let shutdown = Arc::new(Notify::new());
        music_gate_away::start_server(args.port, &args.bind, shutdown).await;
    });
}

fn run_desktop(args: Args) {
    let port = args.port;
    let bind = args.bind;

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            let shutdown = Arc::new(Notify::new());
            let shutdown_on_exit = shutdown.clone();
            let bind_clone = bind.clone();

            // Spawn the Axum server on a dedicated thread with its own tokio runtime
            std::thread::spawn(move || {
                let rt = tokio::runtime::Runtime::new()
                    .expect("Failed to create tokio runtime");
                rt.block_on(async {
                    music_gate_away::start_server(port, &bind_clone, shutdown).await;
                });
            });

            // Store shutdown handle in managed state for use on exit
            app.manage(shutdown_on_exit);

            // Wait for the server to be ready (poll with timeout)
            let health_url = format!("http://127.0.0.1:{}/", port);
            let client = reqwest::blocking::Client::builder()
                .timeout(std::time::Duration::from_secs(1))
                .build()
                .unwrap();
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
            while std::time::Instant::now() < deadline {
                if client.get(&health_url).send().is_ok() {
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }

            // Create the main webview window pointing at the running server
            let url = format!("http://127.0.0.1:{}/ui/", port);
            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(url.parse().unwrap()),
            )
            .title("MusicGateAway")
            .inner_size(1200.0, 800.0)
            .min_inner_size(800.0, 500.0)
            .build()?;

            // System tray
            let show = MenuItemBuilder::with_id("show", "Show Window").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

            TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("MusicGateAway")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.unminimize();
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.unminimize();
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let shutdown: &Arc<Notify> = app.state::<Arc<Notify>>().inner();
                shutdown.notify_one();
            }
        });
}
