import type { PluginContextV1AlphaCapabilitiesSettings } from "./context.js";

/**
 * The settings context. This is trimmed down and does not get any Journal updates. You only get access to read and write Settings here.
 */
export interface PluginSettingsContextV1Alpha {
  get Settings(): PluginContextV1AlphaCapabilitiesSettings
}
