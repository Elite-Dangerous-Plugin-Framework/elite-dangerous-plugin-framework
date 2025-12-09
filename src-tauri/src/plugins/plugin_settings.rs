//! This Module handles CRUD ops for plugin-*specific* settings. This is something that each plugin can define. The structure of the config structure is not of relevance to EDPF
//! When invoking this module, access control should already be handled

use itertools::Itertools;
use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreBuilder;

pub(crate) fn write_setting<R: Runtime>(
    app_handle: &AppHandle<R>,
    key: &ParsedKey,
    value: serde_json::Value,
) -> anyhow::Result<serde_json::Value> {
    let store =
        match StoreBuilder::new(app_handle, format!("plugin-{}.json", &key.plugin_id)).build() {
            Ok(x) => x,
            Err(e) => return Err(anyhow::anyhow!("failed to build store: {e}")),
        };
    store.set(&key.remainder, value);
    store.save()?;
    Ok(store.get(&key.remainder).unwrap())
}

pub(crate) fn read_setting<R: Runtime>(
    app_handle: &AppHandle<R>,
    key: &ParsedKey,
) -> anyhow::Result<Option<serde_json::Value>> {
    let store =
        match StoreBuilder::new(app_handle, format!("plugin-{}.json", &key.plugin_id)).build() {
            Ok(x) => x,
            Err(e) => return Err(anyhow::anyhow!("failed to build store: {e}")),
        };
    Ok(store.get(&key.remainder))
}

pub(crate) struct ParsedKey {
    plugin_id: String,
    remainder: String,
    is_public: bool,
}

impl ParsedKey {
    pub(crate) fn is_readable_by(&self, plugin_id: &str) -> bool {
        self.is_public || self.plugin_id == plugin_id
    }
    pub(crate) fn is_writable_by(&self, plugin_id: &str) -> bool {
        self.plugin_id == plugin_id
    }
}

pub(crate) fn parse_key(input: &str) -> Result<ParsedKey, String> {
    if !input
        .chars()
        .all(|c| c.is_alphanumeric() || c == '.' || c == '_')
    {
        return Err("KEY_INVALID_FORMAT".to_string());
    }
    let segments = input.split(".").collect_vec();
    if segments.len() < 2 {
        return Err("KEY_NOT_ENOUGH_SEGMENTS".to_string());
    }
    if segments.iter().any(|x| x.is_empty()) {
        return Err("KEY_EMPTY_SEGMENT".to_string());
    }
    let last = segments.last().unwrap().chars().next().unwrap();
    // we have an uppercase string. hence we're public
    let public = last.is_ascii_uppercase();

    Ok(ParsedKey {
        plugin_id: segments[0].to_string(),
        remainder: segments.iter().skip(1).join("."),
        is_public: public,
    })
}
