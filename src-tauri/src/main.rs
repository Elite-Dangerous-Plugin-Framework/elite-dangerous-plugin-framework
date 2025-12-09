// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tracing_subscriber::EnvFilter;

fn main() {
    // Install your own global subscriber first
    /*
    tracing_subscriber::fmt()
        .with_file(true)
        .with_env_filter(
            EnvFilter::new("info")
                .add_directive("notify=off".parse().unwrap())
                .add_directive("notify::inotify=off".parse().unwrap()),
        )
        .with_thread_names(true)
        .init();
     */
    tracing_subscriber::fmt()
        .pretty()
        .with_line_number(true)
        .with_env_filter(
            EnvFilter::new("info")
                .add_directive("notify=off".parse().unwrap())
                .add_directive("notify::inotify=off".parse().unwrap()),
        )
        .init();
    elite_dangerous_plugin_framework_lib::run()
}
