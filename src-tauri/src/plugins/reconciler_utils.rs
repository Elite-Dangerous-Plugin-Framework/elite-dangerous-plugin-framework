use std::fmt;

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, Wry};

use super::{PluginCurrentState, PluginState, PluginsState};
use anyhow::anyhow;

/// This enum is used as part of the reconciliation and tells us what the execution plan for a Plugin is.
#[derive(Serialize)]
pub(super) enum ReconcileAction {
    /// Similar to [ReconcileAction::Start], except that the App doesn't yet know about the Plugin's State.  
    /// This happens either during StartUp, or when a Plugin is added at Runtime.
    ///
    /// **NOTE**: [ReconcileAction::Adopt] is also used for disabled plugins. The reconciler logic has some special handling here, looking at the [PluginState::current_state] field.
    /// if this field is [PluginCurrentState::Disabled], it wont bother to go through the startup procedure, and acts more as a "spawning" [ReconcileAction::SyncInPlace]
    Adopt {
        plugin_state: Box<PluginState>,
        frontend_hash: String,
    },
    /// The plugin is inactive and should be started up.  
    /// This means the HTTP Server will open up the route
    /// and the frontend is notified about the plugin and will fetch the Web Component, inject it, and so on
    Start {
        frontend_hash: String,
        plugin_id: String,
    },
    /// This plugin is currently running.  
    /// The HTTP server is told to remove the plugin from its routing. The Web Component is notified about its imminent shutdown.
    /// After that, it is removed from the UI
    Stop { plugin_id: String },
    /// Similar to [ReconcileAction::Stop], except that the App should "forget" about this plugin.
    /// It will be dropped from the plugin state, meaning it wont show up in Settings / Installed Plugins.  
    /// This action is taken when a plugin is deleted during runtime.
    Drop { plugin_id: String },
    /// Stops and Restarts the Plugin, using a new import identified.
    /// Also adds in a patch to modify the previous state.  
    /// This is mainly used to modify the Manifest file. [ReconcileAction::Restart] is usually used when the plugin is already running, while [ReconcileAction::SyncInPlace] is used when it is not running.
    Restart {
        plugin_id: String,
        #[serde(skip)]
        patch: Box<dyn FnMut(&mut PluginState)>,
        frontend_hash: String,
    },
    /// This is an in-place update of the Plugin State, excluding anything else.
    /// This is used if we have a deactivated plugin that had it's manifest updated.
    /// This way, the metadata shown for a Plugin stays up-to-date
    SyncInPlace {
        plugin_id: String,
        #[serde(skip)]
        patch: Box<dyn FnMut(&mut PluginState)>,
    },
}

impl fmt::Debug for ReconcileAction {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Adopt {
                plugin_state,
                frontend_hash,
            } => f
                .debug_struct("Adopt")
                .field("plugin_state", plugin_state)
                .field("frontend_hash", frontend_hash)
                .finish(),
            Self::Start {
                frontend_hash,
                plugin_id,
            } => f
                .debug_struct("Start")
                .field("frontend_hash", frontend_hash)
                .field("plugin_id", plugin_id)
                .finish(),
            Self::Stop { plugin_id } => f
                .debug_struct("Stop")
                .field("plugin_id", plugin_id)
                .finish(),
            Self::Drop { plugin_id } => f
                .debug_struct("Drop")
                .field("plugin_id", plugin_id)
                .finish(),
            Self::Restart {
                plugin_id,
                patch: _,
                frontend_hash,
            } => f
                .debug_struct("Restart")
                .field("plugin_id", plugin_id)
                .field("frontend_hash", frontend_hash)
                .finish(),
            Self::SyncInPlace {
                plugin_id,
                patch: _,
            } => f
                .debug_struct("SyncInPlace")
                .field("plugin_id", plugin_id)
                .finish(),
        }
    }
}

impl ReconcileAction {
    /// Applies the action.
    ///
    /// Responsible for modifying the PluginsState, modifying the HTTP Server config, and notifying to Frontend via an event that it should load/unload a plugin
    pub(super) fn apply(
        self,
        plugins_states: &mut PluginsState,
        app_handle: &AppHandle<Wry>,
    ) -> anyhow::Result<()> {
        match self {
            ReconcileAction::Adopt {
                plugin_state,
                frontend_hash,
            } => {
                let id = plugin_state.id();
                plugins_states
                    .plugin_states
                    .insert(id.clone(), *plugin_state);
                // The rest is just essentially a Start action
                ReconcileAction::Start {
                    frontend_hash,
                    plugin_id: id,
                }
                .apply(plugins_states, app_handle)
            }
            ReconcileAction::Start {
                frontend_hash,
                plugin_id,
            } => {
                let state = match plugins_states.plugin_states.get_mut(&plugin_id) {
                    None => {
                        return Err(anyhow!("Received reconcile to start Plugin {}, but is missing in the plugins state", &plugin_id))
                    },
                    Some(x) => {x},
                };

                state.current_state = PluginCurrentState::Starting {
                    metadata: vec![],
                    frontend_hash: frontend_hash.clone(),
                };

                /*
                The Frontend side listens for this event and will start the plugin
                (or at least try to)
                during start up it might invoke a command to push metadata.
                once it has successfully
                - await import(...)-ed the new module
                - asserted the default import is an HTMLElement
                - registered the Web Component
                - spawned a new instance
                - attached the instance to the DOM
                it will push a completion command. The backend will set the state to Running
                 */
                _ = app_handle.emit(
                    "core.plugin.started",
                    json!({
                        "plugin_id": plugin_id.clone(),
                        "frontend_hash": frontend_hash.clone(),
                    }),
                );
                Ok(())
            }
            ReconcileAction::Stop { plugin_id } => {
                let state = match plugins_states.plugin_states.get_mut(&plugin_id) {
                    None => {
                        return Err(anyhow!(
                        "Received reconcile to stop Plugin {}, but is missing in the plugins state",
                        &plugin_id
                    ))
                    }
                    Some(x) => x,
                };

                state.current_state = PluginCurrentState::Disabling {};

                /*
                The Frontend side listens for this event and will stop the plugin

                it will
                - unload the web-component and replace the UI with a "Stopped" placeholder
                - the HTTP Server will no longer pass through the Hash

                it will push a completion command. The backend will set the state to Disabled
                 */
                _ = app_handle.emit(
                    "core.plugin.disabling",
                    json!({
                        "plugin_id": plugin_id.clone(),
                    }),
                );
                todo!()
            }
            ReconcileAction::Drop { plugin_id } => {
                let plugin_id = plugin_id.clone();
                _ = app_handle.emit(
                    "core.plugin.disabling",
                    json!({
                            "plugin_id": plugin_id.clone(),
                    }),
                );
                // We get rid of our state about this plugin
                plugins_states.plugin_states.remove(&plugin_id);
                Ok(())
            }
            ReconcileAction::Restart {
                plugin_id,
                patch,
                frontend_hash,
            } => {
                ReconcileAction::SyncInPlace {
                    plugin_id: plugin_id.clone(),
                    patch,
                }
                .apply(plugins_states, app_handle);

                let state = match plugins_states.plugin_states.get(&plugin_id) {
                    None => {
                        return Err(anyhow!(
                        "Received reconcile to restart Plugin {}, but is missing in the plugins state",
                        &plugin_id
                    ))
                    }
                    Some(x) => x,
                };

                match state.current_state {
                    PluginCurrentState::Disabling {} | PluginCurrentState::Disabled => {
                        // We are already "on the way down" or already down.
                        // Just start it up against
                        ReconcileAction::Start {
                            frontend_hash: frontend_hash.clone(),
                            plugin_id: plugin_id.clone(),
                        }
                        .apply(plugins_states, app_handle)
                    }
                    PluginCurrentState::Starting { .. }
                    | PluginCurrentState::FailedToStart { .. }
                    | PluginCurrentState::Running { .. } => {
                        // Tell the frontend to do a restart
                        _ = app_handle.emit(
                            "core.plugin.restart",
                            json!({
                                    "plugin_id": plugin_id.clone(),
                                    "frontend_hash": frontend_hash.clone()
                            }),
                        );
                        Ok(())
                    }
                }
            }
            ReconcileAction::SyncInPlace {
                plugin_id,
                mut patch,
            } => {
                let state = match plugins_states.plugin_states.get_mut(&plugin_id) {
                    None => {
                        return Err(anyhow!(
                        "Received reconcile to sync in place Plugin {}, but is missing in the plugins state",
                        &plugin_id
                    ))
                    }
                    Some(x) => x,
                };
                patch(state);
                Ok(())
            }
        }
    }
}
