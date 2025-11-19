// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Install your own global subscriber first

    #[cfg(not(debug_assertions))]
    tracing_subscriber::fmt()
        .with_file(true)
        .with_env_filter(
            EnvFilter::new("info")
                .add_directive("notify=off".parse().unwrap())
                .add_directive("notify::inotify=off".parse().unwrap()),
        )
        .with_thread_names(true)
        .init();
    elite_dangerous_plugin_framework_lib::run()
}
