use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, RwLock},
};

use anyhow::anyhow;
use chrono::{DateTime, Utc};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Wry};
use tokio::fs;
use warp::{
    reject::Rejection,
    reply::{Reply, Response},
    Filter,
};

use super::PluginsState;

pub(super) fn spawn_server_blocking(app_handle: &AppHandle<Wry>) -> anyhow::Result<()> {
    let app_handle_filter = warp::any().map(move || app_handle.clone());

    let asset_route = warp::path!(String / ..)
        .and(warp::path::tail())
        .and(app_handle_filter.clone())
        .and_then(
            async |plugin_id: String, tail: warp::path::Tail, map: AppHandle<Wry>| {
                let plugin_id = plugin_id.clone();
                let state = map.state::<Mutex<PluginsState>>();
                let plugin_frontend_dir = state
                    .lock()
                    .unwrap()
                    .plugin_states
                    .get(&plugin_id)
                    .map(|x| x.frontend_path());

                serve_file(plugin_frontend_dir, tail).await
            },
        );
    Ok(())
}

async fn serve_file(
    plugin_state: Option<PathBuf>,
    tail: warp::path::Tail,
) -> Result<impl Reply, Rejection> {
    let entry = match plugin_state {
        Some(x) => x,
        None => {
            return Ok(warp::reply::with_status(
                "Plugin not mapped",
                warp::http::StatusCode::BAD_REQUEST,
            )
            .into())
        }
    };

    let fs_path = entry.join(tail.as_str());

    if !fs_path.exists() {
        return Ok(warp::reply::with_status(
            "Not Found",
            warp::http::StatusCode::NOT_FOUND,
        ));
    }

    match fs::read(&fs_path).await {
        Ok(contents) => {
            // Guess MIME type
            let mime_type = mime_guess::from_path(&fs_path).first_or_octet_stream();

            let res = warp::http::Response::builder()
                .status(200)
                .header("Content-Type", mime_type.as_ref().parse().unwrap())
                .header("Access-Control-Allow-Origin", "*")
                .body(contents);

            match res {
                Ok(x) => Ok(x),
                Err(e) => Ok(warp::reply::with_status(
                    format!("Failed to serve content: {e}").as_str(),
                    warp::http::StatusCode::INTERNAL_SERVER_ERROR,
                )),
            }
        }
        Err(x) => Ok(warp::reply::with_status(
            format!("Internal Server Error: {x}").as_str(),
            warp::http::StatusCode::INTERNAL_SERVER_ERROR,
        )),
    }
}
