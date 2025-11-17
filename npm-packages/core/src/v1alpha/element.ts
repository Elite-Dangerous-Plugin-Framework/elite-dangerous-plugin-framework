import { PluginContextV1Alpha } from "./context.js";

/**
 * Inherit from this class for your Plugin definition if your manifest defines `v1alpha` as the type!
 */
export abstract class EDPFPluginElementV1Alpha extends HTMLElement {
  public abstract initPlugin(ctx: PluginContextV1Alpha): void;
}
