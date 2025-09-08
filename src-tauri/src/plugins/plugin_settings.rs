//! This Module concerns itself with the *persistent* State outside of the Manifest that is user-configurable
//!
//! E.g. if a plugin is enabled, if the plugin has specific permissions defined (unused for now)
//! also if the Plugin is new / unknown

use serde::{Deserialize, Serialize};
use tauri::{App, AppHandle, Runtime};
use tauri_plugin_store::{StoreBuilder, StoreExt};
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

                if resp.enabled {
                    Some(id.clone())
                } else {
                    None
                }
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
