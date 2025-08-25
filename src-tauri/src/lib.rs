pub(crate) mod event_watchdog;
pub(crate) mod plugins;
use std::{env, sync::Arc};

use plugins::PluginsState;
use tauri::{
    menu::{MenuBuilder, MenuItem, MenuItemBuilder, SubmenuBuilder},
    tray::TrayIconBuilder,
    Manager,
};
use tokio::sync::RwLock;
use tracing::Instrument;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let _ = app
                .get_webview_window("main")
                .expect("missing main window")
                .set_focus();
        }))
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .setup(|app| {
            app.manage(Arc::new(RwLock::new(PluginsState::new())));
            // Spawns the HTTP Server
            let handle = app.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = plugins::frontend_server::spawn_server_blocking(&handle).await;
            });
            let handle = app.app_handle().clone();
            let reconciler_span = tracing::info_span!("plugin-reconciler");
            tauri::async_runtime::spawn(
                async move {
                    let _ = plugins::spawn_reconciler_blocking(&handle).await;
                }
                .instrument(reconciler_span),
            );
            let handle = app.app_handle().clone();
            let reconciler_span = tracing::info_span!("journal-watchdog");
            tauri::async_runtime::spawn(
                async move {
                    let _ = event_watchdog::event_watchdog(handle).await;
                }
                .instrument(reconciler_span),
            );

            // big thanks to Ratul @ https://ratulmaharaj.com/posts/tauri-custom-menu/
            let quit_item = MenuItem::with_id(app, "edpf-quit", "Quit", true, None::<&str>)?;
            let settings = MenuItemBuilder::new("Settings")
                .id("settings")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;

            let theme = SubmenuBuilder::new(app, "Theme")
                .text("theme-dark", "Dark")
                .text("theme-light", "Light")
                .text("theme-overlay", "Overlay")
                .build()?;
            let menu = MenuBuilder::new(app)
                .item(&theme)
                .separator()
                .text("edit-layout", "Edit")
                .check("theme-on-top", "Always on Top")
                .check("theme-locked", "Locked")
                .separator()
                .item(&settings)
                .separator()
                .item(&quit_item)
                .build()?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .build(app)?;

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
