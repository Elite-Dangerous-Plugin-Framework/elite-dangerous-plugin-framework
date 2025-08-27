use std::sync::Arc;

use tauri::{Manager, Runtime};
use tokio::sync::RwLock;

use super::PluginsState;

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
