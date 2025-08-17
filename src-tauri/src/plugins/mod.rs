use std::{
    collections::{HashMap, HashSet},
    fs::File,
    path::PathBuf,
    str::FromStr,
};

use anyhow::anyhow;
use dirs::data_local_dir;
use plugin_manifest::PluginManifest;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Wry};
use tauri_plugin_store::StoreExt;
use tracing::warn;

pub(crate) mod commands;
pub(crate) mod frontend_server;
pub(crate) mod plugin_manifest;
pub(crate) mod plugin_watchdog;

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

        let user_plugin_manifests =
            glob::glob(user_plugin_dir.join("*/manifest.json").to_str().unwrap())
                .map_err(|x| anyhow!("failed to get user plugin manifests: {x}"))?;

        let mut failed_path_bufs = vec![];

        for path in user_plugin_manifests.flatten() {
            let (plugin_id, stop, start) = match PluginState::get_manifest(&path) {
                Ok(x) => {
                    let plugin_id = x.id();
                    let is_plugin_in_active_list = active_plugin_ids_set.contains(&plugin_id);

                    let mut needs_stop = false;
                    let mut needs_start = false;

                    let current_plugin_state = self.plugin_states.get(&plugin_id);
                    if let Some(curr) = current_plugin_state {
                        if curr.manifest != x {
                            // there is a new Manifest state
                            needs_stop = true;
                            if is_plugin_in_active_list {
                                needs_start = true;
                            }
                        }
                    }

                    match current_plugin_state {
                        None => {
                            // The plugin state has not been written yet.
                            if is_plugin_in_active_list {
                                needs_start = true
                            }
                            self.plugin_states.insert(
                                plugin_id.clone(),
                                PluginState {
                                    current_state: PluginCurrentState::Disabled,
                                    manifest_path: path.clone(),
                                    manifest: x.clone(),
                                    source: PluginStateSource::UserProvided,
                                },
                            );
                        }
                        Some(state) => match state.current_state {
                            PluginCurrentState::Disabled
                            | PluginCurrentState::FailedToStart { reasons: _ } => {
                                if is_plugin_in_active_list {
                                    needs_start = true
                                }
                            }
                            PluginCurrentState::Running {} | PluginCurrentState::Disabling {} => {
                                if !is_plugin_in_active_list {
                                    needs_stop = true
                                }
                            }
                        },
                    }

                    (plugin_id, needs_stop, needs_start)
                }
                Err(e) => {
                    failed_path_bufs.push((path, e));
                    continue;
                }
            };
            // if here, the plugin is guaranteed to exist and in the hashmap
            let plugin = match self.plugin_states.get_mut(&plugin_id) {
                Some(x) => x,
                None => {
                    warn!("plugin {plugin_id} was not initialized, should never happen!");
                    continue;
                }
            };

            if stop {
                _ = plugin.stop(&app_handle).await;
            }
            if start {
                _ = plugin.start(&app_handle).await;
            }
        }

        todo!()
    }
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct PluginState {
    current_state: PluginCurrentState,
    manifest_path: PathBuf,
    manifest: PluginManifest,
    source: PluginStateSource,
}
#[derive(Debug, Serialize, Clone)]
pub(crate) enum PluginCurrentState {
    Disabled,
    Starting {
        metadata: Vec<String>,
    },
    FailedToStart {
        reasons: Vec<String>,
    },
    /// This will contain thread handles in the future
    Running {
        frontend_path: PathBuf,
        frontend_hash: String,
    },
    /// This will contain blockers in the future
    Disabling {},
}

impl PluginState {
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

    fn id(&self) -> String {
        self.manifest.id()
    }
}

#[derive(Debug, Serialize, Clone)]
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
