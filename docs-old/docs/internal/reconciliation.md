# The Plugin Reconciliation and Lifecycle

Each Plugin in EDPF is set up to be Startable and Stoppable. Is the user deletes a Plugin or stops it from the settings, it's Web Component is no longer run.
Note that Plugins running **has nothing to do with them being visible**. If the User decides that a Plugin does not belong on the UI, the Web Component is still created, just hidden away.

This Page walks you through the process of Discovery to Startup, back to Shutdown.

Also, take a look at [`plugins::reconciler_utils`](https://github.com/CMDR-WDX/elite-dangerous-plugin-framework/blob/mvp/src-tauri/src/plugins/reconciler_utils.rs). The there-defined `ReconcileAction` is that is used as the backbone of Reconciliation.

![Overview of Reconciliation](./reconciliation.drawio.svg)

## Discovering Plugins (Adopting)

Every 30s, a background task is run to look at the user's plugin folder.
Each folder that contains a valid `manifest.json` is considered.

If the Plugin is not known yet (using the plugin ID as a matcher), it is Adopted.
There is no difference between Plugins being loaded at startup or during the Program's runtime.

Adoption means that the Plugin is taken in the Program's internal state.
This allows for the HTTP Server to reference the ES-Module, meanining the Frontend can display the Settings and Main component.

If the Plugin was started beforehand, this Action will also [Start](#starting-a-plugin) the plugin.

## Starting a Plugin

This is a brief State and you usually shouldn't even see it.

The Plugin is started. This causes an Event to be sent from the Backend to the Frontend. The Frontend is instructed to Load the ES-Module and spawn the Web Component, pass it all the relevent information, hook up Journal Events, Push this File's Events (if the Plugin desires), and notify the Main Component to move the Web Component to where it needs to be in the UI (or hidden).

### Start Failed

This the Web Component could not be mounted, we go into the Start Failed Phase. The Reconciler will retry to Start the Plugin in each loop over and over. The Settings-Page should contain a reason as to why the Reconcile has failed.

It can be one one of the following reasons:

- the Frontend ES-Module could not be imported (either because it doesn't exist or is malformed)
- the ES-Module does not have a `default` export
- the ES-Module's `default` export is not a class definition which inherits `HTMLElement`.
- something failed registering the Web Component as a Custom Element
- Spawning an Instance of the `HTMLElement` failed.

## Running

The Plugin has been loaded, the Web Component is active, the Plugin is running.
The Reconciler will still check every 30s. As part of that check the a hash is derived from the `frontend` Folder. Is that hash changes, a [Restart]() is triggered.

## Restart

Basically stopping and starting up a Plugin. This is done either Manually via the Settings Panel, or automatically if the Hash of the `frontend` Folder changes.
This will unload the Component as described in [Stop](#stop) and then started up again as described in [Starting](#starting-a-plugin)

## Stop

The Plugin is loaded and should be stopped. Is is removed from the UI. If the Plugin was part of the visible UI, a placeholder will be made in its place.

## SyncInPlace

This is a special reconciliation action that doesn't do anything on the Frontend. It only modifies the Plugin's internal state if it is disabled.

## Drop

This gets EDPF to "forget" about the plugin. This action only happens if you delete a Plugin from the User Plugins Folder.
Note that this does not delete the Plugin from the active list; it also won't delete the Plugin's settings.
