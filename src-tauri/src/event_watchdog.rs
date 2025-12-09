use axum::extract::Path;
use chrono::{DateTime, TimeDelta, Utc};
use ed_journals::logs::LogEventContent;
use serde::{Deserialize, Serialize};
use std::{
    fmt::Debug,
    fs::{self, DirEntry},
    io,
    path::PathBuf,
    sync::Arc,
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, Wry};
use tokio::{
    sync::{mpsc, RwLock},
    time::sleep,
};
use tracing::{error, info, info_span, warn, Instrument};

pub(super) async fn event_watchdog(app_handle: &AppHandle<Wry>) -> ! {
    // We spawn a background thread that is responsible to listen for changes to the journal directory.
    // This contains essentially nested threads. We make the assumption that multiple players can be active as the same
    // time (=multiboxing).
    // This thread is a watchdog looking for changed journals. Once we found one, a new thread for that journal is created.
    // ed_journals will read each item in the log

    let active_journal_files = app_handle
        .state::<Arc<RwLock<bimap::BiMap<String, PathBuf>>>>()
        .inner()
        .clone();

    let app_handle = app_handle.clone();
    let journal_dir = ed_journals::journal::auto_detect_journal_path().unwrap();
    // bit of an assumption that any "active" players received
    let mut last_checked_time = Utc::now() - TimeDelta::seconds(60 * 2);
    // a mapping of CMDR Name to what is considered the active journal file

    loop {
        info!("Running Journal Watchdog…");
        let new_cmdr_journal_files =
            match find_recently_modified_log_files(&journal_dir, last_checked_time) {
                Err(e) => {
                    error!("Failed to get recently modified log files. Skipping: {e}");
                    thread::sleep(Duration::from_secs(30));
                    continue;
                }
                Ok(x) => x.into_iter().filter_map(|x| {
                    let path = x.path();
                    get_last_event_ts_and_name_from_log(x)
                        .ok()
                        .and_then(|(cmdr, last_ts)| {
                            if last_ts < last_checked_time {
                                return None;
                            }
                            Some((cmdr, path))
                        })
                }),
            };
        for (cmdr, file) in new_cmdr_journal_files {
            let active_journal_files = active_journal_files.clone();
            if let bimap::Overwritten::Pair(_, _) = active_journal_files
                .write()
                .await
                .insert(cmdr.clone(), file.clone())
            {
                // no need to do anything as this File is already being handled
                continue; // continue to next file
            }
            // at this point the write lock is release again
            let reader =
                match ed_journals::logs::asynchronous::RawLiveLogFileReader::open(file.clone())
                    .await
                {
                    Ok(x) => x,
                    Err(e) => {
                        error!("Failed to create a reader for File {}: {e}", file.display());
                        continue;
                    }
                };
            let span = info_span!(
                "journal-reader",
                "cmdr" = cmdr.clone(),
                "file" = format!("{}", file.display())
            );
            let app_handle = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                let file_clone = file.clone();
                let app_handle = app_handle;
                let cmdr = cmdr.clone();
                let mut reader = reader;
                let (events_tx, mut events_rx) = mpsc::channel::<LogEventWithContext>(128);

                tauri::async_runtime::spawn(async move {
                    let mut buffer = Vec::new();
                    loop {
                        let first = match events_rx.recv().await {
                            None => break, // channel closed
                            Some(ev) => ev,
                        };
                        buffer.push(first);

                        // leading delay is how long we wait after the first, and subsequent events came in
                        let leading_delay = Duration::from_millis(100);
                        // the upper limit per batch. If a batch was started, it will collect for at most 500ms before emitting.
                        let max_delay = Duration::from_millis(500);   
                        let leading_timer = sleep(leading_delay);
                        let max_timer = sleep(max_delay);
                        tokio::pin!(leading_timer);
                        tokio::pin!(max_timer);

                        loop {
                            tokio::select! {
                                biased;

                                maybe_ev = events_rx.recv() => {
                                    match maybe_ev {
                                        Some(ev) => {
                                            buffer.push(ev);
                                            leading_timer.as_mut().reset(tokio::time::Instant::now() + leading_delay);
                                        }
                                        None => {
                                            // channel closed
                                            break;
                                        }
                                    }
                                }

                                // we spent 100ms after the last event. Time to flush
                                _ = &mut leading_timer => {
                                    break
                                }

                                // we spent 0.5s - we flush, even if we are still in an event stream
                                _ = &mut max_timer => {
                                    break
                                }
                            }
                        }

                        if buffer.is_empty() {
                            continue;
                        }

                        if let Err(e) = app_handle.emit("journal_events", &buffer) {
                            warn!("failed to emit journal_events message: {}", e);
                        } else {
                            info!("Pushed {} journal events.", buffer.len())
                        }
                        buffer.clear();
                    }
                });

                loop {
                    match reader.next().await {
                        None => {
                            // This reader is done
                            break;
                        },
                        Some(x) => match x {
                            Err(e) => {
                                match e {
                                    ed_journals::logs::asynchronous::LogFileReaderError::IO(error) => {
                                        // IO Errors are deemed unrecoverable. Close the reader
                                        active_journal_files.write().await.remove_by_right(&file_clone);
                                        // ^ removing here means that the task will be recreated on the next reconcile
                                        error!("IO Error trying to read Journal at {}. Dropping listener. Err: {error}", file_clone.display());
                                        break
                                    },
                                    ed_journals::logs::asynchronous::LogFileReaderError::FailedToParseLine(error) => {
                                    warn!("failed to read log entry. skipping line: {error}");

                                    },
                                }
                            },
                            Ok(x) => {
                                let ev = LogEventWithContext {
                                    event: serde_json::to_string(&x).unwrap(),
                                    source: file_clone.clone(),
                                    cmdr: cmdr.clone(),
                                };
                                if let Err(e) = events_tx.send(ev).await {
                                    warn!("failed to send event to debouncer for cmdr {}: {}", cmdr, e);
                                }
                            },
                        },
                    }
                }

            }.instrument(span));
        }
        last_checked_time = Utc::now();
        _ = sleep(Duration::from_secs(30)).await;
    }
}

// Finds all modified journal files and returns the CMDR and PathBuf to the Log
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
    // contains a stringified JSON
    pub(crate) event: String,
    pub(crate) source: PathBuf,
    pub(crate) cmdr: String,
}
