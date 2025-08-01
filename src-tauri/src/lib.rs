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

/// Finds all modified journal files and returns the CMDR and PathBuf to the Log
fn find_recently_modified_log_files(
    dir: &PathBuf,
    after_time: DateTime<Utc>,
) -> io::Result<Vec<DirEntry>> {
    let mut response = vec![];
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();

        if !path.is_file() || path.extension().and_then(|x| x.to_str()) != Some("log") {
            continue;
        }
        let metadata = fs::metadata(&path)?;
        let last_modified = match metadata.modified() {
            Ok(x) => DateTime::<Utc>::from(x),
            Err(_) => continue,
        };
        if last_modified > after_time {
            response.push(entry);
        }
    }
    Ok(response)
}

fn get_last_event_ts_and_name_from_log(
    log_file: DirEntry,
) -> Result<(String, DateTime<Utc>), String> {
    let log_file = ed_journals::logs::LogFile::try_from(log_file).map_err(|x| {
        error!("Log File Error: {x}");
        format!("{x}")
    })?;

    let mut cmdr = None;
    let mut last_event = None;

    for entry in log_file.create_blocking_reader().unwrap().flatten() {
        if let LogEventContent::Commander(x) = &entry.content {
            cmdr = Some(x.name.clone())
        }
        last_event = Some(entry.timestamp)
    }
    match (cmdr, last_event) {
        (Some(cmdr), Some(last_event)) => Ok((cmdr, last_event)),
        _ => Err("Either didn't find a CMDR or this is an empty log file".into()),
    }
}

/// An "enhanced" Log Entry containing where that log entry is from (which file), and who it belongs to
#[derive(Serialize, Deserialize, Debug, Clone)]
pub(crate) struct LogEventWithContext {
    pub(crate) log_event: LogEvent,
    pub(crate) source: PathBuf,
    pub(crate) cmdr: String,
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
            // We spawn a background thread that is responsible to listen for changes to the journal directory.
            // This contains essentially nested threads. We make the assumption that multiple players can be active as the same
            // time (=multiboxing).
            // This thread is a watchdog looking for changed journals. Once we found one, a new thread for that journal is created.
            // ed_journals will read each item in the log
            thread::Builder::new()
                .name("edpf-journal-watchdog".into())
                .spawn({
                    let app_handle = app_handle.clone();
                    move || {
                    let journal_dir = ed_journals::journal::auto_detect_journal_path().unwrap();
                    // bit of an assumption that any "active" players received
                    let mut last_checked_time = Utc::now() - TimeDelta::seconds(60 * 2);
                    // a mapping of CMDR Name to what is considered the active journal file
                    let mut active_journal_files = bimap::BiMap::<String, PathBuf>::new();
                    // when spawning a new Sub-Thread, we create a new handle and put it here. Later on, we can abort that handle, which in turn finishes the listener
                    let mut active_handles = HashMap::new();

                    loop {
                        let new_cmdr_journal_files =
                            match find_recently_modified_log_files(&journal_dir, last_checked_time)
                            {
                                Err(e) => {
                                    error!(
                                        "Failed to get recently modified log files. Skipping: {e}"
                                    );
                                    thread::sleep(Duration::from_secs(30));
                                    continue;
                                }
                                Ok(x) => x.into_iter().filter_map(|x| {
                                    let path = x.path();
                                    get_last_event_ts_and_name_from_log(x).ok().and_then(
                                        |(cmdr, last_ts)| {
                                            if last_ts < last_checked_time {
                                                return None;
                                            }
                                            Some((cmdr, path))
                                        },
                                    )
                                }),
                            };
                        for (cmdr, file) in new_cmdr_journal_files {
                            match active_journal_files.insert(cmdr.clone(), file.clone()) {
                                bimap::Overwritten::Pair(_, _) => {
                                    // no need to do anything as this File is already being handled
                                }
                                _ => {
                                    let reader =
                                        match ed_journals::logs::blocking::LiveLogFileReader::open(
                                            file.clone(),
                                        ) {
                                            Ok(x) => x,
                                            Err(e) => {
                                                error!(
                                                    "Failed to create a reader for File {}: {e}",
                                                    file.display()
                                                );
                                                continue;
                                            }
                                        };
                                    let handle = reader.handle();
                                    if let Some(old_handle) = active_handles.insert(cmdr.clone(), handle) {
                                        // if here, this CMDR used to have a different handle. In this instance, we stop the previous handle, which in turn will stop the related thread
                                        old_handle.stop();
                                    }
                                    if let Err(e) = thread::Builder::new()
                                        .name(format!(
                                            "edpf-journal-watchdog-{}",
                                            file.to_string_lossy()
                                        ))
                                        .spawn({
                                            let app_handle = app_handle.clone();
                                            let file_clone = file.clone();
 
                                            move || {for event in reader {
                                            match event {
                                                Err(e) => warn!("failed to read event. skipping: {e}"),
                                                Ok(log_event) => {
                                                    info!("{}", serde_json::to_string(&log_event).unwrap());
                                                    if let Err(e) = app_handle.emit("journal_events", vec![LogEventWithContext{ log_event, source: file_clone.clone(), cmdr: cmdr.clone() }]) {
                                                        warn!("failed to emit journal_events message: {}", e);
                                                    }
                                                },
                                            }
                                        }; info!("watchdog for {} is finished", file_clone.display())}}) {
                                            error!("Failed to spawn Thread to listen on File Changes on {}: {}", file.display(), e)
                                        }
                                }
                            }
                        }
                        last_checked_time = Utc::now();
                        info!("Sleeping in Watchdog…");
                        thread::sleep(Duration::from_secs(30));
                    }
                }})
                .unwrap();

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
