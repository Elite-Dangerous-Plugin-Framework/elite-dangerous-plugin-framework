use std::{
    collections::{HashMap, HashSet},
    fmt::Debug,
    fs::File,
    path::{Path, PathBuf},
    str::FromStr,
    sync::Arc,
    time::Duration,
};

use aes_gcm::Aes128Gcm;
use anyhow::anyhow;
use base64::{prelude::BASE64_STANDARD_NO_PAD, Engine};
use bimap::BiHashMap;
use chrono::{TimeDelta, Utc};
use dirs::data_local_dir;
use generic_plugin_settings::GenericPluginSettings;
use get_dir_hash::Options;
use itertools::Itertools;
use notify::{RecommendedWatcher, Watcher};
use plugin_manifest::PluginManifest;
use rand::RngCore;
use reconciler_utils::ReconcileAction;
use schemars::JsonSchema;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Runtime, Wry};
use tauri_plugin_store::StoreExt;
use tokio::sync::RwLock;
use tracing::{debug, error, info, instrument, warn};

pub(crate) mod commands;
pub(crate) mod commands_armor;
pub(crate) mod frontend_server;
pub(crate) mod generic_plugin_settings;
pub(crate) mod plugin_manifest;
pub(crate) mod plugin_settings;
mod reconciler_utils;

#[instrument(skip(app_state))]
pub(super) async fn spawn_reconciler_blocking(app_state: &AppHandle<Wry>) -> () {
    let (tx, rx) = std::sync::mpsc::channel();

    let user_plugin_dir = app_state
        .store("store.json")
        .map_err(|x| anyhow!("couldn't get store: {x}"))
        .unwrap()
        .get("plugin_dir")
        .and_then(|x| {
            let x = x.to_string();
            PathBuf::from_str(&x).ok()
        })
        .unwrap_or(data_local_dir().unwrap().join("edpf-plugins"));
    let moved_user_plugin_dir = user_plugin_dir.clone();
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| match res {
            Ok(ev) => {
                let has_reason_to_update = match ev.kind {
                    notify::EventKind::Create(_)
                    | notify::EventKind::Modify(_)
                    | notify::EventKind::Remove(_) => {
                        matches_relevant_files(&ev.paths, &moved_user_plugin_dir)
                    }
                    _ => false,
                };
                if !has_reason_to_update {
                    return;
                }

                tx.send(has_reason_to_update).unwrap()
            }
            Err(_) => {
                warn!("rx error while using plugin dir listener. ignoring")
            }
        },
        Default::default(),
    )
    .unwrap();
    {
        let state = app_state.state::<Arc<RwLock<PluginsState>>>();
        info!("Running Plugin reconciler…");
        let mut state: tokio::sync::RwLockWriteGuard<'_, PluginsState> = state.write().await;
        if let Err(e) = state.reconcile(app_state).await {
            error!("plugin state reconcile failed: {e}")
        }
    }

    watcher
        .watch(&user_plugin_dir, notify::RecursiveMode::Recursive)
        .unwrap();

    let mut last_reconciled = Utc::now();

    loop {
        {
            let trigger_reconcile = rx.recv_timeout(Duration::from_secs(30)).unwrap_or(true);
            if !trigger_reconcile || Utc::now() - last_reconciled < TimeDelta::seconds(1) {
                // We debounce events here
                continue;
            }
            last_reconciled = Utc::now();
            let state = app_state.state::<Arc<RwLock<PluginsState>>>();
            info!("Running Plugin reconciler…");
            let mut state: tokio::sync::RwLockWriteGuard<'_, PluginsState> = state.write().await;
            if let Err(e) = state.reconcile(app_state).await {
                error!("plugin state reconcile failed: {e}")
            }
        }
    }
}

/// Returns true if any of the paths matches:
/// 1. $base/*/manifest.json
/// 2. $base/*/frontend/**
fn matches_relevant_files(paths: &[PathBuf], base: &Path) -> bool {
    paths.iter().any(|p| {
        // Must start with the base directory
        if !p.starts_with(base) {
            return false;
        }

        // Get the path components *after* the base
        let mut comps = match p.strip_prefix(base) {
            Ok(x) => x,
            Err(_) => return false,
        }
        .components()
        .peekable();

        // Must have at least one component after base
        match comps.next() {
            Some(_) => {}
            None => return false,
        };

        // Match on $path/*/manifest.json
        if comps.clone().count() == 1 {
            if let Some(last) = comps.peek() {
                if last.as_os_str() == "manifest.json" {
                    return true;
                }
            }
        }

        // Match on $path/*/frontend/**
        if let Some(first_after) = comps.peek() {
            if first_after.as_os_str() == "frontend" {
                // Anything under frontend/, including nested directories, matches
                return true;
            }
        }

        false
    })
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

    /// Indicates a Plugin wants to stop (e.g. when user presses to Stop button)
    /// Once ack'd, front and backend start unloading resources.
    /// The stop is finished when the [PluginsState::finalize_stop] is invoked.
    pub(crate) async fn stop<R: Runtime>(
        &mut self,
        id: String,
        app_handle: &AppHandle<R>,
    ) -> anyhow::Result<()> {
        let maybe_event = ReconcileAction::Stop { plugin_id: id }.apply(self)?;
        if let Some(x) = maybe_event {
            tokio::time::sleep(Duration::from_millis(20)).await;
            x.emit(app_handle)?;
        }
        Ok(())
    }

    /// This method indicates the final stop in stopping a plugin
    pub(crate) async fn finalize_stop<R: Runtime>(
        &mut self,
        id: String,
        app_handle: &AppHandle<R>,
    ) -> anyhow::Result<()> {
        let maybe_event = ReconcileAction::SyncInPlace {
            plugin_id: id,
            patch: Box::new(|x| x.current_state = PluginCurrentState::Disabled {}),
        }
        .apply(self)?;
        if let Some(x) = maybe_event {
            tokio::time::sleep(Duration::from_millis(20)).await;
            x.emit(app_handle)?;
        }
        Ok(())
    }

    /// Indicates a Plugin wants to start (e.g. when user presses to Start button)
    /// Once ack'd, front and backend start loading resources.
    /// The start is finished when the [PluginsState::finalize_start] is invoked.
    /// Alternatively, if the Frontend has issues loading required assets (e.g. malformed JS Bundle), [PluginsState::start_failed] is invoked.
    pub(crate) async fn start<R: Runtime>(
        &mut self,
        id: String,
        app_handle: &AppHandle<R>,
    ) -> anyhow::Result<()> {
        let maybe_event = ReconcileAction::Start { plugin_id: id }.apply(self)?;
        if let Some(x) = maybe_event {
            tokio::time::sleep(Duration::from_millis(20)).await;
            x.emit(app_handle)?;
        }
        Ok(())
    }

    pub(crate) async fn start_failed<R: Runtime>(
        &mut self,
        id: String,
        reasons: Vec<String>,
        app_handle: &AppHandle<R>,
    ) -> anyhow::Result<()> {
        let maybe_event = ReconcileAction::SyncInPlace {
            plugin_id: id,
            patch: Box::new(move |x| {
                if matches!(&x.current_state, PluginCurrentState::Starting { .. }) {
                    x.current_state = PluginCurrentState::FailedToStart {
                        reasons: reasons.clone(),
                    }
                }
            }),
        }
        .apply(self)?;
        if let Some(x) = maybe_event {
            tokio::time::sleep(Duration::from_millis(20)).await;
            x.emit(app_handle)?;
        }
        Ok(())
    }

    pub(crate) async fn finalize_start<R: Runtime>(
        &mut self,
        id: String,
        app_handle: &AppHandle<R>,
    ) -> anyhow::Result<()> {
        let maybe_event = ReconcileAction::SyncInPlace {
            plugin_id: id,
            patch: Box::new(|x| x.current_state = PluginCurrentState::Running {}),
        }
        .apply(self)?;
        if let Some(x) = maybe_event {
            tokio::time::sleep(Duration::from_millis(20)).await;
            x.emit(app_handle)?;
        }
        Ok(())
    }

    /// Runs a reconciliation against all plugins.  
    /// This will
    /// - fetch all user-provided and embedded plugins
    /// - look at the config to figure out which plugins are active
    /// - calls [PluginState::reconcile] for each plugin and notifies it if it should be started or not
    #[instrument(skip(self, app_handle))]
    async fn reconcile(&mut self, app_handle: &AppHandle<Wry>) -> anyhow::Result<()> {
        let user_plugin_dir = app_handle
            .store("store.json")
            .map_err(|x| anyhow!("couldn't get store: {x}"))?
            .get("plugin_dir")
            .and_then(|x| {
                let x = x.to_string();
                PathBuf::from_str(&x).ok()
            })
            .unwrap_or(data_local_dir().unwrap().join("edpf-plugins"));

        let user_plugin_manifests_and_ids_from_dir =
            glob::glob(user_plugin_dir.join("*/manifest.json").to_str().unwrap())
                .map_err(|x| anyhow!("failed to get user plugin manifests: {x}"))?
                .flatten()
                .filter_map(|path| {
                    if let Some(p) = path.parent() {
                        let plugin_id = p.file_name()?.to_str()?.to_string();

                        if plugin_id
                            .chars()
                            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
                        {
                            return Some((path, plugin_id));
                        }
                    }
                    None
                })
                .collect_vec();

        let all_known_user_plugin_ids = user_plugin_manifests_and_ids_from_dir
            .iter()
            .map(|x| x.1.clone())
            .collect_vec();
        let active_plugin_ids: Vec<String> =
            GenericPluginSettings::get_active_ids(app_handle, &all_known_user_plugin_ids)?;
        let active_plugin_ids_set: HashSet<_> = active_plugin_ids.into_iter().collect();

        // This is what we know internally
        // We need this to stop plugins that were deleted between the last reconcile and now
        let known_user_plugin_ids: HashSet<_> = self
            .plugin_states
            .values()
            .filter(|x| x.source == PluginStateSource::UserProvided)
            .map(|x| x.id.clone())
            .collect();

        let mut failed_path_bufs = vec![];
        let mut discovered_user_plugins = HashMap::new();

        let mut actions_map = HashMap::new();

        // Here we define the **expected** state. We write this to discovered_user_plugins
        for (path, plugin_id) in user_plugin_manifests_and_ids_from_dir {
            let manifest = match PluginState::get_manifest(&path) {
                Ok(x) => x,
                Err(e) => {
                    error!(
                        "failed to get plugin manifest at {}: {}",
                        path.display(),
                        &e
                    );
                    failed_path_bufs.push((path, e));
                    continue;
                }
            };
            debug!("found valid manifest @ {}", path.display());

            let frontend_hash = PluginState::get_frontend_dir_hash(&path);
            let desired_state = PluginState {
                current_state: match active_plugin_ids_set.contains(&plugin_id) {
                    true => match &frontend_hash {
                        Some(_frontend_hash) => PluginCurrentState::Running {},
                        None => PluginCurrentState::FailedToStart {
                            reasons: vec!["Failed to calculate hash for assets".into()],
                        },
                    },
                    false => PluginCurrentState::Disabled {},
                },
                frontend_hash: frontend_hash.unwrap_or("missing".into()),
                plugin_dir: path.parent().unwrap().to_path_buf(),
                manifest,
                source: PluginStateSource::UserProvided,
                id: plugin_id.clone(),
            };

            if let Some(x) =
                discovered_user_plugins.insert(plugin_id.clone(), desired_state.clone())
            {
                error!(
                    "Plugin conflict! The following manifests share the plugin ID '{}': {}, {}",
                    plugin_id,
                    path.display(),
                    x.manifest_path().display()
                );
                continue;
            }

            let current_state_for_this_plugin = self.plugin_states.get(&plugin_id);

            if let Some(action) =
                PluginState::get_reconcile_action(current_state_for_this_plugin, &desired_state)
            {
                actions_map.insert(plugin_id, action);
            }
        }

        let action_plan = serde_json::to_string(&actions_map).unwrap();
        info!(
            "Planned reconcile actions: {action_plan}, dir: {}",
            user_plugin_dir.display(),
        );

        // We STOP any plugin that was deleted or broke for some reason
        for id in known_user_plugin_ids
            .iter()
            .filter(|x| !discovered_user_plugins.contains_key(x.as_str()))
        {
            actions_map.insert(
                id.to_string(),
                ReconcileAction::Drop {
                    plugin_id: id.clone(),
                },
            );
        }

        let mut emits = Vec::new();
        {
            // At this point we know which actions need to be taken
            for (id, action) in actions_map.into_iter() {
                let maybe_event = match action.apply(self) {
                    Ok(x) => x,
                    Err(e) => {
                        error!(
                            "Failed to apply a plugin reconcile action for plugin {}: {}",
                            id, e
                        );
                        continue;
                    }
                };
                if let Some(e) = maybe_event {
                    emits.push(e.clone());
                }
            }
        };

        for e in emits {
            e.emit(app_handle)?;
        }

        Ok(())
    }
}

/// Defines the current state of the plugin. Mainly used for reconciliation and for the Frontend to display all plugins / specific plugin
#[derive(Debug, Serialize, Clone, JsonSchema)]
pub(crate) struct PluginState {
    id: String,
    current_state: PluginCurrentState,
    plugin_dir: PathBuf,
    manifest: PluginManifest,
    source: PluginStateSource,
    frontend_hash: String,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq, JsonSchema)]
#[serde(tag = "type")]
pub(crate) enum PluginCurrentState {
    Disabled {},
    Starting { metadata: Vec<String> },
    FailedToStart { reasons: Vec<String> },
    Running {},
    Disabling {},
}

impl PluginState {
    pub(crate) fn manifest_path(&self) -> PathBuf {
        self.plugin_dir.join("manifest.json")
    }
    pub(crate) fn frontend_path(&self) -> PathBuf {
        self.plugin_dir.join("frontend")
    }

    #[instrument(ret)]
    fn get_manifest(manifest_path: &PathBuf) -> Result<PluginManifest, String> {
        let reader = File::open(manifest_path).map_err(|x| {
            format!(
                "failed to read manifest at {}: {x}",
                manifest_path.display()
            )
        })?;
        serde_json::from_reader(reader).map_err(|x| format!("failed to parse manifest: {}", x))
    }

    fn get_frontend_dir_hash(manifest_path: &Path) -> Option<String> {
        let parent = match manifest_path.parent() {
            Some(x) => x.join("frontend"),
            None => return None,
        };
        get_dir_hash::get_dir_hash(
            &parent,
            &Options {
                follow_symlinks: false,
                include_metadata: false,
                case_sensitive_paths: true,
                ..Default::default()
            },
        )
        .ok()
    }

    #[instrument(ret)]
    // rustfmt skipped for legible match
    #[rustfmt::skip]
    /// Returns the action to take. if [None] is returned this means that we are already in sync.
    ///
    /// A reconcile action is self-contained to the point it contains all the information to perform its task, if given the entire plugins state.
    fn get_reconcile_action(
        current_plugin_state: Option<&Self>,
        desired_plugin_state: &PluginState,
    ) -> Option<ReconcileAction> {
        let current_plugin_state = match current_plugin_state {
            Some(x) => x,
            None => {
                let should_be_running = matches!(&desired_plugin_state.current_state, PluginCurrentState::Running {..});

                return Some(ReconcileAction::Adopt { plugin_state: Box::new(desired_plugin_state.clone()), start: should_be_running })
            }
        };

        let manifest_synced = current_plugin_state
            .manifest
            .eq(&desired_plugin_state.manifest);
        // only relevant if both desired and current state is in running
        let frontend_dirs_synced =
            current_plugin_state.frontend_hash == desired_plugin_state.frontend_hash;
        let plugin_id = current_plugin_state.id.clone();

        match (&current_plugin_state.current_state, &desired_plugin_state.current_state) {
            (_, PluginCurrentState::Disabling { .. } | PluginCurrentState::FailedToStart { .. } | PluginCurrentState::Starting { .. }) => {
                error!("received a desired state that should not be possible due to reconciliation logic");
                None
            }
            (PluginCurrentState::Disabled {  }, PluginCurrentState::Disabled {  }) => match (manifest_synced, frontend_dirs_synced) {
                (true, true) => None,
                _ => {
                    let new_hash = desired_plugin_state.frontend_hash.clone();
                    let new_manifest = desired_plugin_state.manifest.clone();
                    Some(ReconcileAction::SyncInPlace { plugin_id, patch: Box::new(move |x| {
                        x.frontend_hash = new_hash.clone();
                        x.manifest = new_manifest.clone();
                    })})
                }
            },
            // From Disabled / Failed to Enabled
            (PluginCurrentState::Disabled {  } | PluginCurrentState::Disabling {  } | PluginCurrentState::FailedToStart { .. }, | PluginCurrentState::Running {  }) => {
                Some(ReconcileAction::Start { plugin_id })
            },
            // Already running, but might need a restart
            (PluginCurrentState::Running {  }, PluginCurrentState::Running {  }) => {
                match (manifest_synced, frontend_dirs_synced) {
                    (true, true) => None,
                    _ => {
                        let new_hash = desired_plugin_state.frontend_hash.clone();
                        let new_manifest = desired_plugin_state.manifest.clone();
                        Some(ReconcileAction::Restart { plugin_id, patch: Box::new(move |x| {
                                x.frontend_hash = new_hash.clone();
                                x.manifest = new_manifest.clone();
                            })
                        })
                    }
                }
            }
            // Noop - already converging towards that state
            (PluginCurrentState::Disabling {  }, PluginCurrentState::Disabled {  }) |
            (PluginCurrentState::Starting { .. } ,  PluginCurrentState::Running {  }) => None,
            // Running or stuck trying to run while trying to be stopped
            (PluginCurrentState::FailedToStart { .. } | PluginCurrentState::Running {  } | PluginCurrentState::Starting { .. }, PluginCurrentState::Disabled {  }) => {
                Some(ReconcileAction::Stop { plugin_id })
            }
        }
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
