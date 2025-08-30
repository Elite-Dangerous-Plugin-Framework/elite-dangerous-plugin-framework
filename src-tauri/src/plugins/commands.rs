use std::sync::Arc;

use serde_json::json;
use tauri::{Manager, Runtime};
use tokio::sync::RwLock;

use super::{frontend_server::HttpServerState, PluginsState};

#[tauri::command]
pub(crate) async fn fetch_all_plugins<R: Runtime>(
    app: tauri::AppHandle<R>,
    _window: tauri::Window<R>,
) -> Result<serde_json::Value, String> {
    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let data = state.read().await;

    let resp: Result<serde_json::Value, String> =
        serde_json::to_value(&data.plugin_states).map_err(|x| format!("failed to serialize: {x}"));
    resp
}

#[tauri::command]
pub(crate) async fn get_import_path_for_plugin<R: Runtime>(
    app: tauri::AppHandle<R>,
    plugin_id: String,
) -> Result<serde_json::Value, String> {
    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let data = state.read().await;
    if let Some(x) = data.plugin_states.get(&plugin_id) {
        let http_state = app.state::<HttpServerState>();
        let import = http_state.make_import_base(x);
        Ok(
            json!({"success": true, "import": format!("{import}/index.js"), "hash": x.frontend_hash.clone()}),
        )
    } else {
        Ok(json!({"success": false, "reason": "PLUGIN_NOT_FOUND"}))
    }
}

#[tauri::command]
pub(crate) async fn open_settings<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("settings") {
        _ = win.set_focus()
    } else {
        let win = tauri::WebviewWindowBuilder::new(
            &app,
            "settings",
            tauri::WebviewUrl::App("index.html#/settings".into()),
        )
        .build()
        .unwrap();
        _ = win.set_title("EDPF Settings");
        _ = win.set_focus()
    }
    Ok(())
}
