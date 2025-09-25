import { inferCurrentState, PluginStateUIData } from "../settings/utils";
import { PluginState } from "../types/PluginState";

/**
 * This Custom Element encapsulates a Plugin. It is managed by EDPF. It can be used to define Size Limits for this Plugin.
 * When a plugin is not loaded / errored, this Component takes the responsibility to render that Info
 */
export class PluginWrapper extends HTMLElement {
  #pluginID: string = "";
  #shadow: ShadowRoot;
  #currentInstance: HTMLElement | undefined
  #alternativeDom: HTMLElement

  static observedAttributes = [
    // default, edit, edit-drop-target
    "data-mode",
    // size bounds are passed via data prop
    "data-min-w",
    "data-max-w",
    "data-min-h",
    "data-max-h",
    "id"
  ];
  #pluginState: PluginState | undefined;

  constructor() {
    super()
    this.#shadow = this.attachShadow({ mode: "closed" });
    this.#alternativeDom = document.createElement("div")
    this.#alternativeDom.className = "hidden"
    this.#shadow.append(this.#alternativeDom)
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
      this.#shadow.insertBefore(el, this.#alternativeDom)
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

  public notifyAboutNewPluginState(newState: PluginState) {
    this.#pluginState = newState
    this.#rerender()
  }
  #rerender() {
    const state = this.#pluginState ? inferCurrentState(this.#pluginState.current_state) : "Missing"
    const isUnloadedState = state !== "Running"
    const isEditMode = this.dataset.mode === "edit"
    this.className = `p-2 border rounded-sm ${isUnloadedState ? "" : ""} `
    let colour = "#a0a0a0"
    if (state in PluginStateUIData) {
      colour = PluginStateUIData[state as ReturnType<typeof inferCurrentState>].colour
    }

    if (!isEditMode && !this.#currentInstance) {
      // We are not editing, and dont have an instance assigned -> just hide itself in shame
      this.style.display = "none"
    } else {
      this.style.display = "unset"
    }

    if (isEditMode) {
      this.style.borderColor = "green"
      this.style.backgroundColor = "rgba(15, 80, 0, 0.5)"
    } else if (isUnloadedState) {
      this.style.borderColor = colour
      this.style.backgroundColor = colour + "15"
    } else {
      this.style.borderColor = "transparent"
      this.style.backgroundColor = "unset"
    }
  }


  connectedCallback() {
    this.#rerender()
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
    if (name === "data-mode") {
      this.#rerender()
    }
  }

  public get pluginID(): string {
    return this.#pluginID;
  }
}