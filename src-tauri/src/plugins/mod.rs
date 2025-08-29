use std::{
    collections::{HashMap, HashSet},
    fs::File,
    path::PathBuf,
    str::FromStr,
    sync::Arc,
    time::Duration,
};

use anyhow::anyhow;
use dirs::data_local_dir;
use get_dir_hash::Options;
use plugin_manifest::PluginManifest;
use reconciler_utils::ReconcileAction;
use schemars::JsonSchema;
use serde::Serialize;
use tauri::{AppHandle, Manager, Wry};
use tauri_plugin_store::StoreExt;
use tokio::{sync::RwLock, time::sleep};
use tracing::{debug, error, info, instrument};

pub(crate) mod commands;
pub(crate) mod frontend_server;
pub(crate) mod plugin_manifest;
mod reconciler_utils;

pub(super) async fn spawn_reconciler_blocking(app_state: &AppHandle<Wry>) -> ! {
    loop {
        {
            let state = app_state.state::<Arc<RwLock<PluginsState>>>();
            info!("Running Plugin reconciler…");
            let mut state = state.write().await;
            if let Err(e) = state.reconcile(app_state).await {
                error!("plugin state reconcile failed: {e}")
            }
        }
        sleep(Duration::from_secs(30)).await;
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
                current_state: match active_plugin_ids_set.contains(&manifest.id()) {
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

        let action_plan = serde_json::to_string(&actions_map).unwrap();
        info!(
            "Planned reconcile actions: {action_plan}, dir: {}",
            user_plugin_dir.display()
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

        // At this point we know which actions need to be taken
        for (id, action) in actions_map.into_iter() {
            if let Err(e) = action.apply(self, app_handle) {
                error!(
                    "Failed to apply a plugin reconcile action for plugin {}: {}",
                    id, e
                )
            }
        }

        Ok(())
    }
}

/// Defines the current state of the plugin. Mainly used for reconciliation and for the Frontend to display all plugins / specific plugin
#[derive(Debug, Serialize, Clone, JsonSchema)]
pub(crate) struct PluginState {
    current_state: PluginCurrentState,
    plugin_dir: PathBuf,
    manifest: PluginManifest,
    source: PluginStateSource,
    frontend_hash: String,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq, JsonSchema)]
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
        serde_json::from_reader(reader).map_err(|x| format!("failed to parse manifest: {}", x))
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

    #[instrument(ret)]
    /// Returns the action to take. if [None] is returned this means that we are already in sync.
    fn get_reconcile_action(
        current_plugin_state: Option<&Self>,
        desired_plugin_state: &PluginState,
    ) -> Option<ReconcileAction> {
        let current_plugin_state = match current_plugin_state {
            Some(x) => x,
            None => {
                return match &desired_plugin_state.current_state {
                    // Plugin is not known yet. If we want it running, we have to spawn an adopt action.
                    PluginCurrentState::Running { .. } => Some(ReconcileAction::Adopt {
                        plugin_state: Box::new(desired_plugin_state.clone()),
                    }),
                    // else we still need to get the system to know about it
                    _ => Some(ReconcileAction::Adopt {
                        plugin_state: Box::new(desired_plugin_state.clone()),
                    }),
                };
            }
        };

        let currently_running = !matches!(
            current_plugin_state.current_state,
            PluginCurrentState::Disabled {}
                | PluginCurrentState::Disabling {}
                | PluginCurrentState::FailedToStart { .. }
                | PluginCurrentState::Starting { .. }
        );
        let manifest_synced = current_plugin_state
            .manifest
            .eq(&desired_plugin_state.manifest);
        // only relevant if both desired and current state is in running
        let frontend_dirs_synced =
            current_plugin_state.frontend_hash == desired_plugin_state.frontend_hash;

        match (currently_running, &desired_plugin_state.current_state) {
            (true, PluginCurrentState::Disabled {}) => {
                // We are currently running, but shouldn't be. Stop
                Some(ReconcileAction::Stop {
                    plugin_id: current_plugin_state.id(),
                })
            }
            (true, PluginCurrentState::Starting { .. })
            | (false, PluginCurrentState::Disabling {}) => {
                // in states that indicate convergence towards the desired state. We do nothing
                None
            }
            (true, PluginCurrentState::FailedToStart { reasons }) => todo!(),
            (true, PluginCurrentState::Running {}) => todo!(),
            (true, PluginCurrentState::Disabling {}) => todo!(),
            (false, PluginCurrentState::Disabled {}) => {
                // Not running and we dont want it to run -> keep disabled
                // We can update the manifest if its out of sync though
                if manifest_synced {
                    None
                } else {
                    let manifest = desired_plugin_state.manifest.clone();
                    Some(ReconcileAction::SyncInPlace {
                        plugin_id: current_plugin_state.id(),
                        patch: Box::new(move |x| {
                            x.manifest = manifest.clone();
                        }),
                    })
                }
            }
            (false, PluginCurrentState::Starting { metadata }) => todo!(),
            (false, PluginCurrentState::FailedToStart { reasons }) => todo!(),
            (false, PluginCurrentState::Running {}) => todo!(),
            (false, PluginCurrentState::Disabling {}) => todo!(),
        }
    }

    fn id(&self) -> String {
        self.manifest.id()
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
