import type { PluginSettingsContextV1Alpha } from "@elite-dangerous-plugin-framework/core";
import type { PluginContextV1AlphaCapabilitiesSettings } from "@elite-dangerous-plugin-framework/core/dist/v1alpha/context";

export class PluginSettingsContextV1AlphaImpl implements PluginSettingsContextV1Alpha {
  constructor(private settings: PluginContextV1AlphaCapabilitiesSettings) { }


  get Settings(): PluginContextV1AlphaCapabilitiesSettings {
    return this.settings
  }

}