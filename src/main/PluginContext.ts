import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import z from "zod";
import { PluginStateZod } from "../types/PluginState";
import {
  JournalEventItemV1Alpha,
  PluginContextV1Alpha,
} from "@elite-dangerous-plugin-framework/core";

export class PluginContextV1AlphaImpl implements PluginContextV1Alpha {
  /**
   * # Please don't construct the plugin context yourself
   *
   * Use the context already provided to you in the Web Component constructor.
   */
  public constructor(instanceID: string) {
    this.#instanceID = instanceID;
  }
  #destroyed = false;
  #instanceID = "";
  #pluginID = "";

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
  async #notifyDestroy() {
    if (typeof this.#shutdownListener === "function") {
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

  public registerEventListener(
    callback: (events: JournalEventItemV1Alpha[]) => void
  ) {
    if (this.#eventListenerDestructor) {
      throw new Error("Event Listener can only be registered once per Plugin");
    }
    const unlisten = listen("journal_events", (ev) => {
      callback(ev.payload as any);
    });
    this.#eventListenerDestructor = "awaitingResolve";
    unlisten.then((e) => (this.#eventListenerDestructor = e));
  }

  #shutdownListener: undefined | (() => Promise<void>);

  public registerShutdownListener(callback: () => Promise<void>) {
    if (this.#shutdownListener) {
      throw new Error(
        "Shutdown Listener can only be registered once per Plugin"
      );
    }
    this.#shutdownListener = callback;
  }

  public registerSettingsChangedListener(
    callback: (key: string, value: unknown) => void
  ) {
    if (this.#settingsChangedListener) {
      throw new Error("Event Listener can only be registered once per Plugin");
    }
    this.#settingsChangedListener = callback;
  }
  #settingsChangedListener: undefined | ((key: string, value: unknown) => void);
  /**
   * Used internally - this is called by whatever created the context to notify it about a setting being updated
   *
   * This function will filter this settings updates that this plugin shouldn't know about
   */
  #notifySettingsChanged(key: string, value: unknown) {
    if (!this.#settingsChangedListener) {
      return;
    }

    const keySegments = key.split(".");
    if (keySegments.length < 2) {
      return;
    }
    const pluginIdInKey = keySegments[0];
    const isPrivateContext = this.#pluginID === pluginIdInKey;
    const lastSegment = keySegments[keySegments.length - 1];
    const startsUpperCase =
      lastSegment.charAt(0) === lastSegment.charAt(0).toUpperCase();
    if (isPrivateContext || startsUpperCase) {
      this.#settingsChangedListener(key, value);
    }
  }

  public async rereadCurrentJournals(): Promise<
    Record<string, JournalEventItemV1Alpha[]>
  > {
    throw new Error("not implemented");
  }
  /**
   * ## Write a setting for this plugin
   *
   * You can also push settings outside the Settings UI. Use this function to write a key / value pair.
   *
   * This is what you should look out for:
   * - The key contains segments, separated by a dot (.)
   * - You need at least 2 Segments
   * - the first segment **MUST** be your plugin ID
   * - the last segment determines if this is a "public" setting. If it starts uppercase, it is readable by every plugin
   *    - `myPlugin.some.key` is private. Only your own plugin can read and edit it and get notified about it
   *    - `myPlugin.some.Key` is public. You can read and edit it, other plugins can read it
   */
  public async writeSetting(key: string, value: unknown) {
    throw new Error("not implemented");
  }

  /**
   * ## Fetches a setting by Key.
   * See Docs for {@link writeSetting()} for key structure
   *
   * Return the setting if present, undefined if it doesnt exist.
   * Throws an error if you are not allowed to access this setting
   */
  public async getSetting(key: string): Promise<unknown | undefined> {
    throw new Error("not implemented");
  }

  /**
   * Creates a new Plugin Context. This is invoked by EDPF.
   * Plugin Developers shouldn't try to call this
   * @param instanceID a "secret" generated at runtime by EDPF that the Plugin Context uses to verify it was created from EDPF and not from a plugin.
   * The instanceID also acts as Pointer to the Plugin State, which means we can get the Plugin ID that way.
   */
  public static async create(instanceID: string, importPath: string) {
    const ctx = new PluginContextV1AlphaImpl(instanceID);
    ctx.#assetsBase = importPath.substring(0, importPath.lastIndexOf("/") + 1);
    await ctx.#init();
    return {
      ctx,
      notifyDestructor: async () => ctx.#notifyDestroy(),
      notifySettingsChanged: (a: string, b: unknown) =>
        ctx.#notifySettingsChanged(a, b),
    };
  }
  // called internally, uses the instanceID to get the pluginID and data
  async #init() {
    const responseUnsafe = await invoke("get_plugin_by_instance_id", {
      instanceId: this.#instanceID,
    });
    const response = z
      .object({ success: z.literal(true), data: PluginStateZod })
      .or(z.object({ success: z.literal(false) }))
      .parse(responseUnsafe);
    if (!response.success) {
      throw new Error("Failed to get Plugin from the Instance ID");
    }
    this.#pluginID = response.data.id;
  }
  #assetsBase = "";
  get assetsBase(): string {
    return this.#assetsBase;
  }
}
