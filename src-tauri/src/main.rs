// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(debug_assertions)]
    tracing_subscriber::fmt()
        .with_file(true)
        .with_thread_names(true)
        .with_line_number(true)
        .pretty()
        .init();
    #[cfg(not(debug_assertions))]
    tracing_subscriber::fmt()
        .with_file(true)
        .with_thread_names(true)
        .init();
    elite_dangerous_plugin_framework_lib::run()
}
