import { CommandWrapper } from "../commands/commandWrapper";
import type { PluginStates, PluginStatesPatch } from "./PluginsManager";
import { startAndLoadPlugin } from "./startAndLoadPlugin";

/**
 * A plugin reconciler
 */
export interface PluginReconciler {
  /**
   * The input contains the "plugin state" as passed by the Backend and the UI State.
   *
   * The job of this function is to try to sync the UI State to what was passed from the Backend.
   * The response is a list of patches that should be applied to the state.
   *
   * Reconciliation is asynchronous and may invoke Commands.
   * Note that this function shall **never modify the returned Plugin State**.
   * Instead, the impl shall invoke a command as needed. This will cause the Plugin Manager to be
   * notified about the new state, which will then invoke the reconciler again, at which point the
   * desired and actual states may converge.
   *
   * While reconciliation is taking place, a Mutex is locked, meaning that no other commands are handled.
   * Do note that plugins are reconciled in parallel however.
   */
  reconcilePlugin(state: PluginStates[string]): Promise<PluginStatesPatch[]>;
}

export default class PluginReconcilerImpl implements PluginReconciler {
  #command: CommandWrapper;
  constructor(command: CommandWrapper) {
    this.#command = command
  }

  public async reconcilePlugin(
    state: PluginStates[string]
  ): Promise<PluginStatesPatch[]> {
    console.log(state.id, {
      ui: state.currentUiState.type,
      main: state.current_state.type,
    });
    if (state.currentUiState.type === "Missing") {
      switch (state.current_state.type) {
        case "Starting":
        // Expected state when starting
        case "Running":
          // This only really happens on an unexpected UI Refresh. In this instance, we just treat it as a Starting flow
          try {
            const result = await startAndLoadPlugin(state.id, this.#command);
            debugger;
            return result
              ? [
                (fullState) => {
                  if (fullState[state.id]) {
                    fullState[state.id].currentUiState = result;
                  }
                },
              ]
              : [];
          } catch (e) {
            console.error(e);
            return [];
          }

        case "Disabled":
          // No UI State, Plugin is missing — as expected
          return [];
        case "FailedToStart":
          // Plugin failed to start while it was in Starting state. In this state, we don't do anything. The Backend will send a new event which will contain a Starting again.
          return [];
        case "Disabling":
          // No Frontend State while disabling is an odd state we would never expect.
          console.warn(
            "Found disabling state with no Frontend State attached. Should never happen",
            state
          );
          const resp = await this.#command.finalizeStopPlugin(state.id);
          if (!resp.success) {
            console.error("failed to finalize stop: " + resp.reason)
          }
          return [];
      }
    }
    if (state.currentUiState.type === "Running") {
      switch (state.current_state.type) {
        case "FailedToStart":
        case "Disabled":
        // getting a Disabled with the UI State Running is illogical, but we should still handle it. We get the state to converge by killing the UI State
        case "Disabling":
          // We got a signal to stop the plugin. If we have a running state, this also means we have a context. We shut it down here
          if (!state.currentUiState.context.destroyed) {
            try {
              await state.currentUiState.contextDestruction();
            } catch (err) {
              console.warn(
                "an error was emitted from a plugin during destruction",
                { pluginID: state.id, err }
              );
            }
          }
          // At this point the Plugin Context is destroyed. If the destructor has failed, we blame the Plugin :)
          // anyhow, we are destroying the reference
          state.currentUiState.ref.remove();

          if (
            state.current_state.type === "Disabled" ||
            state.current_state.type === "Disabling"
          ) {
            const resp = await this.#command.finalizeStopPlugin(state.id);
            if (!resp.success) {
              console.error("failed to finalize stop: " + resp.reason)
            }
          }
          return [
            (fullState) => {
              if (fullState[state.id]) {
                fullState[state.id].currentUiState = {
                  type: "Missing",
                };
              }
            },
          ];

        case "Starting": {
          // We shouldnt be having a UI State here at this point… We also dont have a hash stored at this point. This is why we must do a UI Restart
          if (!state.currentUiState.context.destroyed) {
            try {
              await state.currentUiState.contextDestruction();
            } catch { }
          }
          state.currentUiState.ref.remove();
          const result = await startAndLoadPlugin(state.id, this.#command);

          return [
            (fullState) => {
              if (fullState[state.id]) {
                fullState[state.id].currentUiState = result
                  ? result
                  : { type: "Missing" };
              }
            },
          ];
        }
        case "Running":
          {
            if (state.currentUiState.hash !== state.frontend_hash) {
              if (!state.currentUiState.context.destroyed) {
                try {
                  await state.currentUiState.contextDestruction();
                } catch { }
              }
              state.currentUiState.ref.remove();

              const result = await startAndLoadPlugin(
                state.id,
                this.#command
              );

              return [
                (fullState) => {
                  if (fullState[state.id]) {
                    fullState[state.id].currentUiState = result
                      ? result
                      : { type: "Missing" };
                  }
                },
              ];
            }
          }

          // if the hash is already equal, we have a convergent state
          return [];
      }
    }
    throw new Error("uncovered branch");
  }
}
