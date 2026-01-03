use std::{path::PathBuf, str::FromStr, sync::Arc};

use chrono::{DateTime, Utc};
use dirs::data_local_dir;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{ipc::Channel, path::BaseDirectory, Emitter, Manager, Runtime};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_store::StoreExt;
use tauri_plugin_updater::UpdaterExt;
use tokio::sync::RwLock;
use tracing::{error, warn};

use crate::{
    plugins::{commands_armor, plugin_settings, PluginStateSource},
    updates::{PendingUpdate, ReleaseChannel},
};

use super::{
    frontend_server::HttpServerState,
    generic_plugin_settings::{GenericPluginSettings, PluginsUiConfig},
    plugin_settings::parse_key,
    PluginsState,
};

#[tauri::command]
pub(crate) async fn fetch_all_plugins<R: Runtime>(
    app: tauri::AppHandle<R>,
    payload: String,
    iv: String,
) -> serde_json::Value {
    let state = app.state::<Arc<RwLock<PluginsState>>>();

    #[derive(Deserialize)]
    struct Input {} // admittedly, this is a bit silly
    let data = state.read().await;
    if let Err(e) = commands_armor::decrypt_str::<Input>(&data.root_token, &iv, &payload) {
        return e.into();
    };

    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let data = state.read().await;

    let response = match serde_json::to_value(&data.plugin_states) {
        Ok(x) => x,
        Err(_) => return json!({"success": false, "reason": "INTERNAL_FAILED_CONVERSION"}),
    };

    match commands_armor::encrypt(&data.root_token, &response) {
        Ok(encrypted_with_iv) => encrypted_with_iv,
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub(crate) async fn open_url<R: Runtime>(
    app: tauri::AppHandle<R>,
    payload: String,
    iv: String,
) -> serde_json::Value {
    let state = app.state::<Arc<RwLock<PluginsState>>>();

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Input {
        plugin_id: String, // unused, maybe relevant later
        url: String,
    }

    let data = state.read().await;

    let url = match commands_armor::decrypt_str::<Input>(&data.root_token, &iv, &payload) {
        Err(e) => return e.into(),
        Ok(data) => data.url,
    };

    match app.opener().open_url(url, None::<&str>) {
        Ok(_) => json!({"success": true}),
        Err(x) => json!({"success": false, "reason": x}),
    }
}

#[tauri::command]
pub(crate) async fn check_update_edpf<R: Runtime>(
    app: tauri::AppHandle<R>,
    payload: String,
    iv: String,
) -> serde_json::Value {
    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let data = state.read().await;

    #[derive(Deserialize)]
    struct Input {
        channel: ReleaseChannel,
    }
    if let Err(e) = commands_armor::decrypt_str::<Input>(&data.root_token, &iv, &payload) {
        return e.into();
    };

    let pending_update_state = app.state::<PendingUpdate>();

    let endpoint = ReleaseChannel::Prerelease.infer_endpoint();

    let updater = match match app.updater_builder().endpoints(vec![endpoint]) {
        Ok(x) => x,
        Err(e) => return json!({"err": e, "hint": "build endpoints"}),
    }
    .build()
    {
        Ok(x) => x,
        Err(e) => return json!({"err": e, "hint": "build updater"}),
    };

    let update_check_response = match updater.check().await {
        Ok(x) => x,
        Err(e) => return json!({"err": e, "hint": "look for updates"}),
    };

    #[derive(Serialize)]
    struct Response {
        new_version: String,
        current_version: String,
    }

    let command_resp = update_check_response.as_ref().map(|update| Response {
        new_version: update.version.clone(),
        current_version: update.current_version.clone(),
    });

    *pending_update_state.0.lock().unwrap() = update_check_response;

    match commands_armor::encrypt(&data.root_token, &command_resp) {
        Ok(encrypted_with_iv) => encrypted_with_iv,
        Err(e) => e.into(),
    }
}

#[tauri::command]
pub(crate) async fn commit_update_edpf<R: Runtime>(
    app: tauri::AppHandle<R>,
    payload: String,
    iv: String,
    on_event: Channel<serde_json::Value>,
) -> serde_json::Value {
    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let data = state.read().await;

    #[derive(Deserialize)]
    struct Input {}

    if let Err(e) = commands_armor::decrypt_str::<Input>(&data.root_token, &iv, &payload) {
        return e.into();
    };
    let pending_update_state = app.state::<PendingUpdate>();

    let mut started = false;
    let Some(update) = pending_update_state.0.lock().unwrap().take() else {
        return json!({"success": false, "reason": "NO_PENDING_UPDATE"});
    };

    match update
        .download_and_install(
            |chunk_len, content_len| {
                if !started {
                    let _ = on_event.send(json!({"type": "Started", "content_len": content_len}));
                    started = true;
                }

                let _ = on_event.send(json!({"type": "Progress", "chunk_len": chunk_len }));
            },
            || {
                let _ = on_event.send(json!({"type": "Finished"}));
            },
        )
        .await
    {
        Ok(_) => {
            json!({"success": true})
        }
        Err(e) => {
            json!({"success": false, "reason": "UPDATE_FAILED", "meta": e})
        }
    }
}

#[tauri::command]
pub(crate) async fn get_import_path_for_plugin<R: Runtime>(
    app: tauri::AppHandle<R>,
    payload: String,
    iv: String,
) -> serde_json::Value {
    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let data = state.read().await;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Input {
        plugin_id: String,
    }
    let payload = match commands_armor::decrypt_str::<Input>(&data.root_token, &iv, &payload) {
        Ok(x) => x,
        Err(e) => return e.into(),
    };

    if let Some(x) = data.plugin_states.get(&payload.plugin_id) {
        let http_state = app.state::<HttpServerState>();
        let import = http_state.make_import_base(x);

        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct Response {
            hash: String,
            import: String,
        }

        match commands_armor::encrypt(
            &data.root_token,
            &Response {
                hash: x.frontend_hash.clone(),
                import: format!("{import}/index.js"),
            },
        ) {
            Ok(encrypted_with_iv) => encrypted_with_iv,
            Err(e) => e.into(),
        }
    } else {
        json!({"success": false, "reason": "PLUGIN_NOT_FOUND"})
    }
}

#[tauri::command]
pub(crate) async fn open_plugins_dir<R: Runtime>(
    app: tauri::AppHandle<R>,
    payload: String,
    iv: String,
) -> serde_json::Value {
    use tauri_plugin_opener::OpenerExt;
    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let data = state.read().await;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Input {
        plugin_id: Option<String>,
    }
    let payload = match commands_armor::decrypt_str::<Input>(&data.root_token, &iv, &payload) {
        Ok(x) => x,
        Err(e) => return e.into(),
    };

    let plugin_id = match payload.plugin_id {
        Some(x) => x,
        None => {
            // no plugin ID specified -> we return the user plugin folder
            let user_plugin_dir: String = match app.store("store.json") {
                Ok(x) => x,
                Err(e) => {
                    error!("failed to open store.json: {e}");
                    return json!({"success": false, "reason": "INTERNAL_FETCH_STORE_ERROR"});
                }
            }
            .get("plugin_dir")
            .and_then(|x| {
                let x = x.to_string();
                PathBuf::from_str(&x).ok()
            })
            .unwrap_or(data_local_dir().unwrap().join("edpf-plugins"))
            .display()
            .to_string();
            if let Err(e) = app.opener().open_path(user_plugin_dir, None::<&str>) {
                error!("failed to open dir: {e}");
                return json!({"success": false, "reason": "INTERNAL_OPEN_PLUGIN_DIR_ERROR"});
            }
            return json!({"success": true});
        }
    };

    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let data = state.read().await;
    if let Some(x) = data.plugin_states.get(&plugin_id) {
        if x.source != PluginStateSource::UserProvided {
            json!({"success": false, "reason": "PLUGIN_NOT_USERPROVIDED"})
        } else {
            if let Err(e) = app.opener().open_path(
                x.frontend_path().parent().unwrap().display().to_string(),
                None::<&str>,
            ) {
                error!("failed to open dir: {e}");
                return json!({"success": false, "reason": "INTERNAL_OPEN_PLUGIN_DIR_ERROR"});
            }

            json!({"success": true})
        }
    } else {
        json!({"success": false, "reason": "PLUGIN_NOT_FOUND"})
    }
}

#[tauri::command]
pub(crate) async fn open_settings<R: Runtime>(
    app: tauri::AppHandle<R>,
    payload: String,
    iv: String,
) -> serde_json::Value {
    let state = app.state::<Arc<RwLock<PluginsState>>>();

    #[derive(Deserialize)]
    struct Input {} // admittedly, this is a bit silly
    let data = state.read().await;
    if let Err(e) = commands_armor::decrypt_str::<Input>(&data.root_token, &iv, &payload) {
        return e.into();
    };

    let resp = if let Some(win) = app.get_webview_window("settings") {
        win.set_focus()
    } else {
        let win = tauri::WebviewWindowBuilder::new(
            &app,
            "settings",
            tauri::WebviewUrl::App("index.html#/settings".into()),
        )
        .title("EDPF Settings")
        .build()
        .unwrap();
        win.set_focus()
    };

    match resp {
        Ok(_) => {
            json!({"success": true})
        }
        Err(e) => {
            json!({"success": false, "reason": e.to_string()})
        }
    }
}

#[tauri::command]
pub(crate) async fn start_plugin<R: Runtime>(
    app: tauri::AppHandle<R>,
    payload: String,
    iv: String,
) -> Value {
    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let mut data = state.write().await;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Input {
        plugin_id: String,
    }
    let payload = match commands_armor::decrypt_str::<Input>(&data.root_token, &iv, &payload) {
        Ok(x) => x,
        Err(e) => return e.into(),
    };

    let mut settings = match GenericPluginSettings::get_by_id(&app, &payload.plugin_id) {
        Ok(it) => it,
        Err(err) => {
            error!("failed to get generic plugin settings by ID: {err}");
            return json!({"success": false, "reason": "INTERNAL_MISSING_GENERAL_SETTINGS"});
        }
    }
    .unwrap_or_default();
    if !settings.enabled {
        settings.enabled = true;
        _ = settings.commit(&app, &payload.plugin_id)
    }

    match data.start(payload.plugin_id, &app).await {
        Ok(_) => {
            json!({"success": true})
        }
        Err(e) => {
            json!({"success": false, "reason": e.to_string()})
        }
    }
}

#[tauri::command]
pub(crate) async fn finalize_start_plugin<R: Runtime>(
    app: tauri::AppHandle<R>,
    payload: String,
    iv: String,
) -> Value {
    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let mut data = state.write().await;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Input {
        plugin_id: String,
    }
    let payload = match commands_armor::decrypt_str::<Input>(&data.root_token, &iv, &payload) {
        Ok(x) => x,
        Err(e) => return e.into(),
    };

    match data.finalize_start(payload.plugin_id, &app).await {
        Ok(_) => {
            json!({"success": true})
        }
        Err(e) => {
            json!({"success": false, "reason": e.to_string()})
        }
    }
}

#[tauri::command]
pub(crate) async fn start_plugin_failed<R: Runtime>(
    app: tauri::AppHandle<R>,
    payload: String,
    iv: String,
) -> Value {
    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let mut data = state.write().await;
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Input {
        plugin_id: String,
        reasons: Vec<String>,
    }
    let payload = match commands_armor::decrypt_str::<Input>(&data.root_token, &iv, &payload) {
        Ok(x) => x,
        Err(e) => return e.into(),
    };
    match data
        .start_failed(payload.plugin_id, payload.reasons, &app)
        .await
    {
        Ok(_) => {
            json!({"success": true})
        }
        Err(e) => {
            json!({"success": false, "reason": e.to_string()})
        }
    }
}

#[tauri::command]
pub(crate) async fn stop_plugin<R: Runtime>(
    app: tauri::AppHandle<R>,
    payload: String,
    iv: String,
) -> Value {
    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let mut data = state.write().await;
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Input {
        plugin_id: String,
    }
    let payload = match commands_armor::decrypt_str::<Input>(&data.root_token, &iv, &payload) {
        Ok(x) => x,
        Err(e) => return e.into(),
    };

    let mut settings = match GenericPluginSettings::get_by_id(&app, &payload.plugin_id) {
        Ok(it) => it,
        Err(err) => {
            error!("failed to get generic plugin settings by ID: {err}");
            return json!({"success": false, "reason": "INTERNAL_MISSING_GENERAL_SETTINGS"});
        }
    }
    .unwrap_or_default();
    if settings.enabled {
        settings.enabled = false;
        _ = settings.commit(&app, &payload.plugin_id)
    }

    match data.stop(payload.plugin_id, &app).await {
        Ok(_) => {
            json!({"success": true})
        }
        Err(e) => {
            json!({"success": false, "reason": e.to_string()})
        }
    }
}

#[tauri::command]
pub(crate) async fn finalize_stop_plugin<R: Runtime>(
    app: tauri::AppHandle<R>,
    payload: String,
    iv: String,
) -> Value {
    let state = app.state::<Arc<RwLock<PluginsState>>>();

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Input {
        plugin_id: String,
    }
    let mut data = state.write().await;
    let payload = match commands_armor::decrypt_str::<Input>(&data.root_token, &iv, &payload) {
        Ok(x) => x,
        Err(e) => return e.into(),
    };
    match data.finalize_stop(payload.plugin_id, &app).await {
        Ok(_) => {
            json!({"success": true})
        }
        Err(e) => {
            json!({"success": false, "reason": e.to_string()})
        }
    }
}

#[tauri::command]
pub(crate) async fn get_plugin<R: Runtime>(
    app: tauri::AppHandle<R>,
    payload: String,
    iv: String,
) -> Value {
    let state = app.state::<Arc<RwLock<PluginsState>>>();

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Input {
        plugin_id: String,
    }
    let data = state.read().await;
    let payload = match commands_armor::decrypt_str::<Input>(&data.root_token, &iv, &payload) {
        Ok(x) => x,
        Err(e) => return e.into(),
    };

    match data.plugin_states.get(&payload.plugin_id).cloned() {
        None => json!({"success": false, "reason": "PLUGIN_STATE_NOT_FOUND"}),
        Some(state) => match commands_armor::encrypt(&data.root_token, &state) {
            Ok(encrypted_with_iv) => encrypted_with_iv,
            Err(e) => e.into(),
        },
    }
}

/// Write a Setting. On success, get back the value in the response. The response is the stored value, meaning any serializing has taken place.
#[tauri::command]
pub(crate) async fn write_setting<R: Runtime>(
    app: tauri::AppHandle<R>,
    payload: String,
    iv: String,
) -> serde_json::Value {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Input {
        plugin_id: String,
        key: String,
        value: serde_json::Value,
    }
    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let data = state.read().await;
    let payload = match commands_armor::decrypt_str::<Input>(&data.root_token, &iv, &payload) {
        Ok(x) => x,
        Err(e) => return e.into(),
    };

    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let data = state.read().await;
    let plugin_state = match data.get_cloned(&payload.plugin_id) {
        Some(x) => x,
        None => return json!({"success": false, "reason": "PLUGIN_STATE_NOT_FOUND"}),
    };

    // each plugin stores settings in its own file
    let key = match parse_key(&payload.key) {
        Ok(x) => x,
        Err(e) => return json!({"success": false, "reason": e}),
    };

    if !key.is_writable_by(&plugin_state.id) {
        return json!({"success": false, "reason": "SECRET_NOT_WRITABLE_MISSING_PERMISSION"});
    }

    let resp_value = match plugin_settings::write_setting(&app, &key, payload.value) {
        Ok(parsed_val) => parsed_val,
        Err(_) => return json!({"success": false, "reason": "FAILED_WRITE"}),
    };

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Response {
        value: serde_json::Value,
        key: String,
    }

    let resp = Response {
        key: payload.key,
        value: resp_value,
    };
    let encrypted = match commands_armor::encrypt(&data.root_token, &resp) {
        Ok(encrypted_with_iv) => encrypted_with_iv,
        Err(e) => return e.into(),
    };

    _ = app.emit("settings_update", &encrypted);
    encrypted
}

/// Write a Setting. On success, get back the value in the response. The response is the stored value, meaning any serializing has taken place.
#[tauri::command]
pub(crate) async fn read_setting<R: Runtime>(
    app: tauri::AppHandle<R>,
    payload: String,
    iv: String,
) -> serde_json::Value {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Input {
        plugin_id: String,
        key: String,
    }
    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let data = state.read().await;
    let payload = match commands_armor::decrypt_str::<Input>(&data.root_token, &iv, &payload) {
        Ok(x) => x,
        Err(e) => return e.into(),
    };

    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let data = state.read().await;

    let plugin_state = match data.get_cloned(&payload.plugin_id) {
        Some(x) => x,
        None => return json!({"success": false, "reason": "MISSING_OR_BAD_TOKEN"}),
    };

    // each plugin stores settings in its own file
    let key = match parse_key(&payload.key) {
        Ok(x) => x,
        Err(e) => return json!({"success": false, "reason": e}),
    };

    if !key.is_readable_by(&plugin_state.id) {
        return json!({"success": false, "reason": "SECRET_NOT_READABLE_MISSING_PERMISSION"});
    }

    let resp_value = match plugin_settings::read_setting(&app, &key) {
        Ok(x) => x,
        Err(_) => return json!({"success": false, "reason": "FAILED_READ"}),
    };

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Response {
        value: Option<serde_json::Value>,
        key: String,
    }

    let resp = Response {
        value: resp_value,
        key: payload.key,
    };

    match commands_armor::encrypt(&data.root_token, &resp) {
        Ok(encrypted_with_iv) => encrypted_with_iv,
        Err(e) => e.into(),
    }
}

/// This command looks at all active CMDR journals (taken from last updated) and returns their entire contents
#[tauri::command]
pub(crate) async fn reread_active_journal<R: Runtime>(app: tauri::AppHandle<R>) -> Value {
    let state = app
        .state::<Arc<RwLock<bimap::BiMap<String, PathBuf>>>>()
        .inner()
        .clone();

    let items: Vec<(String, PathBuf)> = {
        let data = state.read().await;
        data.iter()
            .map(|(cmdr, path)| (cmdr.clone(), path.clone()))
            .collect()
    };

    #[derive(Serialize)]
    struct Response {
        cmdr: String,
        file: PathBuf,
        entries: Vec<String>,
    }
    let futures = items.into_iter().map(|(cmdr, path)| async move {
        let mut reader = match ed_journals::logs::asynchronous::RawLogFileReader::open(&path).await
        {
            Ok(x) => x,
            Err(e) => {
                error!(
                    "failed to open journal to reread: {}, skipping. reason: {}",
                    path.display(),
                    e
                );
                return None; // skip this one
            }
        };

        let mut entries = Vec::new();
        while let Some(res) = reader.next().await {
            match res {
                Ok(ev) => entries.push(serde_json::to_string(&ev).unwrap()),
                Err(err) => {
                    warn!(
                        "failed to read entry in {}: {err}, skipping entry",
                        path.display()
                    );
                }
            }
        }

        Some(Response {
            cmdr,
            file: path,
            entries,
        })
    });
    // We run the fetching / collecting of existing lines in parallel
    let results = futures::future::join_all(futures).await;
    // get rid of any Nones (skipped / errored)
    let response: Vec<_> = results.into_iter().flatten().collect();

    let root_token = {
        let state = app.state::<Arc<RwLock<PluginsState>>>();
        let data = state.read().await;
        data.root_token
    };

    match commands_armor::encrypt(&root_token, &response) {
        Ok(encrypted_with_iv) => encrypted_with_iv,
        Err(e) => e.into(),
    }
}

/// This command is invoked by the PluginManager when elements in the UI are moved around. This same command is used to just fetch the config
#[tauri::command]
pub(crate) async fn sync_main_layout<R: Runtime>(
    app: tauri::AppHandle<R>,
    payload: String,
    iv: String,
) -> Value {
    let state = app.state::<Arc<RwLock<PluginsState>>>();
    let data = state.read().await;
    let layout = {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Input {
            layout: Option<PluginsUiConfig>,
        }
        match commands_armor::decrypt_str::<Input>(&data.root_token, &iv, &payload) {
            Ok(x) => x.layout,
            Err(e) => return e.into(),
        }
    };

    let resp = match GenericPluginSettings::sync_ui_layout(&app, layout) {
        Ok(x) => x,
        Err(e) => return json!({"success": true, "data": format!("failed to sync ui layout: {e}")}),
    };

    match commands_armor::encrypt(&data.root_token, &resp) {
        Ok(encrypted_with_iv) => encrypted_with_iv,
        Err(e) => e.into(),
    }
}
