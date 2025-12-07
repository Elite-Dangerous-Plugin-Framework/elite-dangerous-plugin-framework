import z from "zod";
import { PluginContextV1AlphaImpl } from "./PluginContext";
import { CurrentUiStateZod } from "./PluginsManager";
import type { CommandWrapper } from "../commands/commandWrapper"




export async function startAndLoadPlugin(
  pluginID: string,
  commands: CommandWrapper
): Promise<undefined | z.infer<typeof CurrentUiStateZod>> {
  console.info("startAndLoad called");
  const result = await commands.getImportPathForPlugin(pluginID);
  if (!result.success) {
    await commands.startPluginFailed(pluginID, [result.reason]);
    return;
  }

  const { hash, import: moduleImport } = result.data

  // now try to import the module
  let module: any;
  try {
    module = await import(/* @vite-ignore */ moduleImport);
  } catch (err) {
    await commands.startPluginFailed(pluginID, ["MODULE_IMPORT_FAILED"]);
    return;
  }
  // if here, module exists
  if (!module.default) {
    // but doesnt have a default export
    await commands.startPluginFailed(pluginID, ["NO_DEFAULT_EXPORT"]);
    return;
  }
  // This essentially checks if the export is a class definition that inherits HTMLElement
  if (
    typeof module.default !== "function" ||
    !Object.prototype.isPrototypeOf.call(
      HTMLElement.prototype,
      module.default.prototype
    )
  ) {
    await commands.startPluginFailed(pluginID, ["DEFAULT_EXPORT_NOT_HTMLELEMENT"]);
    return;
  }
  let customElementID = `main-${pluginID}-${hash}`;
  if (!customElements.get(customElementID)) {
    customElements.define(customElementID, module.default);
  } else {
    console.info("custom element was already defined");
  }
  console.info(
    customElementID,
    "registered:",
    customElements.get(customElementID)
  );
  // We spawn the HTML Element
  let item: HTMLElement;
  try {
    item = new module.default();
  } catch (e) {
    await commands.startPluginFailed(pluginID, ["INSTANTIATION_FAILED"]);
    return;
  }
  if (!(item instanceof HTMLElement)) {
    await commands.startPluginFailed(pluginID, ["PLUGIN_INSTANCE_NOT_HTMLELEMENT"]);
    return;
  }
  if (!("initPlugin" in item) || typeof item.initPlugin !== "function") {
    await commands.startPluginFailed(pluginID, ["PLUGIN_MISSING_INIT_FUNCTION"]);
    return;
  }

  const { ctx, notifyDestructor } =
    await PluginContextV1AlphaImpl.create(
      pluginID,
      commands
    );
  try {
    item.initPlugin(ctx);
  } catch (e) {
    await commands.startPluginFailed(pluginID, ["PLUGIN_INIT_FUNCTION_ERRORED"]);
    return;
  }

  await commands.finalizeStartPlugin(pluginID);
  return {
    type: "Running",
    context: ctx,
    ref: item,
    hash,
    contextDestruction: async () => {
      await notifyDestructor();
      item.remove();
    },
  };
}
