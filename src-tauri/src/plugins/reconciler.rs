use std::path::Path;
use std::sync::Arc;
use std::{path::PathBuf, str::FromStr};

use anyhow::anyhow;
use anyhow::Result;
use dirs::data_local_dir;
use sha2::{Digest, Sha256};
use tauri::path::BaseDirectory;
use tauri::Manager;
use tauri::{AppHandle, Wry};
use tauri_plugin_store::StoreExt;
use tokio::fs::File;
use tokio::io::AsyncReadExt;
use tokio::sync::RwLock;
use tracing::{debug, instrument, warn};
use walkdir::WalkDir;

use crate::plugins::generic_plugin_settings::GenericPluginSettings;
use crate::plugins::plugin_manifest::PluginManifest;
use crate::plugins::PluginState;
use crate::PluginsState;

use super::internal_plugin_ids;

pub(super) fn get_user_plugins_dir(app_handle: &AppHandle<Wry>) -> Result<PathBuf> {
    Ok(app_handle
        .store("store.json")
        .map_err(|x| anyhow!("couldn't get store: {x}"))?
        .get("plugin_dir")
        .and_then(|x| {
            let x = x.to_string();
            PathBuf::from_str(&x).ok()
        })
        .unwrap_or(data_local_dir().unwrap().join("edpf-plugins")))
}
pub(super) fn get_embedded_plugins_dir(app_handle: &AppHandle<Wry>) -> Result<PathBuf> {
    app_handle
        .path()
        .resolve("assets/plugins", BaseDirectory::Resource)
        .map_err(|x| anyhow!("failed to get embedded plugin dir: {x}"))
}

async fn hash_directory(root_path: &Path) -> anyhow::Result<String> {
    let paths = WalkDir::new(root_path)
        .sort_by_file_name()
        .into_iter()
        .filter_map(Result::ok)
        .filter(|x| x.file_type().is_file())
        .map(|x| x.into_path());

    // Speed is not a concern here - the reconciler can get done at its leasurly pace :)
    // Better slower reconcile than to starve the task pool w/ hashing
    let mut hasher = Sha256::new();

    for path in paths {
        let mut file = File::open(&path).await.map_err(|x| {
            anyhow!(
                "file {} could not be opened for hash evaluation during reconcile: {}",
                path.display(),
                x
            )
        })?;
        // Read the file in 8KB chunks
        let mut buffer = [0u8; 8192];
        loop {
            let n = file.read(&mut buffer).await?;
            if n == 0 {
                break;
            }
            hasher.update(&buffer[..n]);
        }
    }

    Ok(format!("{:x}", hasher.finalize()))
}

/// Reconciles the desired state onto the actual state for a Plugin.  
/// This only concerns the **backend** state.
/// Returns true if a change occurred, else false.
#[instrument(skip(app_handle))]
pub(super) async fn reconcile_specific_plugin(
    plugin_id: String,
    app_handle: &AppHandle<Wry>,
) -> anyhow::Result<bool> {
    let is_internal_plugin = internal_plugin_ids().contains(&plugin_id.as_str());

    // plugin_base_dir is the location containing the manifest.json and the `frontend` folder
    let plugin_base_dir: PathBuf = match is_internal_plugin {
        false => get_user_plugins_dir(app_handle)?.join(&plugin_id),
        true => get_embedded_plugins_dir(app_handle)?.join(&plugin_id),
    };

    // The state we want (inferred by looking at what files are present)
    // The important bits are:
    // if the plugin dir doesnt exist - need to be removed (the Ok(None) case)
    // if the manifest is missing - error
    // if the frontend dir is missing or doesn't contain an index.js - error
    // we dont bother trying to make sense of the index.js - that is the frontend's job
    let desired_state: Result<Option<PluginState>> = {
        if !plugin_base_dir.is_dir() {
            Ok(None)
        } else if !plugin_base_dir.join("frontend").is_dir() {
            Err(anyhow!("Plugin is missing the frontend directory"))
        } else if !plugin_base_dir.join("frontend").join("index.js").is_file() {
            Err(anyhow!(
                "Plugin is missing the index.js Entrypoint in the frontend directory"
            ))
        } else {
            let mut manifest =
                PluginManifest::try_read_from_file(&plugin_base_dir.join("manifest.json")).await?;
            if is_internal_plugin {
                manifest.inject_embedded_version(app_handle);
            }
            // At this point we still have the re-eval the frontend dir
            let frontend_hash = hash_directory(&plugin_base_dir.join("frontend")).await?;
            let settings = GenericPluginSettings::get_by_id(app_handle, &plugin_id)?;
            Ok(Some(PluginState {
                manifest,
                frontend_hash,
                id: plugin_id.clone(),
                configuration: settings.unwrap_or_default(),
                plugin_dir: plugin_base_dir,
                source: match is_internal_plugin {
                    true => crate::plugins::PluginStateSource::Embedded,
                    false => crate::plugins::PluginStateSource::UserProvided,
                },
            }))
        }
    };

    // We take a read lock to see what the *current* state is. We try to have the write lock for as short as possible
    let current_state = {
        let state = app_handle.state::<Arc<RwLock<PluginsState>>>();
        let data = state.read().await;
        data.plugin_states.get(&plugin_id).cloned()
    };

    let mut warrants_emit = false;
    match desired_state {
        Err(e) => {
            tracing::error!("failed to reconcile: {e}")
        }
        Ok(None) => {
            if current_state.is_some() {
                // if we're here, we want to disable and completely "disown" the plugin but its currently running
                // This is essentially the frontend's job.
                let state = app_handle.state::<Arc<RwLock<PluginsState>>>();
                let mut data = state.write().await;
                let did_remove = data.plugin_states.remove(&plugin_id).is_some();
                if !did_remove {
                    warn!("race condition? Tried to remove plugin from state but it's already gone")
                } else {
                    warrants_emit = true
                }
            } else {
                // else its already in sync (which is weird because it shouldnt show up here)
                warn!(
                    "reconcile called for a plugin to be deleted that is already deleted: {}",
                    &plugin_id
                )
            }
        }
        Ok(Some(desired_state)) => {
            let needs_update = match &current_state {
                Some(current_state) => current_state != &desired_state,
                None => true,
            };
            if needs_update {
                // we have a difference!
                debug!("Plugin {} was updated in reconcile", &plugin_id);
                let state = app_handle.state::<Arc<RwLock<PluginsState>>>();
                let mut data = state.write().await;
                _ = data.plugin_states.insert(plugin_id.clone(), desired_state);
                warrants_emit = true
            }
        }
    }

    // We synced the state in some way.
    // We emit the specific emit and a global emit after the batch is done
    if warrants_emit {
        //app_handle.emit(event, payload)
    }
    return Ok(warrants_emit);
}
