pub(crate) mod event_watchdog;
pub(crate) mod plugins;
use std::{env, path::PathBuf, sync::Arc};

use plugins::PluginsState;
use tauri::{
    menu::{MenuBuilder, MenuItem, MenuItemBuilder, SubmenuBuilder},
    tray::TrayIconBuilder,
    webview::PageLoadEvent,
    Manager,
};
use tokio::sync::RwLock;
use tracing::info;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // This should be called as early in the execution of the app as possible

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            let _ = app
                .get_webview_window("main")
                .expect("missing main window")
                .set_focus();
        }))
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .setup(|app| {
            #[cfg(debug_assertions)]
            app.get_webview_window("main").unwrap().open_devtools();

            app.manage(Arc::new(RwLock::new(PluginsState::new())));
            // Spawns the HTTP Server
            let handle = app.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = plugins::frontend_server::spawn_server_blocking(&handle).await;
            });
            let handle = app.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = plugins::spawn_reconciler_blocking(&handle).await;
            });
            let handle = app.app_handle().clone();
            // a mapping of CMDR Name to what is considered the active journal file. This is managed by Tauri so that Plugins can request to replay the current file
            app.manage(Arc::new(
                RwLock::new(bimap::BiMap::<String, PathBuf>::new()),
            ));
            tauri::async_runtime::spawn(async move {
                let _ = event_watchdog::event_watchdog(&handle).await;
            });

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

            app.on_menu_event(move |app, event| {
                if event.id() == "settings" {
                    if let Some(win) = app.get_webview_window("settings") {
                        _ = win.set_focus()
                    } else {
                        let win = tauri::WebviewWindowBuilder::new(
                            app,
                            "settings",
                            tauri::WebviewUrl::App("index.html#/settings".into()),
                        )
                        .build()
                        .unwrap();
                        _ = win.set_title("EDPF Settings");
                        _ = win.set_focus()
                    }
                }
            });

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .on_page_load(|window, event| {
            let w = window.label();
            if let PageLoadEvent::Finished = event.event() {
                info!("page load finished. id: {}", w)
            }
            let state = window.app_handle().state::<Arc<RwLock<PluginsState>>>();
            let mut data = state.blocking_write();

            match w {
                "settings" => data.allow_request_root_key_settings = true,
                "main" => data.allow_request_root_key_main = true,
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            plugins::commands::fetch_all_plugins,
            plugins::commands::get_import_path_for_plugin,
            plugins::commands::open_settings,
            plugins::commands::open_plugins_dir,
            plugins::commands::start_plugin,
            plugins::commands::stop_plugin,
            plugins::commands::start_plugin_failed,
            plugins::commands::finalize_stop_plugin,
            plugins::commands::finalize_start_plugin,
            plugins::commands::sync_main_layout,
            plugins::commands::reread_active_journal,
            plugins::commands::write_setting,
            plugins::commands::read_setting,
            plugins::commands::get_plugin,
            plugins::commands::open_url,
            plugins::get_root_token_once,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
