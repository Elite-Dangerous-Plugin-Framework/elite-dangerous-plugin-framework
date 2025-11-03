//! This Module concerns itself with the *persistent* State outside of the Manifest that is user-configurable
//!
//! E.g. if a plugin is enabled, if the plugin has specific permissions defined (unused for now)
//! also if the Plugin is new / unknown

use serde::{Deserialize, Serialize};
use tauri::{App, AppHandle, Runtime};
use tauri_plugin_store::{StoreBuilder, StoreExt};
use tracing::error;
use uuid::uuid;
#[derive(Debug, Serialize, Deserialize, Default)]
/// This contains the entire **generic** Configurable State for a plugin.  
/// Settings read/set from the Plugins themselves are managed separately
pub(crate) struct PluginSettings {
    /// If true, the Plugin is running. If false, it's not running
    pub(crate) enabled: bool,
    /// Defaults to false. The first time this plugin is discovered a popup is made, which will tell you about the Plugin's config, required permissions, etc
    /// with an option to quickly enable this plugin
    pub(crate) already_known: bool,
    /// Not implemented yet, but will store the Update Strategy. See [PluginSettingsUpdateStrategy] for further info.
    pub(crate) update_strategy: PluginSettingsUpdateStrategy,
    /// If set, versions marked as pre-releases will also be considered for updates.
    pub(crate) consider_prereleases: bool,
}

impl PluginSettings {
    pub(crate) fn sync_ui_layout<R: Runtime>(
        app_handle: &AppHandle<R>,
        maybe_new_layout: Option<PluginsUiConfig>,
    ) -> anyhow::Result<PluginsUiConfig> {
        let store = match StoreBuilder::new(app_handle, "store.json").build() {
            Ok(x) => x,
            Err(e) => return Err(anyhow::anyhow!("failed to build store: {e}")),
        };

        if let Some(new_layout) = maybe_new_layout {
            store.set("main.ui_layout", serde_json::to_value(new_layout).unwrap());
        }

        let response =
            if let Some(v) = store.get("main.ui_layout") {
                let settings: PluginsUiConfig = serde_json::from_value(v).map_err(|x| {
                error!("could not parse content as Plugin UI Config: {x}. Falling back to default");
            }).unwrap_or_default();
                settings
            } else {
                PluginsUiConfig::default()
            };

        Ok(response)
    }

    pub(crate) fn get_by_id<R: Runtime>(
        app_handle: &AppHandle<R>,
        plugin_id: &str,
    ) -> anyhow::Result<Option<Self>> {
        let store = match StoreBuilder::new(app_handle, "store.json").build() {
            Ok(x) => x,
            Err(e) => return Err(anyhow::anyhow!("failed to build store: {e}")),
        };

        let response = if let Some(v) = store.get(format!("plugins.{plugin_id}")) {
            let settings: PluginSettings = serde_json::from_value(v)?;
            Some(settings)
        } else {
            None
        };

        Ok(response)
    }

    pub(crate) fn get_active_ids<R: Runtime>(
        app_handle: &AppHandle<R>,
        ids_to_check: &[String],
    ) -> anyhow::Result<Vec<String>> {
        let store = match StoreBuilder::new(app_handle, "store.json").build() {
            Ok(x) => x,
            Err(e) => return Err(anyhow::anyhow!("failed to build store: {e}")),
        };

        Ok(ids_to_check
            .iter()
            .filter_map(|id| {
                let resp: PluginSettings = match store.get(format!("plugins.{id}")) {
                    Some(x) => match serde_json::from_value(x) {
                        Ok(x) => x,
                        Err(_) => return None,
                    },
                    None => return None,
                };

                if resp.enabled { Some(id.clone()) } else { None }
            })
            .collect())
    }

    pub(crate) fn commit<R: Runtime>(
        &self,
        app_handle: &AppHandle<R>,
        plugin_id: &str,
    ) -> anyhow::Result<()> {
        let store = match StoreBuilder::new(app_handle, "store.json").build() {
            Ok(x) => x,
            Err(e) => return Err(anyhow::anyhow!("failed to build store: {e}")),
        };

        store.set(
            format!("plugins.{plugin_id}"),
            serde_json::to_value(self).unwrap(),
        );
        Ok(())
    }
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub(crate) enum PluginSettingsUpdateStrategy {
    /// The Plugin is upgraded without the User needing to interfere. If the Plugin is started, it will be restarted
    Autoupdate,
    /// When starting EDPF, if a new version is found, a popup appears nagging the User to upgrade
    NagOnStartup,
    /// There is no popup, there is no notification, but when opening settings, the user can see that a plugin needs an update and can manually update there.
    #[default]
    Manual,
}
#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct PluginsUiConfig {
    root: PluginUiConfigNode,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub(crate) enum PluginUiConfigNode {
    VerticalLayout {
        children: Vec<PluginUiConfigNode>,
        meta: PluginUiConfigNodeMetadata,
        /// The Identifier uniquely identifies a "container" node (basically a node containing either plugins or other containers)
        /// When containers are moved around, that node can then be identified when diffing.  
        /// When new containers are spawned, they must immediately get an ID (this is done on the frontend)
        ///
        /// This doesn't have to be a UUID, but a UUIDv4 was choosen as it is sufficiently random
        identifier: String,
    },
    PluginCell {
        plugin_id: String,
        meta: PluginUiConfigNodeMetadata,
    },
}
#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct PluginUiConfigNodeMetadata {
    min_width: Option<String>,
    max_width: Option<String>,
    min_height: Option<String>,
    max_height: Option<String>,
}

impl Default for PluginsUiConfig {
    fn default() -> Self {
        Self {
            root: PluginUiConfigNode::VerticalLayout {
                children: vec![],
                meta: PluginUiConfigNodeMetadata {
                    min_width: None,
                    max_width: None,
                    min_height: None,
                    max_height: None,
                },
                identifier: uuid::Uuid::new_v4().to_string(),
            },
        }
    }
}
