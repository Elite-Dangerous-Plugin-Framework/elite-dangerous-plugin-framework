import z from "zod";
import { startAndLoadPlugin } from "./startAndLoadPlugin";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PluginStateZod } from "../types/PluginState";
import { getAllPluginStates } from "../commands/getAllPluginStates";
import { PluginWrapper } from "./PluginWrapper";
import { getRootToken } from "../commands/getRootToken";
import { PluginViewStructureZod, reconcileTree } from "./reconcileTree";
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
    type: z.literal("Missing")
  })
])
const PluginStateContainingCurrentStateZod = PluginStateZod.and(z.object({
  currentUiState: CurrentUiStateZod
}))

export default class PluginsManager extends HTMLElement {
  #parkingLotRef: HTMLDivElement;
  #destructorCallbacks: (() => void)[] = []
  #pluginState: Record<string, z.infer<typeof PluginStateContainingCurrentStateZod>> = {}
  constructor() {
    super();
    // Construct the parking lot
    this.#parkingLotRef = document.createElement("div");
    this.#parkingLotRef.id = "edpf-parking-lot";
    this.#parkingLotRef.className = "hidden";
    this.className = "flex flex-1 bg-neutral-300 w-full"
    this.append(this.#parkingLotRef);
    invoke("sync_main_layout").then(e => {
      const { data } = z.object({ data: PluginViewStructureZod }).parse(e)
      data.root.children.push({
        type: "VerticalLayout", identifier: "548654675498654768945897", "meta": {
          "max_height": "500px"
        }, "children": []
      }, {
        type: "PluginCell", meta: {}, plugin_id: "test-2"
      },
        {
          type: "PluginCell", meta: {}, plugin_id: "test-3"
        })
      reconcileTree(data, this, this.#parkingLotRef)
    })
    window.__debug_pluginsManager = () => this.#pluginState
  }


  #rootToken: string | undefined
  #lastPluginUpdate: Record<string, [Date, z.infer<typeof PluginStateZod>]> = {}
  /**
   * Invoked by Browser when this node is attached (=created). We use this to create any relevant listeners
   */
  async connectedCallback() {
    this.#rootToken = await getRootToken()
    this.#pluginState = Object.fromEntries(Object.entries(await getAllPluginStates()).map(([k, v]) => [k, { ...v, currentUiState: { type: "Missing" } }]))
    this.#updatePluginById(undefined)

    const unlisten = await listen("core/plugins/update", (ev) => {
      console.log("core/plugins/update", ev.payload);
      const resp = z
        .object({ id: z.string(), pluginState: PluginStateZod })
        .parse(ev.payload);
      const lastState = this.#lastPluginUpdate[resp.id]
      const now = new Date()
      if (lastState) {
        const deltaMillis = Number(now) - Number(lastState[0])
        if (deltaMillis < 500) {
          // 500ms - if the state is identical, we decounce

          if ((lastState[1].current_state.type) === (resp.pluginState.current_state.type) && lastState[1].frontend_hash === resp.pluginState.frontend_hash) {
            // debounce time
            console.error("found a deadlock loop. Fix this", { receivedState: resp.pluginState, previousState: lastState[1], deltaMillis })
            return
          }
          this.#lastPluginUpdate[resp.id] = [now, resp.pluginState]
        }
      } else {
        this.#lastPluginUpdate[resp.id] = [now, resp.pluginState]
      }
      if (!this.#pluginState[resp.id]) {
        this.#pluginState[resp.id] = {
          ...resp.pluginState,
          "currentUiState": {
            type: "Missing"
          }
        }
      } else {
        this.#pluginState[resp.id] = {
          ...this.#pluginState[resp.id],
          ...resp.pluginState
        }
      }
      this.#updatePluginById(resp.id)
    })
    this.#destructorCallbacks.push(unlisten)
  }
  /**
   * Invoked by Browser when this node is destroyed. Does cleanup
   */
  disconnectedCallback() {
    this.#destructorCallbacks.forEach(e => e())
  }

  #updatePluginById(updatedPluginIds: string | undefined) {
    for (const item of Object.entries(this.#pluginState).filter(
      (e) => updatedPluginIds === undefined || updatedPluginIds == e[0]
    )) {
      const [pluginID, pluginState] = item;
      const currentState = pluginState.current_state.type
      const maybePluginWrapper = document.getElementById("plugin-cell-" + pluginID)
      if (maybePluginWrapper && maybePluginWrapper instanceof PluginWrapper) {
        maybePluginWrapper.notifyAboutNewPluginState(pluginState)
      }
      if (currentState === "Starting" || (currentState === "Running" && pluginState.currentUiState.type === "Missing")) {
        // Do reconciliation for Starting (or adopting after a refresh of the UI)
        if (this.#rootToken) {
          startAndLoadPlugin(pluginID, this.#rootToken, (e) => this.#setLoadedPluginsLookup(e, pluginID));
        }
        else {
          console.error("couldnt start the plugin because we do not have a root token")
        }
      }

      if (currentState === "Disabling") {
        (async () => {
          // Do reconciliation for Disabling
          await this.#setLoadedPluginsLookup({ type: "Missing" }, pluginID)
          await invoke("finalize_stop_plugin", { pluginId: pluginID });
          return;
        })();
      }
    }
  }

  static observedAttributes = ["data-mode"];


  /**
   * Note that PluginsManager is the one responsible for Creating, Moving and Sunsetting Plugin Instances!
   */
  async #setLoadedPluginsLookup(newState: z.infer<typeof CurrentUiStateZod>, pluginId: string) {


    // check if a Wrapper exists for it already
    let wrapper = document.getElementById("plugin-cell-" + pluginId)
    if (!wrapper) {
      // The wrapper doesnt exist. This implies that the Plugin is not part of the visible 
      // plugins and belongs into the parking lot, as otherwise it would have been created 
      // already by this.#reconcileTree
      wrapper = new PluginWrapper()
      wrapper.dataset.type = "PluginCell"
      wrapper.dataset.manager = "pluginsmanager"
      wrapper.id = `plugin-cell-${pluginId}`
      this.#parkingLotRef.append(wrapper)
    }


    if (!(wrapper instanceof PluginWrapper)) {
      throw new Error("found plugin wrapper not instance of PluginWrapper")
    }

    const previousRef = this.#pluginState[pluginId] && this.#pluginState[pluginId].currentUiState.type === "Running" ? this.#pluginState[pluginId].currentUiState.ref : undefined
    const newRef = newState.type === "Running" ? newState.ref : undefined

    let needAdoption = false;
    let needDeletion = false;
    if (newRef === previousRef) {
      // its the same node. We dont need to destroy the node to recreate it
    } else if (previousRef === undefined && newRef !== undefined) {
      // We are at the start of a plugin. It wasnt existing beforehand
      needAdoption = true
    } else if (previousRef !== undefined && newRef !== previousRef) {
      // We are restarting a plugin
      needAdoption = true
      needDeletion = true
    } else if (newRef === undefined && previousRef !== undefined) {
      needDeletion = true
    }


    if (needDeletion) {
      // todo: await shutdown grace period using ctx
    }
    if (needDeletion || needAdoption) {
      // We attach the plugin to the closed shadow root here. 
      // If undefined is passed, we just remove the existing element
      wrapper.swapPlugin(newRef)
    }
    this.#pluginState[pluginId].currentUiState = newState
  }


  public static get htmlName() {
    return "edpf-plugins-manager"
  }
  public static register() {
    if (!window.customElements.get(PluginsManager.htmlName)) {
      window.customElements.define(PluginsManager.htmlName, PluginsManager);
      PluginWrapper.register();
    }
  }

  attributeChangedCallback(name: string, oldVal: string, newVal: string) {
    if (oldVal === newVal) {
      return
    }
    if (name === "data-mode") {
      // Notify all containers and plugin-wrappers about being in Edit mode
      document.querySelectorAll('[data-manager="pluginsmanager"]').forEach(e => {
        if (e instanceof HTMLElement) {
          e.dataset["mode"] = newVal
        }
      })
    }
  }
}


