import { listen } from "@tauri-apps/api/event";
import {
  JournalEventItemV1Alpha,
  PluginContextV1Alpha,
} from "@elite-dangerous-plugin-framework/core";
import {
  PluginContextV1AlphaCapabilities,
  PluginContextV1AlphaCapabilitiesSettings,
} from "@elite-dangerous-plugin-framework/core/dist/v1alpha/context";
import { CommandWrapper } from "../commands/commandWrapper";

export class PluginContextV1AlphaImpl implements PluginContextV1Alpha {
  /**
   * Dangerous property. Peek internal and never expose
   */
  #commands: CommandWrapper;

  /**
   * # Please don't construct the plugin context yourself
   *
   * Use the context already provided to you in the Web Component constructor.
   */
  public constructor(
    commands: CommandWrapper,
    private assetBase: string,
    // @ts-expect-error
    private pluginID: string,
    // @ts-expect-error
    private capabilities: PluginContextV1AlphaCapabilities
  ) {
    this.#commands = commands;
  }
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

  public async rereadCurrentJournals(): Promise<
    Record<string, JournalEventItemV1Alpha[]>
  > {
    const result = await this.#commands.rereadActiveJournals();
    if (!result.success) {
      throw new Error("failed to reread active journals: " + result.reason);
    }
    return Object.fromEntries(
      result.data.map((e) => [
        e.cmdr,
        e.entries.map((f) => ({ cmdr: e.cmdr, file: e.file, event: f })),
      ])
    );
  }

  /**
   * Creates a new Plugin Context. This is invoked by EDPF.
   * Plugin Developers shouldn't try to call this
   * @param instanceID a "secret" generated at runtime by EDPF that the Plugin Context uses to verify it was created from EDPF and not from a plugin.
   * The instanceID also acts as Pointer to the Plugin State, which means we can get the Plugin ID that way.
   */
  public static async create(pluginId: string, commands: CommandWrapper) {
    const [stateZod, importPathZod] = await Promise.all([
      commands.getPlugin(pluginId),
      commands.getImportPathForPlugin(pluginId),
    ]);
    if (!stateZod.success) {
      throw new Error("failed to get Plugin: " + stateZod.reason);
    }
    if (!importPathZod.success) {
      throw new Error(
        "failed to get Plugin Import Path: " + importPathZod.reason
      );
    }

    const importPath = importPathZod.data.import;
    const assetsBase = importPath.substring(0, importPath.lastIndexOf("/") + 1);

    const ctx = new PluginContextV1AlphaImpl(
      commands,
      assetsBase,
      pluginId,
      PluginContextCapabilitiesV1AlphaImpl.create(
        commands,
        pluginId,
        assetsBase
      )
    );
    return {
      ctx,
      notifyDestructor: async () => ctx.#notifyDestroy(),
    };
  }

  get assetsBase(): string {
    return this.assetBase;
  }
}

export class PluginContextCapabilitiesV1AlphaImpl
  implements PluginContextV1AlphaCapabilities
{
  #assetBase: string;
  constructor(
    private settings: PluginContextV1AlphaCapabilitiesSettings,
    assetBase: string
  ) {
    this.#assetBase = assetBase;
  }
  get Settings(): PluginContextV1AlphaCapabilitiesSettings {
    return this.settings;
  }

  get assetsBase() {
    return this.#assetBase;
  }

  static create(command: CommandWrapper, pluginId: string, assetsBase: string) {
    const settings = new PluginContextV1AlphaCapabilitiesSettingsImpl(
      command,
      pluginId
    );
    return new PluginContextCapabilitiesV1AlphaImpl(settings, assetsBase);
  }
}

export class PluginContextV1AlphaCapabilitiesSettingsImpl
  implements PluginContextV1AlphaCapabilitiesSettings
{
  constructor(private commands: CommandWrapper, private pluginId: string) {}

  async writeSetting(
    key: string,
    value: any | undefined
  ): Promise<unknown | undefined> {
    const resp = await this.commands.writeSetting(this.pluginId, key, value);
    if (!resp.success) {
      throw new Error("failed to get setting: " + resp.reason);
    }
    return resp.data.value;
  }
  async getSetting(key: string): Promise<unknown | undefined> {
    const resp = await this.commands.readSetting(this.pluginId, key);
    if (!resp.success) {
      throw new Error("failed to get setting: " + resp.reason);
    }
    return resp.data.value;
  }
  registerSettingsChangedListener(_: (key: string) => void): void {
    throw new Error("Method not implemented.");
  }
}
