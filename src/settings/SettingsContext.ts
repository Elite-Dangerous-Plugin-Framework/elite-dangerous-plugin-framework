import { PluginSettingsContextV1Alpha } from "@elite-dangerous-plugin-framework/core/v1alpha";
import {
  PluginManifestV1AlphaWithId,
  PluginContextV1AlphaCapabilitiesSettings,
} from "@elite-dangerous-plugin-framework/core/v1alpha/internal";
import { CommandWrapper } from "../commands/commandWrapper";
import { PluginContextV1AlphaCapabilitiesSettingsImpl } from "../main/PluginContext";

export class PluginSettingsContextV1AlphaImpl implements PluginSettingsContextV1Alpha {
  #settings: PluginContextV1AlphaCapabilitiesSettingsImpl;
  #assetsBase: string;
  #commands: CommandWrapper;

  constructor(
    private manifest: PluginManifestV1AlphaWithId,
    commands: CommandWrapper,
    assetsBase: string,
  ) {
    this.#commands = commands;
    this.#settings = new PluginContextV1AlphaCapabilitiesSettingsImpl(
      commands,
      manifest.id,
    );
    this.#assetsBase = assetsBase;
  }
  async openUrl(url: string): Promise<void> {
    const resp = await this.#commands.openUrl(this.manifest.id, url);
    if (!resp.success) {
      throw new Error("failed to open url: " + resp.reason);
    }
  }
  get pluginMeta(): PluginManifestV1AlphaWithId {
    return this.manifest;
  }
  get assetsBase(): string {
    return this.#assetsBase;
  }
  get Settings(): PluginContextV1AlphaCapabilitiesSettings {
    return this.#settings;
  }
  #shutdownListener: Record<symbol, () => Promise<void>> = {};
  public registerShutdownListener(callback: () => Promise<void>): () => void {
    const sym = Symbol();
    this.#shutdownListener[sym] = callback;
    return () => {
      delete this.#shutdownListener[sym];
    };
  }
}
