import z from "zod";
import { startAndLoadPlugin } from "./startAndLoadPlugin";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PluginStateZod } from "../types/PluginState";
import { getAllPluginStates } from "../commands/getAllPluginStates";
import { PluginWrapper } from "./PluginWrapper";
import { getRootToken } from "../commands/getRootToken";
import { PluginContext } from "./PluginContext";

export const CurrentUiStateZod = z.union([
  z.object({
    type: z.literal("Running"),
    ref: z.instanceof(HTMLElement),
    contextDestruction: z.function(),
    customElementName: z.string(),
    context: z.instanceof(PluginContext),
  }),
  z.object({
    type: z.literal("Missing"),
  }),
]);
export const PluginStateContainingCurrentStateZod = PluginStateZod.and(
  z.object({
    currentUiState: CurrentUiStateZod,
  })
);

export default class PluginsManager {
  #destructorCallbacks: (() => void)[] = [];
  #pluginState: Record<
    string,
    z.infer<typeof PluginStateContainingCurrentStateZod>
  > = {};

  #rootToken: string | undefined;
  #pluginStateUpdatedCb = (
    newState: Record<
      string,
      z.infer<typeof PluginStateContainingCurrentStateZod>
    >
  ) => {};

  async init(
    updatePluginState: (
      newState: Record<
        string,
        z.infer<typeof PluginStateContainingCurrentStateZod>
      >
    ) => void
  ) {
    this.#rootToken = await getRootToken();
    this.#pluginState = Object.fromEntries(
      Object.entries(await getAllPluginStates()).map(([k, v]) => [
        k,
        { ...v, currentUiState: { type: "Missing" } },
      ])
    );
    this.#updatePluginById(undefined);
    this.#pluginStateUpdatedCb = updatePluginState;
    this.#pluginStateUpdatedCb(this.#pluginState);

    const unlisten = await listen("core/plugins/update", (ev) => {
      const resp = z
        .object({ id: z.string(), pluginState: PluginStateZod })
        .parse(ev.payload);

      if (!this.#pluginState[resp.id]) {
        this.#pluginState[resp.id] = {
          ...resp.pluginState,
          currentUiState: {
            type: "Missing",
          },
        };
      } else {
        this.#pluginState[resp.id] = {
          ...this.#pluginState[resp.id],
          ...resp.pluginState,
        };
      }
      this.#updatePluginById(resp.id);
    });
    this.#destructorCallbacks.push(unlisten);
  }

  destroy() {
    this.#destructorCallbacks.forEach((e) => e());
  }

  #updatePluginById(updatedPluginIds: string | undefined) {
    for (const item of Object.entries(this.#pluginState).filter(
      (e) => updatedPluginIds === undefined || updatedPluginIds == e[0]
    )) {
      const [pluginID, pluginState] = item;
      const currentState = pluginState.current_state.type;
      const maybePluginWrapper = document.getElementById(
        "plugin-cell-" + pluginID
      );
      if (maybePluginWrapper && maybePluginWrapper instanceof PluginWrapper) {
        maybePluginWrapper.notifyAboutNewPluginState(pluginState);
      }
      if (
        currentState === "Starting" ||
        (currentState === "Running" &&
          pluginState.currentUiState.type === "Missing")
      ) {
        // Do reconciliation for Starting (or adopting after a refresh of the UI)
        if (this.#rootToken) {
          startAndLoadPlugin(pluginID, this.#rootToken, (e) =>
            this.#setLoadedPluginsLookup(e, pluginID)
          );
        } else {
          console.error(
            "couldnt start the plugin because we do not have a root token"
          );
        }
      }

      if (currentState === "Disabling") {
        (async () => {
          // Do reconciliation for Disabling
          await this.#setLoadedPluginsLookup({ type: "Missing" }, pluginID);
          await invoke("finalize_stop_plugin", { pluginId: pluginID });
          return;
        })();
      }
    }
  }

  /**
   * Note that PluginsManager is the one responsible for Creating, Moving and Sunsetting Plugin Instances!
   */
  async #setLoadedPluginsLookup(
    newState: z.infer<typeof CurrentUiStateZod>,
    pluginId: string
  ) {
    const previousRef =
      this.#pluginState[pluginId] &&
      this.#pluginState[pluginId].currentUiState.type === "Running"
        ? this.#pluginState[pluginId].currentUiState.ref
        : undefined;
    const newRef = newState.type === "Running" ? newState.ref : undefined;

    let needAdoption = false;
    let needDeletion = false;
    if (newRef === previousRef) {
      // its the same node. We dont need to destroy the node to recreate it
    } else if (previousRef === undefined && newRef !== undefined) {
      // We are at the start of a plugin. It wasnt existing beforehand
      needAdoption = true;
    } else if (previousRef !== undefined && newRef !== previousRef) {
      // We are restarting a plugin
      needAdoption = true;
      needDeletion = true;
    } else if (newRef === undefined && previousRef !== undefined) {
      needDeletion = true;
    }

    if (needDeletion) {
      // todo: await shutdown grace period using ctx
      const maybePromise =
        this.#pluginState[pluginId].currentUiState.type === "Running"
          ? this.#pluginState[pluginId].currentUiState.contextDestruction()
          : undefined;
      if (maybePromise instanceof Promise) {
        await maybePromise;
      }
    }
    // attachment is done via React. The State change causes a rerender in React.
    // this causes the HTML Element reference to be moved (appended) to the relevant node
    this.#pluginState[pluginId].currentUiState = newState;
  }
}
