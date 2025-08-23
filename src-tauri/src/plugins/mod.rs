use std::{
    collections::{HashMap, HashSet},
    fs::File,
    path::PathBuf,
    str::FromStr,
    sync::{Arc, Mutex, RwLock},
};

use anyhow::anyhow;
use dirs::data_local_dir;
use get_dir_hash::Options;
use itertools::Itertools;
use plugin_manifest::PluginManifest;
use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_store::StoreExt;
use tracing::{error, warn};

pub(crate) mod commands;
pub(crate) mod frontend_server;
pub(crate) mod plugin_manifest;
pub(crate) mod plugin_watchdog;

/// This enum is used as part of the reconciliation and tells us what the execution plan for a Plugin is.
enum ReconcileAction {
    /// Similar to [ReconcileAction::Start], except that the App doesn't yet know about the Plugin's State.  
    /// This happens either during StartUp, or when a Plugin is added at Runtime.
    ///
    /// **NOTE**: [ReconcileAction::Adopt] is also used for disabled plugins. The reconciler logic has some special handling here, looking at the [PluginState::current_state] field.
    /// if this field is [PluginCurrentState::Disabled], it wont bother to go through the startup procedure, and acts more as a "spawning" [ReconcileAction::SyncInPlace]
    Adopt {
        plugin_state: PluginState,
        frontend_hash: String,
    },
    /// The plugin is inactive and should be started up.  
    /// This means the HTTP Server will open up the route
    /// and the frontend is notified about the plugin and will fetch the Web Component, inject it, and so on
    Start {
        frontend_hash: String,
        plugin_id: String,
    },
    /// This plugin is currently running.  
    /// The HTTP server is told to remove the plugin from its routing. The Web Component is notified about its imminent shutdown.
    /// After that, it is removed from the UI
    Stop { plugin_id: String },
    /// Similar to [ReconcileAction::Stop], except that the App should "forget" about this plugin.
    /// It will be dropped from the plugin state, meaning it wont show up in Settings / Installed Plugins.  
    /// This action is taken when a plugin is deleted during runtime.
    Drop { plugin_id: String },
    /// Stops and Restarts the Plugin, using a new import identified.
    /// Also adds in a patch to modify the previous state.  
    /// This is mainly used to modify the Manifest file. [ReconcileAction::Restart] is usually used when the plugin is already running, while [ReconcileAction::SyncInPlace] is used when it is not running.
    Restart {
        plugin_id: String,
        patch: Box<dyn FnMut(&mut PluginState)>,
        frontend_hash: String,
    },
    /// This is an in-place update of the Plugin State, excluding anything else.
    /// This is used if we have a deactivated plugin that had it's manifest updated.
    /// This way, the metadata shown for a Plugin stays up-to-date
    SyncInPlace {
        plugin_id: String,
        patch: Box<dyn FnMut(&mut PluginState)>,
    },
}

impl ReconcileAction {
    /// Applies the action.
    ///
    /// Responsible for modifying the PluginsState, modifying the HTTP Server config, and notifying to Frontend via an event that it should load/unload a plugin
    fn apply(
        self,
        plugins_states: &mut PluginsState,
        app_handle: &AppHandle<Wry>,
    ) -> anyhow::Result<()> {
        match self {
            ReconcileAction::Adopt {
                plugin_state,
                frontend_hash,
            } => {
                let id = plugin_state.id();
                plugins_states
                    .plugin_states
                    .insert(id.clone(), plugin_state);
                // The rest is just essentially a Start action
                ReconcileAction::Start {
                    frontend_hash,
                    plugin_id: id,
                }
                .apply(plugins_states, app_handle)
            }
            ReconcileAction::Start {
                frontend_hash,
                plugin_id,
            } => {
                let state = match plugins_states.plugin_states.get_mut(&plugin_id) {
                    None => {
                        return Err(anyhow!("Received reconcile to start Plugin {}, but is missing in the plugins state", &plugin_id))
                    },
                    Some(x) => {x},
                };

                state.current_state = PluginCurrentState::Starting {
                    metadata: vec![],
                    frontend_hash: frontend_hash.clone(),
                };

                /*
                The Frontend side listens for this event and will start the plugin
                (or at least try to)
                during start up it might invoke a command to push metadata.
                once it has successfully
                - await import(...)-ed the new module
                - asserted the default import is an HTMLElement
                - registered the Web Component
                - spawned a new instance
                - attached the instance to the DOM
                it will push a completion command. The backend will set the state to Running
                 */
                app_handle.emit(
                    "core.plugin.started",
                    json!({
                        plugin_id: plugin_id.clone(),
                        frontend_hash: frontend_hash.clone(),
                    }),
                );
                Ok(())
            }
            ReconcileAction::Stop { plugin_id } => todo!(),
            ReconcileAction::Drop { plugin_id } => todo!(),
            ReconcileAction::Restart {
                plugin_id,
                patch,
                frontend_hash,
            } => todo!(),
            ReconcileAction::SyncInPlace { plugin_id, patch } => todo!(),
        }
    }
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct PluginsState {
    plugin_states: HashMap<String, PluginState>,
}
impl PluginsState {
    /// this just creates an empty hashmap. Use reconcile function to sync the states
    pub(crate) fn new() -> Self {
        Self {
            plugin_states: HashMap::new(),
        }
    }

    /// Runs a reconciliation against all plugins.  
    /// This will
    /// - fetch all user-provided and embedded plugins
    /// - look at the config to figure out which plugins are active
    /// - calls [PluginState::reconcile] for each plugin and notifies it if it should be started or not
    async fn reconcile(&mut self, app_handle: AppHandle<Wry>) -> anyhow::Result<()> {
        let user_plugin_dir = app_handle
            .store("store.json")
            .map_err(|x| anyhow!("couldn't get store: {x}"))?
            .get("plugin_dir")
            .and_then(|x| {
                let x = x.to_string();
                PathBuf::from_str(&x).ok()
            })
            .unwrap_or(data_local_dir().unwrap().join("edpf-plugins"));
        let active_plugin_ids: Vec<String> = match app_handle.store("plugins.json") {
            Ok(x) => x
                .get("active_ids")
                .and_then(|x| serde_json::from_value(x).ok())
                .unwrap_or_default(),
            Err(e) => {
                return Err(anyhow!("could not get store.json: {e}"));
            }
        };
        let active_plugin_ids_set: HashSet<_> = active_plugin_ids.into_iter().collect();

        let user_plugin_manifests_from_dir =
            glob::glob(user_plugin_dir.join("*/manifest.json").to_str().unwrap())
                .map_err(|x| anyhow!("failed to get user plugin manifests: {x}"))?;

        // This is what we know internally
        // We need this to stop plugins that were deleted between the last reconcile and now
        let known_user_plugin_ids: HashSet<_> = self
            .plugin_states
            .values()
            .filter(|x| x.source == PluginStateSource::UserProvided)
            .map(|x| x.id())
            .collect();

        let mut failed_path_bufs = vec![];
        let mut discovered_user_plugins = HashMap::new();

        let mut actions_map = HashMap::new();

        // Here we define the **expected** state. We write this to discovered_user_plugins
        for path in user_plugin_manifests_from_dir.flatten() {
            let manifest = match PluginState::get_manifest(&path) {
                Ok(x) => x,
                Err(e) => {
                    failed_path_bufs.push((path, e));
                    continue;
                }
            };

            let frontend_hash = PluginState::get_frontend_dir_hash(&path);
            let desired_state = PluginState {
                current_state: match active_plugin_ids_set.contains(&manifest.id()) {
                    true => match frontend_hash {
                        Some(frontend_hash) => PluginCurrentState::Running { frontend_hash },
                        None => PluginCurrentState::FailedToStart {
                            reasons: vec!["Failed to calculate hash for assets".into()],
                        },
                    },
                    false => PluginCurrentState::Disabled,
                },
                plugin_dir: path.parent().unwrap().to_path_buf(),
                manifest,
                source: PluginStateSource::UserProvided,
            };
            let plugin_id = desired_state.id();

            if let Some(x) =
                discovered_user_plugins.insert(desired_state.id(), desired_state.clone())
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

        // We STOP any plugin that was deleted or broke for some reason
        for id in known_user_plugin_ids
            .iter()
            .filter(|x| !discovered_user_plugins.contains_key(x.as_str()))
        {
            actions_map.insert(id.to_string(), ReconcileAction::Drop(id.clone()));
        }

        // At this point we know which actions need to be taken
        for (id, action) in actions_map.into_iter() {
            if let Err(e) = action.apply(self, &app_handle) {}
        }

        Ok(())
    }
}

/// Defines the current state of the plugin. Mainly used for reconciliation and for the Frontend to display all plugins / specific plugin
#[derive(Debug, Serialize, Clone)]
pub(crate) struct PluginState {
    current_state: PluginCurrentState,
    plugin_dir: PathBuf,
    manifest: PluginManifest,
    source: PluginStateSource,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub(crate) enum PluginCurrentState {
    Disabled,
    Starting {
        metadata: Vec<String>,
        frontend_hash: String,
    },
    FailedToStart {
        reasons: Vec<String>,
    },
    Running {
        frontend_hash: String,
    },
    Disabling {},
}

impl PluginState {
    pub(crate) fn manifest_path(&self) -> PathBuf {
        self.plugin_dir.join("manifest.json")
    }
    pub(crate) fn frontend_path(&self) -> PathBuf {
        self.plugin_dir.join("frontend")
    }

    async fn stop(&mut self, app_handle: &AppHandle<Wry>) -> anyhow::Result<()> {
        Ok(())
    }

    async fn start(&mut self, app_handle: &AppHandle<Wry>) -> anyhow::Result<()> {
        Ok(())
    }

    fn get_manifest(manifest_path: &PathBuf) -> Result<PluginManifest, String> {
        let reader = File::open(manifest_path).map_err(|x| {
            format!(
                "failed to read manifest at {}: {x}",
                manifest_path.display()
            )
        })?;
        Ok(serde_json::from_reader(reader)
            .map_err(|x| format!("failed to parse manifest: {}", x))?)
    }

    fn get_frontend_dir_hash(manifest_path: &PathBuf) -> Option<String> {
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

    /// Returns the action to take. if [None] is returned this means that we are already in sync.
    fn get_reconcile_action(
        current_plugin_state: Option<&Self>,
        desired_plugin_state: &PluginState,
    ) -> Option<ReconcileAction> {
        let current_plugin_state = match current_plugin_state {
            Some(x) => x,
            None => {
                return match desired_plugin_state.current_state {
                    // Plugin is not known yet. If we want it running, we have to spawn an adopt action.
                    PluginCurrentState::Running { frontend_hash } => {
                        Some(ReconcileAction::Adopt(desired_plugin_state.clone()))
                    }
                    // else we still need to get the system to know about it
                    _ => None,
                };
            }
        };

        let currently_running = match current_plugin_state.current_state {
            PluginCurrentState::Disabled
            | PluginCurrentState::Disabling {}
            | PluginCurrentState::FailedToStart { .. } => false,
            _ => true,
        };
        let manifest_synced = current_plugin_state
            .manifest
            .eq(&desired_plugin_state.manifest);
        // only relevant if both desired and current state is in running
        let frontend_dirs_synced = match (
            &current_plugin_state.current_state,
            &desired_plugin_state.current_state,
        ) {
            (
                PluginCurrentState::Running { frontend_hash: a },
                PluginCurrentState::Running { frontend_hash: b },
            ) => Some(a == b),
            _ => None,
        };

        if !currently_running && desired_plugin_state.current_state == PluginCurrentState::Disabled
        {
            // Not running and we dont want it to run -> keep disabled
            // We can update the manifest if its out of sync though
            if !manifest_synced {
                return self.manifest = desired_plugin_state.manifest.clone();
            }

            return None;
        }

        match (currently_running, &desired_plugin_state.current_state) {
            (true, PluginCurrentState::Disabled) => {
                // Not running and we dont want it to run -> keep disabled
                // We can update the manifest if its out of sync though
                if manifest_synced {
                    None
                } else {
                    Some(ReconcileAction::SyncInPlace(move |x| {
                        x.manifest = desired_plugin_state.manifest.clone()
                    }))
                }
            }
            (
                true,
                PluginCurrentState::Starting {
                    metadata,
                    frontend_hash,
                },
            ) => todo!(),
            (true, PluginCurrentState::FailedToStart { reasons }) => todo!(),
            (true, PluginCurrentState::Running { frontend_hash }) => todo!(),
            (true, PluginCurrentState::Disabling {}) => todo!(),
            (false, PluginCurrentState::Disabled) => todo!(),
            (
                false,
                PluginCurrentState::Starting {
                    metadata,
                    frontend_hash,
                },
            ) => todo!(),
            (false, PluginCurrentState::FailedToStart { reasons }) => todo!(),
            (false, PluginCurrentState::Running { frontend_hash }) => todo!(),
            (false, PluginCurrentState::Disabling {}) => todo!(),
        }
    }

    fn id(&self) -> String {
        self.manifest.id()
    }
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
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
