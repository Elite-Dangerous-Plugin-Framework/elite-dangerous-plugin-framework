//! This module defines what a Plugin Manifest looks like

use std::path::Path;

use anyhow::anyhow;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tauri::Wry;
use tokio::{fs::File, io::AsyncReadExt};

/// Each Plugin must have a `manifest.json` which describes the plugin, it's requirements, updating strategies, and so on.
#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq, JsonSchema)]
#[serde(tag = "type")]
pub(crate) enum PluginManifest {
    #[serde(rename = "v1alpha")]
    V1Alpha(PluginManifestV1Alpha),
}
/// Version 1alpha is the initial version that may introduce breaking changes.
/// Once the MVP is finished, this can be promoted to v1
#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq, JsonSchema)]
pub(crate) struct PluginManifestV1Alpha {
    /// What is this plugin's name?
    /// This name shouldn't change over time as the internal ID and plugin-stored settings are tied to it
    /// The internal name is derived from this name by replacing spaces with dashes and removing any unsafe characters
    pub(crate) name: String,
    /// A short description about what this Plugin is doing
    pub(crate) description: Option<String>,
    /// optionally, a URL to the Git Repository
    pub(crate) repository_url: Option<String>,
    /// optionally, a link where the user can get support. Can be a Discord Link, Github Issues, etc.
    pub(crate) support_url: Option<String>,
    /// Put a semantic version here (e.g. `0.0.1`)
    pub(crate) version: Option<String>,
    /// A list of versions. This is ignored from the local file and only the remote manifest is considered. Look at [PluginManifest::remote_manifest]
    pub(crate) versions: Option<Vec<PluginVersionOption>>,
    /// This contains the strategy the plugin should take during updating to find out if there is a new update
    pub(crate) remote_manifest: Option<PluginRemoteManifestResolutionStrategy>,
    /// An optional property that defines
    pub(crate) additional_capabilities: Option<Vec<PluginConfigurationCapabilityV1Alpha>>,
}

#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq, JsonSchema)]
pub(crate) struct PluginVersionOption {
    /// A semantic version (e.g. 1.2.3)
    pub(crate) version: String,
    /// users may opt into beta releases to test new features
    pub(crate) is_pre_release: bool,
    /// Contains the full path to a tar / tgz / zip which contains the entire plugin folder.
    pub(crate) download_url: String,
}

#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq, JsonSchema)]
pub(crate) enum PluginRemoteManifestResolutionStrategy {
    /// Will call a URL, expecting a manifest.json
    Http { address: String },
}

impl PluginManifest {
    pub(crate) fn inject_embedded_version(&mut self, app: &tauri::AppHandle<Wry>) {
        match self {
            PluginManifest::V1Alpha(x) => x.version = Some(app.package_info().version.to_string()),
        }
    }
    /// This tries to read the Plugin Manifest from the FS.
    pub(crate) async fn try_read_from_file(path_to_manifest: &Path) -> anyhow::Result<Self> {
        let mut buf = vec![];
        File::open(path_to_manifest)
            .await
            .map_err(|x| anyhow!("failed to open manifest file. does it exists? {x}"))?
            .read_to_end(&mut buf)
            .await
            .map_err(|x| anyhow!("failed to read manifest into buffer: {x}"))?;

        serde_json::from_slice(&buf).map_err(|x| {
            anyhow!("failed to parse manifest. does it's structure follow the spec?: {x}")
        })
    }
}

#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq, JsonSchema)]
#[serde(tag = "type")]
pub(crate) enum PluginConfigurationCapabilityV1Alpha {}
