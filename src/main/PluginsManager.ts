import z from "zod";
import { listen } from "@tauri-apps/api/event";
import { PluginStateZod } from "../types/PluginState";
import { getAllPluginStates } from "../commands/getAllPluginStates";
import { PluginContext } from "./PluginContext";
import { PluginReconciler } from "./PluginReconciler";
import { Mutex } from "@livekit/mutex";

function equatePluginStates(
  a: undefined | PluginStates[string],
  b: undefined | PluginStates[string]
): boolean {
  if (!a && !b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }

  if (
    a.frontend_hash !== b.frontend_hash ||
    a.current_state.type !== b.current_state.type ||
    a.id !== b.id ||
    a.plugin_dir !== b.plugin_dir ||
    a.source !== b.source ||
    a.currentUiState.type !== b.currentUiState.type
  ) {
    return false;
  }
  if (
    a.currentUiState.type === "Running" &&
    b.currentUiState.type === "Running" &&
    (a.currentUiState.ref !== b.currentUiState.ref ||
      a.currentUiState.context !== b.currentUiState.context)
  ) {
    return false;
  }
  if (
    a.manifest.type !== b.manifest.type ||
    a.manifest.name !== b.manifest.name ||
    a.manifest
  ) {
    return false;
  }
  return true;
}

function clonePluginState(a: PluginStates[string]): PluginStates[string] {
  return {
    ...a,
    currentUiState: {
      ...a.currentUiState,
    },
    current_state: {
      ...a.current_state,
    },
    manifest: {
      ...a.manifest,
    },
  };
}

export const CurrentUiStateZod = z.union([
  z.object({
    type: z.literal("Running"),
    ref: z.instanceof(HTMLElement),
    contextDestruction: z.function({
      input: z.tuple([]),
    }),
    hash: z.string(),
    notifySettingsChanged: z.function({
      input: z.tuple([z.string(), z.string()]),
    }),
    context: z.instanceof(PluginContext),
  }),
  z.object({
    type: z.literal("Missing"),
  }),
]);
export const PluginStateContainingCurrentStateZod =
  PluginStateZod.readonly().and(
    z.object({
      currentUiState: CurrentUiStateZod,
    })
  );

export type PluginStates = Record<
  string,
  z.infer<typeof PluginStateContainingCurrentStateZod>
>;
export type PluginStatesPatch = (state: PluginStates) => void;

export default class PluginsManager {
  #destructorCallbacks: (() => void)[] = [];
  #pluginState: Record<
    string,
    z.infer<typeof PluginStateContainingCurrentStateZod>
  > = {};
  /**
   * When we get a new plugin state via an event, we put a new event onto the stack.
   * We aggregate them and then apply them after a burst of events is over
   *
   * # WARNING
   * Access to this resource is gated behind the {@link PluginsManager.#pluginUpdateMutex} Mutex
   */
  #pluginStatePatches: ((state: PluginStates) => void)[] = [];
  #pluginUpdateMutex = new Mutex();
  #pluginStateUpdatedCb: PluginStatesPatch = (_: PluginStates) => {};

  constructor(private reconciler: PluginReconciler) {}

  async init(updatePluginState: (newState: PluginStates) => void) {
    const changeSet = Object.entries(await getAllPluginStates()).map(
      ([k, v]) => [k, { ...v, currentUiState: { type: "Missing" } }] as const
    );

    this.#pluginStatePatches.push((state) => {
      changeSet.forEach(([k, v]) => {
        state[k] = v;
      });
    });
    this.#pluginStatePatchesTouched();

    this.#pluginStateUpdatedCb = updatePluginState;

    const unlisten = await listen("core/plugins/update", async (ev) => {
      const resp = z
        .object({ id: z.string(), pluginState: PluginStateZod })
        .parse(ev.payload);

      const patch = (pluginState: PluginStates) => {
        if (!pluginState[resp.id]) {
          pluginState[resp.id] = {
            ...resp.pluginState,
            currentUiState: {
              type: "Missing",
            },
          };
        } else {
          pluginState[resp.id] = {
            ...pluginState[resp.id],
            ...resp.pluginState,
          };
        }
      };
      const unlock = await this.#pluginUpdateMutex.lock();
      try {
        this.#pluginStatePatches.push(patch);
        this.#pluginStatePatchesTouched();
      } finally {
        unlock();
      }
    });
    this.#destructorCallbacks.push(unlisten);
  }

  /**
   * Whenever we get an event, this function should be invoked. We wait 100ms after we get an event, as events can come in bursts.
   */
  #pluginStatePatchesTouched() {
    if (this.#pluginStatePatchesTouchedTimeout) {
      clearTimeout(this.#pluginStatePatchesTouchedTimeout);
    }
    this.#pluginStatePatchesTouchedTimeout = setTimeout(async () => {
      // if here, we drain the queue of events. We collect the plugins that have updated in the meantime
      // We could do some granular checking of which states were updated. But it is easier to just let the plugins reconcile themselves
      const unlock = await this.#pluginUpdateMutex.lock();
      try {
        const newState = Object.fromEntries(
          Object.entries(this.#pluginState).map(([k, v]) => [
            k,
            clonePluginState(v),
          ])
        );
        while (true) {
          const patch = this.#pluginStatePatches.shift();
          if (!patch) {
            // We drained the patches.
            break;
          }
          patch(newState);
        }
        // This does not find completely removed plugins. But this is fine. A plugin shall only be ever removed after it was fully uninitialized!
        const changedPlugins = Object.keys(newState).filter(
          (e) => !equatePluginStates(newState[e], this.#pluginState[e])
        );
        this.#pluginState = newState;
        const patches: PluginStatesPatch[] = [];
        for (const plugin of changedPlugins) {
          patches.push(
            ...(await this.reconciler.reconcilePlugin(newState[plugin]))
          );
        }
        if (patches.length > 0) {
          this.#pluginStatePatches.push(...patches);
          this.#pluginStatePatchesTouched();
        }
      } catch (err) {
        console.error({ err });
      } finally {
        unlock();
      }

      this.#pluginStateUpdatedCb(this.#pluginState);
    }, 100);
  }
  #pluginStatePatchesTouchedTimeout: number | undefined;

  #destroyed = false;
  get destroyed() {
    return this.#destroyed;
  }

  async destroy() {
    this.#destructorCallbacks.forEach((e) => e());
    const pluginDestructions = Object.values(this.#pluginState)
      .map((e) => e.currentUiState)
      .filter((e) => e.type === "Running")
      .map((e) => e.contextDestruction() as Promise<void>);
    await Promise.all(pluginDestructions);
    this.#destroyed = true;
  }
}
