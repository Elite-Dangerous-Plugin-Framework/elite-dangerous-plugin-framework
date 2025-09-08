import { listen } from "@tauri-apps/api/event";

/**
 * This is the main object your Plugin interacts with EDPF
 *
 * You can subscribe to events, requests specific Procedures (e.g requesting entire current journal file) (based on what your permissions allow)
 *
 * The context has a (hidden)
 */
export class PluginContext {
  /**
   * # Please don't construct the plugin context yourself
   *
   * Use the context already provided to you in the Web Component constructor.
   */
  public constructor(instanceID: string) {}
  #destroyed = false;

  /**
   * This returns true after the Context was destroyed.
   * Do note this is still false while the shutdown listener is running.
   */
  get destroyed() {
    return this.#destroyed;
  }

  /**
   * This is the destructor.
   * This is a promise that will
   * - notify the Plugin it is about to be destroyed (if the Plugin subscribed)
   *  - the plugin has 1s to close down before getting killed anyways
   * - make sure any upstream listeners' destructors are invoked
   * - once the Promise returns, it is safe to destroy the Web Component
   *
   *  **This is managed by EDPF (Plugins don't have to care about it)**
   */
  async #destroy() {
    if (this.#shutdownListener) {
      await Promise.race([
        new Promise<void>((res) => setTimeout(() => res(), 1_000)),
        this.#shutdownListener(),
      ]);
    }
    if (typeof this.#eventListenerDestructor === "function") {
      this.#eventListenerDestructor();
    }
    this.#destroyed = true;
  }

  #eventListenerDestructor: undefined | "awaitingResolve" | (() => void);
  /**
   * ## Used to receive Journal Events
   *
   * Pass a callback into this method. The Callback will be invoked each time a Journal Event is received.
   *
   * Note that EDPF does Event batching, meaining you receive a List of Events if they happen in very quick succession.
   *
   * Note this can only **be called once**.
   */
  public registerEventListener(callback: (todo: any[]) => void) {
    if (this.#eventListenerDestructor) {
      throw new Error("Event Listener can only be registered once per Plugin");
    }
    const unlisten = listen("core/journal/eventBatch", (ev) => {
      callback(ev as any);
    });
    this.#eventListenerDestructor = "awaitingResolve";
    unlisten.then((e) => (this.#eventListenerDestructor = e));
  }

  #shutdownListener: undefined | (() => Promise<void>);
  /**
   * ## Used to block shutdown for cleanup tasks
   *
   * If your Plugin requires some form of cleanup / finalizing, register a shutdown listener here.
   * When stopping a Plugin, the Context will **wait up to a second** for you to finish cleanup.
   *
   * Cleanup is considered finished **when the Promise returns**. The callback is invoked once only
   *
   * Note this can only **be called once**.
   */
  public registerShutdownListener(callback: () => Promise<void>) {
    if (this.#shutdownListener) {
      throw new Error(
        "Shutdown Listener can only be registered once per Plugin"
      );
    }
    this.#shutdownListener = callback;
  }

  /**
   * Creates a new Plugin Context. This is invoked by EDPF.
   * Plugin Developers shouldn't try to call this
   * @param instanceID a "secret" generated at runtime by EDPF that the Plugin Context uses to verify it was created from EDPF and not from a plugin.
   * The instanceID also acts as Pointer to the Plugin State, which means we can get the Plugin ID that way.
   */
  public static create(instanceID: string) {
    const ctx = new PluginContext(instanceID);
    return [ctx, ctx.#destroy] as const;
  }
}
