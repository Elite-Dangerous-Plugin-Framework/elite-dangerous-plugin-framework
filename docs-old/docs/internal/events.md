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

### `core/journal/eventBatch`

Contains a list of ordered events from the Journal.

> **NOTE**: Events are **NOT** passed as a `Vec` of `serde_json::Value`s, but instead as `Vec<String>`. This is because JS makes use of IEEE 754 double-precision floating point numbers for _any_ number (within a JSON). While fine for most numbers, this is not safe for big numbers like System IDs.
>
> The Events are passed as a stringified String, upstream then has to see how they parse the JSON (e.g. using a `BigInt` for any unsafe integer)

```json
{
  "cmdr": "Name of Commander",
  "source": "/path/to/journal/Journal.2025-09-31T173924.01.log",
  // events are time-sorted (ascending)
  "events": [
    "{ \"timestamp\":\"2025-09-31T01:28:26Z\", \"event\":\"ShipLocker\" }",
    "{ \"timestamp\":\"2025-09-31T01:28:26Z\", \"event\":\"MaterialCollected\", \"Category\":\"Manufactured\", \"Name\":\"chemicaldistillery\", \"Name_Localised\":\"Chemical Distillery\", \"Count\":3 }",
    "{ \"timestamp\":\"2025-09-31T01:28:28Z\", \"event\":\"ShipLocker\" }"
  ]
}
```

Batching will only ever occur per Commander (or more precisely, per Journal file)
