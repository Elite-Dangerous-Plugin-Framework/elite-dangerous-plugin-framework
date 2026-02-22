use base64::{prelude::BASE64_STANDARD_NO_PAD, Engine};
use notify::{RecommendedWatcher, Watcher};
use plugin_manifest::PluginManifest;
use rand::RngCore;
use reconciler::get_user_plugins_dir;
use schemars::JsonSchema;
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    fmt::Debug,
    path::{Component, Path, PathBuf},
    sync::{Arc, OnceLock},
    time::Duration,
};
use tauri::{async_runtime::Sender, AppHandle, Emitter, Manager, Runtime, Wry};
use tokio::{fs, sync::RwLock};
use tokio::{sync::mpsc, time::sleep};
use tracing::{error, info, instrument, warn};

pub(crate) mod additional_capabilities;
pub(crate) mod commands;
pub(crate) mod commands_armor;
pub(crate) mod frontend_server;
pub(crate) mod generic_plugin_settings;
pub(crate) mod plugin_manifest;
pub(crate) mod plugin_settings;
mod reconciler;

/// Lazy-init'd list of all internal plugins. There might be better ways to do it, but for now this is hand-adjusted.
/// If we add a plugin here we **MUST** also ensure that it is present in the plugins folder at
/// `assets/plugins/$pluginID`
pub(crate) fn internal_plugin_ids() -> &'static [&'static str] {
    static MEM: OnceLock<Vec<&str>> = OnceLock::new();
    MEM.get_or_init(|| vec!["core"]).as_slice()
}

pub(crate) struct _PluginReconcileReceiver {
    pub(crate) tx: Sender<String>,
}

pub(crate) type PluginReconcileReceiver = Arc<_PluginReconcileReceiver>;

/// This function never finishes. It spawns a reconciler, then polls in loop for changes. Expected to be run in a thread / task.
#[instrument(skip(app_state))]
pub(super) async fn spawn_reconciler_blocking(app_state: &AppHandle<Wry>) -> () {
    let (tx, mut rx) = mpsc::channel(1024);
    let plugin_reconciler_receiver = Arc::new(_PluginReconcileReceiver { tx: tx.clone() });
    // The App manages our Plugin Reconcile Receiver. This means we can trigger a reconcile from whereever in our App.
    app_state.manage::<PluginReconcileReceiver>(plugin_reconciler_receiver);

    let user_plugin_dir = get_user_plugins_dir(app_state).unwrap();
    let moved_user_plugin_dir = user_plugin_dir.clone();

    // Note that we only watch for changes in User plugins.
    // We make the assumption that bundled plugins do not change over time.
    let watcher_tx = tx.clone();
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| match res {
            Ok(ev) => {
                let plugin_in_need_of_update = match ev.kind {
                    notify::EventKind::Create(_)
                    | notify::EventKind::Modify(_)
                    | notify::EventKind::Remove(_) => {
                        matches_relevant_files(&ev.paths, &moved_user_plugin_dir)
                    }
                    _ => None,
                };
                if let Some(x) = plugin_in_need_of_update {
                    info!("plugin in need of update: {}", &x);
                    if let Err(x) = watcher_tx.try_send(x) {
                        match x {
                            mpsc::error::TrySendError::Full(_) => {
                                warn!("reconciler event dropped - queue full")
                            }
                            mpsc::error::TrySendError::Closed(_) => {
                                warn!("reconcile event dropped - noone picking up the event")
                            }
                        }
                    }
                }
            }
            Err(_) => {
                warn!("rx error while using plugin dir listener. ignoring")
            }
        },
        Default::default(),
    )
    .unwrap();
    // At the start, lets also reconcile ALL plugins
    // This means looking at the user dir and our embedded plugins
    // Check that the Plugin Dir exists. If it doesn't, create it.
    if !user_plugin_dir.exists() {
        info!(
            "User Plugin Directory doesn't exist yet. Attempting to create directory at {}",
            user_plugin_dir.display()
        );
        std::fs::create_dir_all(&user_plugin_dir).unwrap();
    }

    let mut existing_plugin_ids = vec![];

    for x in internal_plugin_ids() {
        existing_plugin_ids.push(x.to_string());
    }

    for maybe_plugin in std::fs::read_dir(&user_plugin_dir).unwrap().flatten() {
        match fs::metadata(maybe_plugin.path()).await {
            Ok(x) => {
                if !x.is_dir() {
                    continue;
                }
            }
            Err(_) => continue,
        }
        let plugin_name = maybe_plugin.file_name().to_string_lossy().to_string();
        existing_plugin_ids.push(plugin_name);
    }

    for plugin in existing_plugin_ids {
        tx.send(plugin).await.unwrap();
    }

    watcher
        .watch(&user_plugin_dir, notify::RecursiveMode::Recursive)
        .unwrap();

    let debounce_duration = Duration::from_millis(50);
    let mut pending = HashSet::new();

    loop {
        tokio::select! {
            Some(item) = rx.recv() => {
                pending.insert(item);
                sleep(debounce_duration).await;

                while let Ok(item) = rx.try_recv() {
                    pending.insert(item);
                }

                let mut any_change = false;
                for item in pending.drain() {
                    match reconciler::reconcile_specific_plugin(item, app_state).await {
                        Err(e) => {
                            error!("reconcile failed: {e}")
                        },
                        Ok(true) => {
                            any_change = true
                        }
                        Ok(false) => {}
                    }
                }

                if any_change {
                    let state = app_state.state::<Arc<RwLock<PluginsState>>>();
                    let (payload, encryption_token) = {
                        let data = state.read().await;
                        (data.plugin_states.clone(), data.root_token)
                    };
                    _ = app_state.emit("core/plugins/update", match commands_armor::encrypt(&encryption_token, &payload) {
                        Ok(encrypted_with_iv) => encrypted_with_iv,
                        Err(e) => e.into(),
                    })
                }
            }

            else => break
        }
    }
}

/// Returns the plugin ID if any of the paths matches:
/// 1. $base/*/manifest.json
/// 2. $base/*/frontend/**
#[instrument(skip(paths))]
fn matches_relevant_files(paths: &[PathBuf], base: &Path) -> Option<String> {
    for p in paths {
        // Must start with the base directory
        if !p.starts_with(base) {
            continue;
        }

        // Get the path components *after* the base
        let mut comps = match p.strip_prefix(base) {
            Ok(x) => x,
            Err(_) => continue,
        }
        .components()
        .peekable();

        // Must have at least one component after base
        let plugin_id = match comps.next() {
            Some(Component::Normal(x)) => match x.to_str() {
                Some(x) => x.to_string(),
                None => continue,
            },
            _ => continue,
        };

        // Match on $path/*/manifest.json
        if comps.clone().count() == 1 {
            if let Some(last) = comps.peek() {
                if last.as_os_str() == "manifest.json" {
                    info!("found change in manifest");
                    return Some(plugin_id);
                }
            }
        }

        // Match on $path/*/frontend/**
        if let Some(first_after) = comps.peek() {
            if first_after.as_os_str() == "frontend" {
                // Anything under frontend/, including nested directories, matches
                info!("found change in frontend");
                return Some(plugin_id);
            }
        }
    }
    None
}

/// "Meta-state". This reflects the current state of a plugin in the frontend. The Backend will *never* write its state directly. Only way to modify this state is via
#[derive(Serialize, Clone)]
pub(crate) struct FrontendPluginsState {
    /// This data is arbitrary, it's structure is entirely owned by the frontend
    /// The only time the backend writes this is when prompted via a command by the frontend
    pub(crate) data: serde_json::Value,
}

impl FrontendPluginsState {
    pub(crate) fn new() -> Self {
        FrontendPluginsState { data: json!({}) }
    }
}

#[derive(Serialize, Clone)]
pub(crate) struct PluginsState {
    plugin_states: HashMap<String, PluginState>,
    /// This is the "admin" token, if you want. It's an AES-128 GCM Cipher. We pass this cipher to the main and settings windows **before** the contexts are tainted by importing plugins.
    ///
    /// Commands and Events are encrypted with this Cipher. This way, Plugins cannot just invoke window.__TAURI or import Tauri and invoke commands at will and must go through the Facade provided
    /// to them by EDPF.
    ///
    /// The only way to get this Token is by calling the [get_root_token_once] command. As the name implies, this can be only called once **PER WINDOW LIFECYCLE**. Subsequent requests are rejected.
    /// The backend listens for Webview Reloads and resets the lock if a Reload is completed. This is tracked in [PluginsState::allow_request_root_key_main] and [PluginsState::allow_request_root_key_settings] respectively.
    ///
    /// Because the main window is called before any plugins, it can acquire it first. If a Plugin somehow manages to call [get_root_token_once], that call is rejected.
    #[serde(skip_serializing)]
    root_token: [u8; 16],
    /// intialized to false. When we receive the signal that the main window is ready, this is set to `true`. The main window may then invoke [get_root_token_once] to get the [PluginsState::root_token], which it needs to decrypt events and invoke commands.
    #[serde(skip_serializing)]
    pub(super) allow_request_root_key_main: bool,
    /// see [PluginsState::allow_request_root_key_main] - the difference is that this concerns the settings Window
    #[serde(skip_serializing)]
    pub(super) allow_request_root_key_settings: bool,
}

impl Debug for PluginsState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PluginsState")
            .field("plugin_states", &self.plugin_states)
            .field(
                "allow_request_root_key_main",
                &self.allow_request_root_key_main,
            )
            .field(
                "allow_request_root_key_settings",
                &self.allow_request_root_key_settings,
            )
            .finish()
    }
}

/// This is called at the start of a window's lifecycle.
/// When doing so, the caller gets back a 128bit AES GCM key, commonly referred to as the "root token" in the rest of the system.
/// Tauri events are encrypted with this root token, and most commands require the payload to also be encrypted this way.
///
/// The idea here is that the respective Windows (`main` and `settings`) call this at the very start, before they have started loading plugins.
/// They can fetch the root token and store it internally, outside of the plugin's reach.
///
/// If a rogue plugin would try to request this token afterwards, it gets rejected, as loading this token is only allowed once per Webview Load.
/// if the window gets unloaded and reloaded, a Tauri-internal event is emitted. After the reload, we can assume that the context is untainted again, which is why we set back [PluginsState::allow_request_root_key_main] and [PluginsState::allow_request_root_key_settings].
///
#[tauri::command]
pub(crate) async fn get_root_token_once<R: Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window,
) -> Result<Value, String> {
    let state = app.state::<Arc<RwLock<PluginsState>>>();

    let mut data = state.write().await;

    let is_main = match window.label() {
        "main" => true,
        "settings" => false,
        _ => {
            return Ok(json!({"success": false, "reason": "CALLED_FROM_INVALID_WINDOW"}));
        }
    };

    let can_request = match is_main {
        true => data.allow_request_root_key_main,
        false => data.allow_request_root_key_settings,
    };

    if !can_request {
        // During dev we might reload the window. To not cause any annoyances and having the fully restart the app, we ignore the case that
        // the root token was already requested.
        return Ok(json!({"success": false, "reason": "TOKEN_ALREADY_REQUESTED"}));
    }

    match is_main {
        true => data.allow_request_root_key_main = false,
        false => data.allow_request_root_key_settings = false,
    }

    let encoded_token = BASE64_STANDARD_NO_PAD.encode(&data.root_token);
    Ok(json!({"success": true, "data":  encoded_token}))
}

impl PluginsState {
    /// this just creates an empty hashmap. Use reconcile function to sync the states
    pub(crate) fn new() -> Self {
        let mut root_token = [0u8; 16];
        rand::rng().fill_bytes(&mut root_token);

        Self {
            plugin_states: HashMap::new(),
            root_token,
            allow_request_root_key_main: false,
            allow_request_root_key_settings: false,
        }
    }

    pub(crate) fn get_cloned(&self, id: &str) -> Option<PluginState> {
        self.plugin_states.get(id).cloned()
    }
}

/// Defines the current state of the plugin. Mainly used for reconciliation.
//
/// NOTE: This does not contain the FRONTEND state.
/// The frontend state is reactive to this State and can be found in [PluginFrontendState].
///
#[derive(Debug, Serialize, Clone, JsonSchema, PartialEq, Eq)]
pub(crate) struct PluginState {
    id: String,
    configuration: generic_plugin_settings::GenericPluginSettings,
    plugin_dir: PathBuf,
    manifest: PluginManifest,
    source: PluginStateSource,
    frontend_hash: String,
}

impl PluginState {
    fn frontend_path(&self) -> PathBuf {
        self.plugin_dir.join("frontend")
    }
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq, JsonSchema)]
pub(crate) enum PluginStateSource {
    /// User-provided plugins are taken from the
    /// User-configured plugin directory.
    ///
    /// The plugin dir defaults to [dirs::data_local_dir]/edpf-plugins
    ///
    /// In here, we expect folders that contain a `manifest.json`. Only folders containing such a file are considered plugins
    UserProvided,
    /// This is an "official" plugin that is bundled into edpf
    /// We use a virtual file system to load all relevant assets
    ///
    /// Other than that, embedded plugins are identical to User-provided ones
    Embedded,
}
