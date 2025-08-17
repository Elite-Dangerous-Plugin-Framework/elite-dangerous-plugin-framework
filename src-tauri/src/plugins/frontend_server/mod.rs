use std::{collections::HashMap, path::PathBuf};

use chrono::{DateTime, Utc};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Wry};

mod bundle_plugin;

#[derive(Debug, Serialize, Clone)]
pub(crate) enum PluginCompilationState {
    MissingEntrypoint,
    DownloadingDependencies { started_at: DateTime<Utc> },
    DownloadingDependenciesFailed { reason: String },
    Bundling { started_at: DateTime<Utc> },
    BundlingFailed { reason: String },
    FinishedSuccessfully { hash: String, location: PathBuf },
}

const PLUGIN_STATE_UPDATE: &str = "PLUGIN_STATE_UPDATE";

#[derive(Debug, Serialize, Clone)]
pub(crate) struct PluginCompilationStateWithName {
    pub(crate) plugin_id: String,
    pub(crate) compilation_state: PluginCompilationState,
}

impl PluginCompilationStateWithName {
    pub(crate) fn new(id: &str, compilation_state: PluginCompilationState) -> Self {
        Self {
            plugin_id: id.to_string(),
            compilation_state,
        }
    }

    pub(crate) fn emit(&self, app_handle: &AppHandle<Wry>) -> anyhow::Result<()> {
        app_handle
            .emit(PLUGIN_STATE_UPDATE, &self.compilation_state)
            .map_err(|x| x.into())
    }
}

pub(crate) struct FrontendProxyState {
    plugin_mapping: HashMap<String, PluginCompilationState>,
    // if 0 -> disabled
    port: u16,
}

pub(super) fn spawn_server_blocking(app_handle: &AppHandle<Wry>) -> anyhow::Result<()> {}
