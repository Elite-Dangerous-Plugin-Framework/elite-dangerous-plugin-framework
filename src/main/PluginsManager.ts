import z from "zod";
import { LoadedPluginStateLookup } from "./startAndLoadPlugin";
import { invoke } from "@tauri-apps/api/core";

export default class PluginsManager extends HTMLElement {
  #parkingLotRef: HTMLDivElement;
  constructor() {
    super();
    // Construct the parking lot
    this.#parkingLotRef = document.createElement("div");
    this.#parkingLotRef.id = "edpf-parking-lot";
    this.#parkingLotRef.className = "hidden";
    this.append(this.#parkingLotRef);
    invoke("sync_main_layout").then(e => {
      console.log(e)
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
      this.#reconcileTree(data)
    })
  }
  /**
   * This makes sure all nodes exist (both containers and Plugin cells)
   */
  #reconcileTree(data: z.infer<typeof PluginViewStructureZod>) {
    /**
     * We store the IDs of all elements we expect to be in the tree. Then we do a querySelectorAll() based on data-manager=pluginsmanager
     * to get anything that is managed by us.
     * We then prune any containers and move any plugin wrappers to the parking lot
     */
    const legalIds: Record<string, any> = {}

    /**
     * This is a recursive function that is called for all children. 
     * If the child is NOT a container, it returns without further recursion.
     */
    const handleNode = (node: z.infer<typeof AnyNodeZod>, expectedParent: HTMLElement, indexUnderParent: number) => {
      let identifier
      if (node.type === "PluginCell") {
        identifier = `plugin-cell-${node.plugin_id}`
      }
      else {
        identifier = node.identifier
      }
      legalIds[identifier] = {}
      // we get the node. by convention the id of the node is always just the identifier.
      // an exception to this is the root node, which is always edpf-plugin-tree-root
      let existingOrCreatedNode = document.getElementById(identifier)
      if (!existingOrCreatedNode) {
        existingOrCreatedNode = document.createElement(node.type === "PluginCell" ? PluginWrapper.htmlName : "div")
        existingOrCreatedNode.id = identifier
      }
      existingOrCreatedNode.dataset.type = node.type
      existingOrCreatedNode.dataset.manager = "pluginsmanager"
      function setOrDelete(key: string, val: string | null | undefined) {
        if (val) {
          existingOrCreatedNode!.dataset[key] = val
        } else {
          delete existingOrCreatedNode!.dataset[key]
        }
      }
      setOrDelete("minW", node.meta.min_width)
      setOrDelete("maxW", node.meta.max_width)
      setOrDelete("minH", node.meta.min_height)
      setOrDelete("maxH", node.meta.max_height)
      if (existingOrCreatedNode.parentElement !== expectedParent) {
        expectedParent.append(existingOrCreatedNode)
      }
      // at this point we are guaranteed to be at the correct parent node
      // now we just have to get the ordering right
      const childrenOfParent = [...expectedParent.childNodes]
      const currentIdx = childrenOfParent.findIndex(e => e === existingOrCreatedNode)
      if (currentIdx !== indexUnderParent) {
        // we are at the wrong index and need to move
        if (indexUnderParent < childrenOfParent.length) {
          expectedParent.insertBefore(existingOrCreatedNode, childrenOfParent[indexUnderParent])
        }
        // now we are in the correct order. Because we move left-to-right, there is no index shiftings afterwards
      }

      if (node.type !== "PluginCell") {
        node.children.forEach((c, idx) => handleNode(c, existingOrCreatedNode, idx))
      }
    };
    // by convention the root is always called like that
    data.root.identifier = "edpf-plugin-tree-root"
    handleNode(data.root, this, 0)

    const allManagedNodes = document.querySelectorAll('[data-manager="pluginsmanager"]')
    const nodesToDelete: HTMLElement[] = []
    console.log("all nodes:", allManagedNodes)
    for (const node of allManagedNodes) {
      if (legalIds[node.id]) {
        // This is an allowed node. It shall stay
        continue
      }
      if (!(node instanceof HTMLElement)) {
        throw new Error("should never happen. Node is not an HTML Element")
      }
      // This node has to go. We cannot delete nodes immediately as 
      // they MAY contain children that we care about. 
      // So we enqueue them up into nodesToDelete if they are a container node.
      // if its a plugin we just move it to the parking lot
      if (node.dataset.type === "PluginCell" && node.parentElement !== this.#parkingLotRef) {
        this.#parkingLotRef.append(node) // node moved
      } else {
        nodesToDelete.push(node)
      }
    }
    for (const node of nodesToDelete) {
      node.remove()
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



  public static register() {
    if (!window.customElements.get("edpf-plugins-manager")) {
      window.customElements.define("edpf-plugins-manager", PluginsManager);
      PluginWrapper.register();
    }
  }

  attributeChangedCallback(name: string, oldVal: string, newVal: string) {
    console.log(`${name}: ${oldVal}→${newVal}`);
  }
}

/**
 * This Custom Element encapsulates a Plugin. It is managed by EDPF. It can be used to define Size Limits for this Plugin.
 * When a plugin is not loaded / errored, this Component takes the responsibility to render that Info
 */
class PluginWrapper extends HTMLElement {
  #pluginID: string = "";
  #shadow: ShadowRoot;
  #currentInstance: HTMLElement | undefined

  static observedAttributes = [
    // default, edit, edit-drop-target
    "data-mode",
    // see PluginCurrentStateKeys type
    "data-plugin-current-state",
    // size bounds are passed via data prop
    "data-min-w",
    "data-max-w",
    "data-min-h",
    "data-max-h",
    "id"
  ];

  constructor() {
    super()
    this.#shadow = this.attachShadow({ mode: "closed" });
  }

  /**
   * this is to be called after the previous plugin instance had time to destroy itself correctly.
   * Will swap the Plugin and destroy the existing node
   */
  public swapPlugin(el: HTMLElement | undefined) {
    if (this.#currentInstance) {
      this.#currentInstance.remove()
    }
    this.#currentInstance = el
    if (el) {
      this.#shadow.append(el)
    }
  }


  public static get htmlName() {
    return "edpf-plugin-wrapper"
  }

  public static register() {
    if (!window.customElements.get(PluginWrapper.htmlName)) {
      window.customElements.define(PluginWrapper.htmlName, PluginWrapper);
    }
  }

  attributeChangedCallback(name: string, oldVal: string, newVal: string) {
    if (oldVal === newVal) {
      return
    }
    if (name === "id") {
      if (newVal.startsWith("plugin-cell-")) {
        // the wrapper is getting initialized
        // we can get the Plugin ID from the ID
        this.#pluginID = newVal.replace("plugin-cell-", "")
      }
    }
    console.log(`${name}: ${oldVal}→${newVal}`);
  }

  public get pluginID(): string {
    return this.#pluginID;
  }
}

const PluginViewStructureZodMeta = z.object({
  min_height: z.string().nullable().optional(),
  max_height: z.string().nullable().optional(),
  min_width: z.string().nullable().optional(),
  max_width: z.string().nullable().optional(),
})
const PluginCellNodeZod = z.object({
  type: z.literal("PluginCell"),
  plugin_id: z.string(),
  meta: PluginViewStructureZodMeta
})

const VerticalNodeZod = z.object({
  type: z.literal("VerticalLayout"),
  meta: PluginViewStructureZodMeta,
  identifier: z.string(),
  get children() {
    return z.array(AnyNodeZod)
  }
});

const AnyNodeZod = z.union([
  VerticalNodeZod, PluginCellNodeZod
])


const PluginViewStructureZod = z.object({
  root: VerticalNodeZod
});

