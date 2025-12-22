import { PluginContextV1Alpha } from "./context.js";
import { PluginSettingsContextV1Alpha } from "./settingsContext.js";

/**
 * Inherit from this class for your Plugin definition if your manifest defines `v1alpha` as the type!
 */
export abstract class EDPFPluginElementV1Alpha extends HTMLElement {
  public abstract initPlugin(ctx: PluginContextV1Alpha): void;
}

/**
 * Inherit from this class for your Plugin **Settings** definition if your manifest defines `v1alpha` as the type!
 * 
 * Note that the settings element is stripped down and only contains the relevant methods to get and update secrets.
 */
export abstract class EDPFPluginSettingsElementV1Alpha extends HTMLElement {
  public abstract initSettings(ctx: PluginSettingsContextV1Alpha): void;
}
