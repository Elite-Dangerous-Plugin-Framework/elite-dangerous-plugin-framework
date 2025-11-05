import z from "zod";
import { PluginContext } from "./PluginContext";
import { CurrentUiStateZod } from "./PluginsManager";
import type getImportPathForPlugin from "../commands/getImportPathForPlugin";
import type startPluginFailed from "../commands/startPluginFailed";
import type getInstanceByPluginId from "../commands/getInstanceByPluginId";
import type finalizeStartPlugin from "../commands/finalizeStartPlugin";

// We extract the functions into a separate interface here to make testing easier
interface StartAndLoadPluginCommands {
  GetImportPath: typeof getImportPathForPlugin;
  StartPluginFailed: typeof startPluginFailed;
  GetInstanceByPluginId: typeof getInstanceByPluginId;
  FinalizeStartPlugin: typeof finalizeStartPlugin;
}

export async function startAndLoadPlugin(
  pluginID: string,
  rootTokenRef: string,
  {
    GetImportPath,
    StartPluginFailed,
    GetInstanceByPluginId,
    FinalizeStartPlugin,
  }: StartAndLoadPluginCommands
): Promise<undefined | z.infer<typeof CurrentUiStateZod>> {
  console.trace("startAndLoad called");
  const result = await GetImportPath(pluginID);
  if (!result.success) {
    await StartPluginFailed(pluginID, [result.reason]);
    return;
  }
  // now try to import the module
  let module: any;
  try {
    module = await import(/* @vite-ignore */ result.import);
  } catch (err) {
    await StartPluginFailed(pluginID, ["MODULE_IMPORT_FAILED"]);
    return;
  }
  // if here, module exists
  if (!module.default) {
    // but doesnt have a default export
    await StartPluginFailed(pluginID, ["NO_DEFAULT_EXPORT"]);
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
    await StartPluginFailed(pluginID, ["DEFAULT_EXPORT_NOT_HTMLELEMENT"]);
    return;
  }
  let customElementID = `main-${pluginID}-${
    result.success ? result.hash : "no-hash"
  }`;
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
    await StartPluginFailed(pluginID, ["INSTANTIATION_FAILED"]);
    return;
  }
  if (!(item instanceof HTMLElement)) {
    await StartPluginFailed(pluginID, ["PLUGIN_INSTANCE_NOT_HTMLELEMENT"]);
    return;
  }
  if (!("initPlugin" in item) || typeof item.initPlugin !== "function") {
    await StartPluginFailed(pluginID, ["PLUGIN_MISSING_INIT_FUNCTION"]);
    return;
  }

  const { ctx, notifyDestructor, notifySettingsChanged } =
    await PluginContext.create(
      await GetInstanceByPluginId(pluginID, rootTokenRef)
    );
  try {
    item.initPlugin(ctx);
  } catch (e) {
    await StartPluginFailed(pluginID, ["PLUGIN_INIT_FUNCTION_ERRORED"]);
    return;
  }

  await FinalizeStartPlugin(pluginID);
  return {
    type: "Running",
    context: ctx,
    ref: item,
    hash: result.hash,
    contextDestruction: async () => {
      await notifyDestructor();
      item.remove();
    },
    notifySettingsChanged,
  };
}
