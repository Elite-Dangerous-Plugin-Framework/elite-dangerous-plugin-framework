import { PluginSettingsContextV1Alpha } from "@elite-dangerous-plugin-framework/core";
import { PluginContextV1AlphaCapabilitiesSettings } from "@elite-dangerous-plugin-framework/core/dist/v1alpha/context";
import { CommandWrapper } from "../commands/commandWrapper";
import { PluginContextV1AlphaCapabilitiesSettingsImpl } from "../main/PluginContext";

export class PluginSettingsContextV1AlphaImpl implements PluginSettingsContextV1Alpha {
  #settings: PluginContextV1AlphaCapabilitiesSettingsImpl;
  #assetsBase: string;

  constructor(pluginId: string, commands: CommandWrapper, assetsBase: string) {
    this.#settings = new PluginContextV1AlphaCapabilitiesSettingsImpl(commands, pluginId)
    this.#assetsBase = assetsBase
  }
  get assetsBase(): string {
    return this.#assetsBase
  }

  get Settings(): PluginContextV1AlphaCapabilitiesSettings {
    return this.#settings
  }

}
