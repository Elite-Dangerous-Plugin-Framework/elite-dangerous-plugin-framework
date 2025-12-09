import type { PluginContextV1AlphaCapabilitiesSettings } from "./context.js";

/**
 * The settings context. This is trimmed down and does not get any Journal updates. You only get access to read and write Settings here, plus get the assetsBase so you can load images / stylesheets.
 */
export interface PluginSettingsContextV1Alpha {
  /**
 * **Enabled by default**
 * 
 * always present, used to read and write settings.
 */
  get Settings(): PluginContextV1AlphaCapabilitiesSettings
  /**
* Your Plugin is exposed via an asset server that is running on localhost. The Port is not stable. Use this readonly property to get the base URL.
*
* You can then append the path to the file, relative to the `frontend` folder. Do note that relative escapes out of the `frontend` folder are not supported.
*
* `assetsBase` has always a `/` as a suffix.
*/
  get assetsBase(): string;
}
