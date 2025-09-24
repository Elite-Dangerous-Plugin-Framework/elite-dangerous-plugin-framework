use std::{path::PathBuf, str::FromStr, sync::Arc};

use dirs::data_local_dir;
use serde_json::{json, Value};
use tauri::{Manager, Runtime};
use tauri_plugin_store::StoreExt;
use tokio::sync::RwLock;
use tracing::warn;

use crate::plugins::PluginStateSource;

use super::{
    frontend_server::HttpServerState,
    plugin_settings::{PluginSettings, PluginsUiConfig},
    PluginsState,
};

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
pub(crate) async fn open_plugins_dir<R: Runtime>(
    app: tauri::AppHandle<R>,
    plugin_id: Option<String>,
) -> Result<serde_json::Value, String> {
    use tauri_plugin_opener::OpenerExt;

    let plugin_id = match plugin_id {
        Some(x) => x,
        None => {
            // no plugin ID specified -> we return the user plugin folder
            let user_plugin_dir: String = app
                .store("store.json")
                .map_err(|x| format!("couldn't get store: {x}"))?
                .get("plugin_dir")
                .and_then(|x| {
                    let x = x.to_string();
                    PathBuf::from_str(&x).ok()
                })
                .unwrap_or(data_local_dir().unwrap().join("edpf-plugins"))
                .display()
                .to_string();
            app.opener()
                .open_path(user_plugin_dir, None::<&str>)
                .map_err(|x| format!("failed to open dir: {x}"))?;
            return Ok(json!({"success": true}));
        }
    };

    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let data = state.read().await;
    if let Some(x) = data.plugin_states.get(&plugin_id) {
        if x.source != PluginStateSource::UserProvided {
            Ok(json!({"success": false, "reason": "PLUGIN_NOT_USERPROVIDED"}))
        } else {
            app.opener()
                .open_path(
                    x.frontend_path().parent().unwrap().display().to_string(),
                    None::<&str>,
                )
                .map_err(|x| format!("failed to open dir: {x}"))?;
            Ok(json!({"success": true}))
        }
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

#[tauri::command]
pub(crate) async fn start_plugin<R: Runtime>(
    app: tauri::AppHandle<R>,
    plugin_id: String,
) -> Result<Value, String> {
    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let mut data = state.write().await;

    let mut settings = PluginSettings::get_by_id(&app, &plugin_id)
        .map_err(|x| format!("{}", x))?
        .unwrap_or_default();
    if !settings.enabled {
        settings.enabled = true;
        _ = settings.commit(&app, &plugin_id)
    }

    Ok(match data.start(plugin_id, &app).await {
        Ok(_) => {
            json!({"success": true})
        }
        Err(e) => {
            json!({"success": false, "reason": e.to_string()})
        }
    })
}

#[tauri::command]
pub(crate) async fn finalize_start_plugin<R: Runtime>(
    app: tauri::AppHandle<R>,
    plugin_id: String,
) -> Result<Value, String> {
    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let mut data = state.write().await;
    Ok(match data.finalize_start(plugin_id, &app).await {
        Ok(_) => {
            json!({"success": true})
        }
        Err(e) => {
            json!({"success": false, "reason": e.to_string()})
        }
    })
}

/// This command is invoked by the PluginManager when elements in the UI are moved around. This same command is used to just fetch the config
#[tauri::command]
pub(crate) async fn sync_main_layout<R: Runtime>(
    app: tauri::AppHandle<R>,
    layout: Option<PluginsUiConfig>,
) -> Result<Value, String> {
    let resp = PluginSettings::sync_ui_layout(&app, layout)
        .map_err(|x| format!("failed to sync ui layout: {x}"))?;
    Ok(json!({
        "success": true,
        "data": resp
    }))
}

#[tauri::command]
pub(crate) async fn start_plugin_failed<R: Runtime>(
    app: tauri::AppHandle<R>,
    plugin_id: String,
    reasons: Vec<String>,
) -> Result<Value, String> {
    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let mut data = state.write().await;
    Ok(match data.start_failed(plugin_id, reasons, &app).await {
        Ok(_) => {
            json!({"success": true})
        }
        Err(e) => {
            json!({"success": false, "reason": e.to_string()})
        }
    })
}

#[tauri::command]
pub(crate) async fn stop_plugin<R: Runtime>(
    app: tauri::AppHandle<R>,
    plugin_id: String,
) -> Result<Value, String> {
    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let mut data = state.write().await;
    let mut settings = PluginSettings::get_by_id(&app, &plugin_id)
        .map_err(|x| format!("{}", x))?
        .unwrap_or_default();
    if settings.enabled {
        settings.enabled = false;
        _ = settings.commit(&app, &plugin_id)
    }

    Ok(match data.stop(plugin_id, &app).await {
        Ok(_) => {
            json!({"success": true})
        }
        Err(e) => {
            json!({"success": false, "reason": e.to_string()})
        }
    })
}

#[tauri::command]
pub(crate) async fn finalize_stop_plugin<R: Runtime>(
    app: tauri::AppHandle<R>,
    plugin_id: String,
) -> Result<Value, String> {
    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let mut data = state.write().await;
    Ok(match data.finalize_stop(plugin_id, &app).await {
        Ok(_) => {
            json!({"success": true})
        }
        Err(e) => {
            json!({"success": false, "reason": e.to_string()})
        }
    })
}

#[tauri::command]
pub(crate) async fn get_plugin_by_instance_id<R: Runtime>(
    app: tauri::AppHandle<R>,
    instance_id: String,
) -> Result<Value, String> {
    let state = app.state::<Arc<RwLock<PluginsState>>>();

    let data = state.read().await;

    Ok(match data.get_cloned_by_runtime_token(&instance_id) {
        Some(x) => {
            json!({"success": true, "data": x})
        }
        None => {
            json!({"success": false, "reason": "MISSING_OR_BAD_TOKEN"})
        }
    })
}

#[tauri::command]
pub(crate) async fn get_instance_id_by_plugin<R: Runtime>(
    app: tauri::AppHandle<R>,
    plugin_id: String,
    root_token: String,
) -> Result<Value, String> {
    let state = app.state::<Arc<RwLock<PluginsState>>>();

    let data = state.read().await;

    Ok(
        match data.get_runtime_token_by_root_token(&plugin_id, &root_token) {
            Some(x) => {
                json!({"success": true, "data": x})
            }
            None => {
                json!({"success": false, "reason": "MISSING_OR_BAD_TOKEN"})
            }
        },
    )
}
