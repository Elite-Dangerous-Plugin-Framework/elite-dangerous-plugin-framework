//! This module defines what a Plugin Manifest looks like

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

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
    /// each plugin has a default set of permissions like getting the current full journal, getting the Status.json, Backpack.json, etc. + anything a browser could do
    /// some plugins might need additional permissions, e.g. File Read Access / Write Access
    pub(crate) permissions: Option<Vec<PluginPermission>>,
    /// Put a semantic version here (e.g. `0.0.1`)
    pub(crate) version: Option<String>,
    /// A list of versions. This is ignored from the local file and only the remote manifest is considered. Look at [PluginManifest::remote_manifest]
    pub(crate) versions: Option<Vec<PluginVersionOption>>,
    /// This contains the strategy the plugin should take during updating to find out if there is a new update
    pub(crate) remote_manifest: Option<PluginRemoteManifestResolutionStrategy>,
}

/// Note: Permissions will be added as we go to cover more and more use cases. If there's something you need exposed for your plugin that is currently impossible, please don't hesitate to open an Issue
#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq, JsonSchema)]
pub(crate) enum PluginPermission {
    /// Allow reading anything within the Journal Directory
    /// Note that this is not needed for listening for the most recent journal, but can be useful if you need to look at historic files
    JournalDirReadAnyJournals,
}

impl PluginManifest {
    pub(crate) fn id(&self) -> String {
        match self {
            PluginManifest::V1Alpha(plugin_manifest_v1_alpha) => plugin_manifest_v1_alpha
                .name
                .to_lowercase()
                .replace(" ", "_")
                .chars()
                .filter(|x| x.is_alphanumeric() || *x == '-' || *x == '_')
                .collect(),
        }
    }
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
    /// Assumes that each release also bundles a `manifest.json`.
    GitReleaseAsset,
    /// Will call a URL, expecting a manifest.json
    Http { address: String },
    /// Use this if you publish your plugin to the registry
    OfficialRegistry,
    /// same as official registry, expect that you can point to a different registry
    UnofficialRegistry { address: String },
}
