use std::{fs::File, path::PathBuf, str::FromStr};

use dirs::data_local_dir;
use itertools::Itertools;
use tauri::Runtime;
use tauri_plugin_store::StoreExt;
use tracing::error;

use super::plugin_manifest::PluginManifest;

#[tauri::command]
pub(crate) async fn fetch_all_plugins<R: Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
) -> Result<(), String> {
    todo!()
}
