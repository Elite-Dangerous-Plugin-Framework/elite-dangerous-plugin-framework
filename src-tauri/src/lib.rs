pub(crate) mod event_watchdog;
use chrono::{DateTime, TimeDelta, Utc};
use ed_journals::{
    cargo::asynchronous::ReadCargoFileError,
    journal::JournalEventKind,
    logs::{blocking::LiveLogFileReader, LogDir, LogEvent, LogEventContent},
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fmt::Debug,
    fs::{self, DirEntry},
    io,
    path::PathBuf,
    thread,
    time::Duration,
};
use tauri::{
    menu::{Menu, MenuBuilder, MenuItem, MenuItemBuilder, SubmenuBuilder},
    tray::TrayIconBuilder,
    Emitter,
};
use tracing::{error, info, warn};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .setup(|app| {
            // big thanks to Ratul @ https://ratulmaharaj.com/posts/tauri-custom-menu/
            let quit_item = MenuItem::with_id(app, "edpf-quit", "Quit", true, None::<&str>)?;
            let settings = MenuItemBuilder::new("Settings")
                .id("settings")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;

            let theme = SubmenuBuilder::new(app, "Theme")
                .text("theme-dark", "Dark")
                .text("theme-light", "Light")
                .text("theme-overlay", "Overlay")
                .build()?;
            let menu = MenuBuilder::new(app)
                .item(&theme)
                .separator()
                .text("edit-layout", "Edit")
                .check("theme-on-top", "Always on Top")
                .check("theme-locked", "Locked")
                .separator()
                .item(&settings)
                .separator()
                .item(&quit_item)
                .build()?;

            let tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .build(app)?;

            let app_handle = app.handle();
            event_watchdog::event_watchdog(app_handle);
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
