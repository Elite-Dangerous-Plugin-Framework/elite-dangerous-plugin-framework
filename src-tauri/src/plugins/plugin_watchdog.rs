//! This module listens for changes on the plugin directory and makes sure that the actual state is reconciled against the desired state.

use std::{
    thread::{self, sleep},
    time::Duration,
};

use tauri::{AppHandle, Wry};

/// Spawns a new thread that will be doing the watching.
pub(super) fn plugin_watchdog(app_handle: &AppHandle<Wry>) {
    let thread_app_handle = app_handle.clone();
    thread::Builder::new()
        .name("edpf-plugin-watchdog".into())
        .spawn(|| {
            let _thread_app_handle = thread_app_handle;
            move || loop {
                sleep(Duration::from_secs(30));
            }
        });
}
