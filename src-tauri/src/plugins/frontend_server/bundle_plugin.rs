use anyhow::anyhow;
use chrono::Utc;
use get_dir_hash::{get_dir_hash, Options};
use std::{
    env,
    fs::File,
    io::{self, Cursor},
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tauri::{AppHandle, Wry};
use tokio::time::timeout;
use zip::ZipArchive;

use super::{PluginCompilationState, PluginCompilationStateWithName};

const EMBEDDED_BUN_ZIP: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/bun.zip"));
const EMBEDDED_BUN_ZIP_SHA: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/bun.zip.sha256"));

fn prepare_embedded_bun_binary() -> anyhow::Result<PathBuf> {
    let hash = format!("{:?}", EMBEDDED_BUN_ZIP_SHA);
    let file_ending = {
        #[cfg(target_os = "windows")]
        {
            ".exe"
        }
        #[cfg(not(target_os = "windows"))]
        {
            ""
        }
    };
    let filename = format!("edpf-bun-{}{}", hash, file_ending);

    let target_filename = env::temp_dir().join(filename);
    if target_filename.is_file() {
        return Ok(target_filename);
    }

    let zip_internal_pointer = format!("bun{}", file_ending);

    let reader = Cursor::new(EMBEDDED_BUN_ZIP);
    let mut archive = match ZipArchive::new(reader) {
        Ok(x) => x,
        Err(e) => return Err(anyhow!("failed to open zip archive: {e}")),
    };
    let mut entry = archive
        .by_name(&zip_internal_pointer)
        .expect("File not found inside zip");
    let mut outfile = File::create(&target_filename)?;
    io::copy(&mut entry, &mut outfile)?;
    Ok(target_filename)
}

/// Will try to bundle the plugin using either
/// - a bundled bun-Binary (default)
/// - the system-provided bun-Binary (requires bun in $PATH)
///
/// note that the status does not notify about the success of the plugin bundle
/// you need to subscribe to the relevant event to get notified about that
pub(super) async fn trigger_plugin_bundle(
    app_handle: &AppHandle<Wry>,
    plugin_name: String,
    frontend_folder: PathBuf,
) -> anyhow::Result<()> {
    let entry_point = vec!["index.tsx", "index.ts", "index.jsx", "index.js"]
        .into_iter()
        .map(|x| frontend_folder.join(x))
        .find(|x| x.is_file());

    let entry = match entry_point {
        Some(x) => x,
        None => {
            PluginCompilationStateWithName::new(
                &plugin_name,
                PluginCompilationState::MissingEntrypoint,
            )
            .emit(app_handle)?;
            return Err(anyhow!("Bundle failed due to missing entry point"));
        }
    };

    let bun_binary = match prepare_embedded_bun_binary() {
        Ok(x) => x,
        Err(e) => return Err(e),
    };

    let (output_dir, hash) = match get_dir_hash(
        &frontend_folder,
        &Options {
            follow_symlinks: false,
            case_sensitive_paths: false,
            ignore_patterns: vec!["node_modules/**".to_string(), "dist/**".to_string()],
            ..Default::default()
        },
    ) {
        Ok(hashed_state) => (
            frontend_folder.join("dist").join(&hashed_state),
            hashed_state,
        ),
        Err(x) => {
            PluginCompilationStateWithName::new(
                &plugin_name,
                PluginCompilationState::BundlingFailed {
                    reason: "failed to infer hashed input".into(),
                },
            )
            .emit(app_handle)?;
            return Err(anyhow!("Failed to build hash state: {x}"));
        }
    };

    if !try_install_node_deps(&bun_binary, &frontend_folder, &plugin_name, app_handle).await? {
        return Err(anyhow!("Failed to install node deps"));
    }

    if !try_bundle_plugin(
        &bun_binary,
        &frontend_folder,
        &plugin_name,
        &entry,
        app_handle,
        &output_dir,
    )
    .await?
    {
        return Err(anyhow!("Failed to bundle plugins"));
    }

    // This emit will cause the frontend server to create a new link for the plugin
    PluginCompilationStateWithName::new(
        &plugin_name,
        PluginCompilationState::FinishedSuccessfully {
            hash,
            location: output_dir,
        },
    )
    .emit(app_handle)?;
    Ok(())
}

async fn try_bundle_plugin(
    bun_binary: &Path,
    frontend_folder: &Path,
    plugin_name: &str,
    input_file: &Path,
    app_handle: &AppHandle<Wry>,
    out_dir: &Path,
) -> anyhow::Result<bool> {
    let mut build_command = tokio::process::Command::new(bun_binary);
    build_command.arg("build");
    build_command.arg("--sourcemap=inline");
    build_command.arg("--format=esm");
    build_command.arg("--target=browser");
    build_command.arg("--outdir");
    build_command.arg(out_dir);
    build_command.arg(input_file);
    // We completely disallow any bun config due to security implications as the bunfig can reference plugins which may run arbitrary code on the host.
    // This in turn means we cannot use stuff like sass/scss.
    // in the future, we might expose a sensible default of plugins or add some vetted requested plugins,
    // or maybe an option for an "unsafe mode" which will read the bunfig, gated behind a separate Permission
    build_command.env("BUN_CONFIG", "none");
    build_command.env("DO_NOT_TRACK", "1");
    build_command.current_dir(frontend_folder);
    build_command.stderr(Stdio::piped());
    build_command.stdout(Stdio::piped());

    let build_command_handle = match build_command.spawn() {
        Ok(x) => x,
        Err(e) => return Err(e.into()),
    };

    PluginCompilationStateWithName::new(
        plugin_name,
        PluginCompilationState::DownloadingDependencies {
            started_at: Utc::now(),
        },
    )
    .emit(app_handle)?;

    match timeout(
        Duration::from_mins(1),
        build_command_handle.wait_with_output(),
    )
    .await
    {
        Err(e) => PluginCompilationStateWithName::new(
            plugin_name,
            PluginCompilationState::BundlingFailed {
                reason: format!("Bun build has failed: {}", e),
            },
        )
        .emit(app_handle)
        .map(|_| false),
        Ok(status) => match status {
            Ok(x) => {
                if !x.status.success() {
                    let err_meta = String::from_utf8_lossy(&x.stderr);
                    PluginCompilationStateWithName::new(
                        plugin_name,
                        PluginCompilationState::BundlingFailed {
                            reason: format!("Call to bun install failed: {}", err_meta),
                        },
                    )
                    .emit(app_handle)
                    .map(|_| false)
                } else {
                    Ok(true)
                }
            }
            Err(e) => PluginCompilationStateWithName::new(
                plugin_name,
                PluginCompilationState::BundlingFailed {
                    reason: format!("Call to bun install failed: {}", e),
                },
            )
            .emit(app_handle)
            .map(|_| false),
        },
    }
}

/// Installs node dependencies for provided plugin
/// Returns true if this was successful
async fn try_install_node_deps(
    bun_binary: &Path,
    frontend_folder: &Path,
    plugin_name: &str,
    app_handle: &AppHandle<Wry>,
) -> anyhow::Result<bool> {
    let mut install_command = tokio::process::Command::new(bun_binary);
    install_command.arg("install");
    install_command.arg("--ignore-scripts");
    install_command.arg("--production");
    install_command.arg("--no-save");
    install_command.stdout(Stdio::piped());
    install_command.stderr(Stdio::piped());
    install_command.env("DO_NOT_TRACK", "1");
    install_command.current_dir(frontend_folder);
    let install_command_handle = match install_command.spawn() {
        Ok(x) => x,
        Err(e) => return Err(e.into()),
    };

    PluginCompilationStateWithName::new(
        plugin_name,
        PluginCompilationState::DownloadingDependencies {
            started_at: Utc::now(),
        },
    )
    .emit(app_handle)?;

    match timeout(
        Duration::from_mins(1),
        install_command_handle.wait_with_output(),
    )
    .await
    {
        Err(e) => PluginCompilationStateWithName::new(
            plugin_name,
            PluginCompilationState::DownloadingDependenciesFailed {
                reason: format!("Dependencies were not downloaded after {}", e),
            },
        )
        .emit(app_handle)
        .map(|_| false),
        Ok(status) => match status {
            Ok(x) => {
                let stde = String::from_utf8_lossy(&x.stderr);

                if !x.status.success() {
                    PluginCompilationStateWithName::new(
                        plugin_name,
                        PluginCompilationState::DownloadingDependenciesFailed {
                            reason: format!("Call to bun install failed: {}", &stde),
                        },
                    )
                    .emit(app_handle)
                    .map(|_| false)
                } else {
                    Ok(true)
                }
            }
            Err(e) => PluginCompilationStateWithName::new(
                plugin_name,
                PluginCompilationState::DownloadingDependenciesFailed {
                    reason: format!("Call to bun install failed: {}", e),
                },
            )
            .emit(app_handle)
            .map(|_| false),
        },
    }
}
