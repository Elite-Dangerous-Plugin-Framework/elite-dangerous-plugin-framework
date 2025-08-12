//! This module listens for changes on the plugin directory and makes sure that the actual state is reconciled against the desired state.

use std::{thread, time::Duration};

use tauri::{AppHandle, Wry};
use tauri_plugin_store::StoreExt;
use tracing::error;

/// Spawns a new thread that will be doing the watching.
pub(super) fn plugin_watchdog(app_handle: &AppHandle<Wry>) {
    let thread_app_handle = app_handle.clone();
    thread::Builder::new()
        .name("edpf-plugin-watchdog".into())
        .spawn(|| {
            let thread_app_handle = thread_app_handle;
            move || loop {}
        });
}
