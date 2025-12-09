use std::{
    collections::HashMap,
    net::SocketAddr,
    path::{Component, Path as StdPath, PathBuf},
    sync::Arc,
};

use super::{PluginState, PluginsState};
use anyhow::anyhow;
use axum::{
    Json, Router,
    body::Body,
    extract::{Path, State},
    http::{Response, StatusCode},
    response::IntoResponse,
    routing::get,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Wry};
use tokio::{net::TcpListener, sync::RwLock};
use tower_http::cors::CorsLayer;
use tracing::{error, info};

#[derive(Debug, Deserialize, Serialize, Clone)]
pub(crate) struct HttpServerState {
    address: SocketAddr,
}

impl HttpServerState {
    pub(crate) fn make_import_base(&self, plugin: &PluginState) -> String {
        let port = self.address.port();
        format!(
            "http://localhost:{}/{}/{}",
            port, plugin.id, plugin.frontend_hash
        )
    }
}

type InjectableState = Arc<RwLock<PluginsState>>;

/// This spawns a new thread that will act as the Server ingress
pub(crate) async fn spawn_server_blocking(app_handle: &AppHandle<Wry>) -> anyhow::Result<()> {
    let cors = CorsLayer::very_permissive().allow_credentials(false);

    // Port 0 -> we pick any free one
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("Failed to spawn Server due to failing to spawn a TCP Listener");
    let addr = listener.local_addr().unwrap();
    {
        if !app_handle.manage(HttpServerState { address: addr }) {
            return Err(anyhow!(
                "The HTTP Server state was already set, meaning it was already running. Closing HTTP Server"
            ));
        }
    }

    info!("Preparing HTTP Server to run on {}", addr);

    let state_ref: InjectableState = app_handle
        .state::<Arc<RwLock<PluginsState>>>()
        .inner()
        .clone();

    let router = Router::new()
        .route("/{plugin}/{hash}/{*path}", get(serve_asset))
        .route("/", get(debug_mapping))
        .layer(cors)
        .with_state(state_ref);

    if let Err(e) = axum::serve(listener, router.into_make_service()).await {
        error!("Failed to start up Content server!");
        return Err(anyhow::anyhow!("failed to start content server: {e}"));
    }

    Ok(())
}

async fn debug_mapping(State(state): State<InjectableState>) -> impl IntoResponse {
    let iter: HashMap<String, String> = state
        .read()
        .await
        .plugin_states
        .iter()
        .map(|(k, v)| (k.to_string(), v.frontend_path().display().to_string()))
        .collect();

    Json(iter).into_response()
}

/// Serves the assets. Note that a hash is used in the path. We do not use that hash when serving files. This is merely used for cache busting / ES Module resolution.
async fn serve_asset(
    State(state): State<InjectableState>,
    Path((plugin, _, tail)): Path<(String, String, String)>,
) -> impl IntoResponse {
    let root = {
        if let Some(plugin_state) = state.read().await.plugin_states.get(&plugin) {
            plugin_state.frontend_path()
        } else {
            return StatusCode::NOT_FOUND.into_response();
        }
    };
    let path_to_resource = safe_join(&root, StdPath::new(&tail));
    let bytes = match tokio::fs::read(&path_to_resource).await {
        Ok(bytes) => bytes,
        Err(_) => return StatusCode::NOT_FOUND.into_response(),
    };

    let ct = mime_guess::from_path(&path_to_resource).first();

    match ct {
        Some(ct) => Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", ct.as_ref())
            .body(Body::from(bytes))
            .unwrap(),
        None => Response::builder()
            .status(StatusCode::OK)
            .body(Body::from(bytes))
            .unwrap(),
    }
}

fn safe_join(root: &StdPath, tail: &StdPath) -> PathBuf {
    let mut out = PathBuf::from(root);

    for comp in tail.components() {
        match comp {
            Component::Normal(p) => out.push(p),
            Component::CurDir => {}
            // Reject anything that would escape or change drive/root
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                // Skip/ignore to prevent traversal
                continue;
            }
        }
    }
    out
}
