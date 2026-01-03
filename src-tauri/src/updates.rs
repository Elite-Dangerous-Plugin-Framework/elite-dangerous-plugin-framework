use std::str::FromStr;

use serde::Deserialize;
use tauri::Url;
use tauri_plugin_updater::Update;

#[derive(Deserialize)]
pub(crate) enum ReleaseChannel {
    #[serde(rename = "prerelease")]
    Prerelease,
    #[serde(rename = "stable")]
    Stable,
    #[serde(rename = "merged")]
    Any,
}

impl ReleaseChannel {
    pub(crate) fn infer_endpoint(&self) -> Url {
        match self {
            ReleaseChannel::Prerelease => Url::from_str("https://elite-dangerous-plugin-framework.github.io/elite-dangerous-plugin-framework/prerelease.json"),
            ReleaseChannel::Stable => Url::from_str("https://elite-dangerous-plugin-framework.github.io/elite-dangerous-plugin-framework/stable.json"),
            ReleaseChannel::Any => Url::from_str("https://elite-dangerous-plugin-framework.github.io/elite-dangerous-plugin-framework/merged.json"),
        }.unwrap()
    }
}

pub(crate) struct PendingUpdate(pub(crate) std::sync::Mutex<Option<Update>>);
