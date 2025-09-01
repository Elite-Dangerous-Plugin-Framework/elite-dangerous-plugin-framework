# Internal Events

Events are Tauri's way of notifying the Frontend about something from the Backend code. This page documents which Events there are and when they are emitted.

## Plugin Reconciliation

### `core/plugins/update`

Written if the Current State of a Plugin has been updated. This is not emitted if the state has not changed since last time.

```json
{
    "id": "my-awesome-plugin",
    "pluginState": ...
}
```

The Frontend will check the current plugin state to check if it is in `Starting` or `Stopping`. The Frontend will then spawn / destroy the Web Component.
Once done, the Frontend sends a Command to finialize the `Running` / `Stopped` state.

### `core/plugins/reconcileComplete`

Written if the reconciliation loop has completed.

_No payload_
