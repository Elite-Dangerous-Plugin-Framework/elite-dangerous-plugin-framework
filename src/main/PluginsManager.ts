import z from "zod";
import { LoadedPluginStateLookup, startAndLoadPlugin } from "./startAndLoadPlugin";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PluginStateZod } from "../types/PluginState";
import { getAllPluginStates } from "../commands/getAllPluginStates";
import { PluginWrapper } from "./PluginWrapper";
import { getRootToken } from "../commands/getRootToken";
import { PluginViewStructureZod, reconcileTree } from "./reconcileTree";
import { inferCurrentState } from "../settings/utils";

export default class PluginsManager extends HTMLElement {
  #parkingLotRef: HTMLDivElement;
  #destructorCallbacks: (() => void)[] = []
  #pluginState: Record<string, z.infer<typeof PluginStateZod>> = {}
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
  }


  #updatePluginIdsBufferRef: Record<string, null> = {}
  #rootToken: string | undefined
  #updatePluginIdsDebouncerRef: ReturnType<typeof setTimeout> | null = null
  /**
   * Invoked by Browser when this node is attached (=created). We use this to create any relevant listeners
   */
  connectedCallback() {
    const unlisten = listen("core/plugins/update", (ev) => {
      console.log(ev.payload);
      const resp = z
        .object({ id: z.string(), pluginState: PluginStateZod })
        .parse(ev.payload);
      // we debouce this because otherwise we drop events in case we get many updates in quick succession (e.g. reconcile)
      this.#updatePluginIdsBufferRef[resp.id] = null; // discount hashset
      if (this.#updatePluginIdsDebouncerRef !== null) {
        clearTimeout(this.#updatePluginIdsDebouncerRef);
      }
      this.#updatePluginIdsDebouncerRef = setTimeout(async () => {
        const state = await getAllPluginStates();
        this.#updatePluginIdsDebouncerRef = null;
        const updatedPluginIDs = Object.keys(this.#updatePluginIdsBufferRef)
        this.#pluginState = state
        this.#updatePluginIdsBufferRef = {};
        this.#updatePluginsByIds(updatedPluginIDs)
      }, 100);
    })
    unlisten.then(e => this.#destructorCallbacks.push(e))
    getRootToken().then(async token => {
      this.#rootToken = token
      this.#pluginState = await getAllPluginStates()
      this.#updatePluginsByIds(undefined)
    })
  }
  /**
   * Invoked by Browser when this node is destroyed. Does cleanup
   */
  disconnectedCallback() {
    this.#destructorCallbacks.forEach(e => e())
  }

  #updatePluginsByIds(updatedPluginIds: string[] | undefined) {
    for (const item of Object.entries(this.#pluginState).filter(
      (e) => updatedPluginIds === undefined || updatedPluginIds.includes(e[0])
    )) {
      const [pluginID, pluginState] = item;
      const currentState = inferCurrentState(pluginState.current_state)
      const maybePluginWrapper = document.getElementById("plugin-cell-" + pluginID)
      if (maybePluginWrapper && maybePluginWrapper instanceof PluginWrapper) {
        maybePluginWrapper.notifyAboutNewPluginState(pluginState)
      }
      if (currentState === "Starting" || (currentState === "Running" && !this.#loadedPluginsLookup[pluginID])) {
        // Do reconciliation for Starting (or adopting after a refresh of the UI)
        if (this.#rootToken) {
          startAndLoadPlugin(pluginID, this.#rootToken, this);
        }
        else {
          console.error("couldnt start the plugin because we do not have a root token")
        }
      }
      if (currentState === "Disabling") {
        (async () => {
          // Do reconciliation for Disabling
          if (this.loadedPluginsLookup[pluginID]) {
            const newState = {
              ...this.loadedPluginsLookup
            }
            delete newState[pluginID]
            await this.setLoadedPluginsLookup(newState)
          }
          await invoke("finalize_stop_plugin", { pluginId: pluginID });
          return;
        })();
      }
    }
  }

  static observedAttributes = ["data-mode"];

  #loadedPluginsLookup: z.infer<typeof LoadedPluginStateLookup> = {};

  get loadedPluginsLookup() {
    return this.#loadedPluginsLookup;
  }


  /**
   * This uses a naive diffing approach of comparing object instances.
   * An update MUST be a new object.
   * 
   * Note that PluginsManager is the one responsible for Creating, Moving and Sunsetting Plugin Instances!
   */
  async setLoadedPluginsLookup(newLookup: z.infer<typeof LoadedPluginStateLookup>) {
    const updatedPluginIds = Object.entries(newLookup)
      .filter(([k, v]) => {
        return v !== this.#loadedPluginsLookup[k];
      })
      .map(([k]) => k);
    const deletedPluginIds = Object.keys(this.#loadedPluginsLookup).filter(e => !newLookup[e])


    for (const id of updatedPluginIds) {
      // check if a Wrapper exists for it already
      let wrapper = document.getElementById("plugin-cell-" + id)
      if (!wrapper) {
        // The wrapper doesnt exist. This implies that the Plugin is not part of the visible 
        // plugins and belongs into the parking lot, as otherwise it would have been created 
        // already by this.#reconcileTree
        wrapper = new PluginWrapper()
        wrapper.dataset.type = "PluginCell"
        wrapper.dataset.manager = "pluginsmanager"
        wrapper.id = `plugin-cell-${id}`
        this.#parkingLotRef.append(wrapper)
      }

      if (!(wrapper instanceof PluginWrapper)) {
        throw new Error("found plugin wrapper not instance of PluginWrapper")
      }

      const previousRef = this.#loadedPluginsLookup[id] ? this.#loadedPluginsLookup[id].ref : undefined
      const newRef = newLookup[id].ref

      let needAdoption = false;
      let needDeletion = false;
      if (newRef === previousRef) {
        // its the same node. We dont need to destroy the node to recreate it
      } else if (previousRef === undefined) {
        // We are at the start of a plugin. It wasnt existing beforehand
        needAdoption = true
      } else if (previousRef !== undefined && newRef !== previousRef) {
        // We are restarting a plugin
        needAdoption = true
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
    }
    await Promise.all(deletedPluginIds.map(async id => {
      // todo: delete via ctx
      const wrapper = document.getElementById(`plugin-cell-${id}`)
      if (!(wrapper instanceof PluginWrapper)) {
        throw new Error("found plugin wrapper that is not instanceof PluginWrapper")
      }
      // we pass undefined here -> node is killed and not replaced with anything
      wrapper.swapPlugin(undefined)
    }))
    this.#loadedPluginsLookup = newLookup
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


