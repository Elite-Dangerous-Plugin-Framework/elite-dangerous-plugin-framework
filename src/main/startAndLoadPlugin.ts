import { invoke } from "@tauri-apps/api/core";
import z from "zod";
import { PluginContext } from "./PluginContext";
import PluginsManager from "./PluginsManager";

export function startAndLoadPlugin(
  pluginID: string,
  rootTokenRef: React.MutableRefObject<string | undefined>,
  pluginManager: PluginsManager
) {
  (async () => {
    const result = z
      .object({
        success: z.literal(false),
        reason: z.enum(["PLUGIN_NOT_FOUND"]),
      })
      .or(
        z.object({
          success: z.literal(true),
          import: z.string(),
          hash: z.string(),
        })
      )
      .parse(
        await invoke("get_import_path_for_plugin", { pluginId: pluginID })
      );
    if (!result.success) {
      await invoke("start_plugin_failed", {
        pluginId: pluginID,
        reasons: [result.reason],
      });
      return;
    }
    // now try to import the module
    let module: any;
    try {
      module = await import(/* @vite-ignore */ result.import);
    } catch (err) {
      console.error(err);
      await invoke("start_plugin_failed", {
        pluginId: pluginID,
        reasons: ["MODULE_IMPORT_FAILED"],
      });
      return;
    }
    // if here, module exists
    if (!module.default) {
      // but doesnt have a default export
      await invoke("start_plugin_failed", {
        pluginId: pluginID,
        reasons: ["NO_DEFAULT_EXPORT"],
      });
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
      await invoke("start_plugin_failed", {
        pluginId: pluginID,
        reasons: ["DEFAULT_EXPORT_NOT_HTMLELEMENT"],
      });
      return;
    }
    let customElementID = `main-${pluginID}-${result.success ? result.hash : "no-hash"
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
      await invoke("start_plugin_failed", {
        pluginId: pluginID,
        reasons: ["INSTANTIATION_FAILED"],
      });
      return;
    }
    if (!(item instanceof HTMLElement)) {
      await invoke("start_plugin_failed", {
        pluginId: pluginID,
        reasons: ["PLUGIN_INSTANCE_NOT_HTMLELEMENT"],
      });
      return;
    }
    if (!("initPlugin" in item) || typeof item.initPlugin !== "function") {
      console.log(item);
      await invoke("start_plugin_failed", {
        pluginId: pluginID,
        reasons: ["PLUGIN_MISSING_INIT_FUNCTION"],
      });
      return;
    }

    document.getElementById("plugins-staging-ground")!.appendChild(item);
    const { data }: { data: string } = await invoke(
      "get_instance_id_by_plugin",
      { pluginId: pluginID, rootToken: rootTokenRef.current }
    );
    const { ctx } = await PluginContext.create(data);

    try {
      item.initPlugin(ctx);
    } catch {
      await invoke("start_plugin_failed", {
        pluginId: pluginID,
        reasons: ["PLUGIN_INIT_FUNCTION_ERRORED"],
      });
      return;
    }

    const pluginManagerState = {
      ...pluginManager.loadedPluginsLookup
    }

    pluginManagerState[pluginID] = {
      type: "Running",
      customElementName: customElementID,
      capabilities: {},
      context: ctx,
      ref: item,
    };
    pluginManager.loadedPluginsLookup = pluginManagerState
    await invoke("finalize_start_plugin", {
      pluginId: pluginID,
    });
  })();
}

export const LoadedPluginStateLookup = z.record(
  z.string(),
  z.union([
    z.object({
      type: z.literal("Running"),
      ref: z.instanceof(HTMLElement).optional(),
      customElementName: z.string(),
      capabilities: z.object({}),
      context: z.instanceof(PluginContext),
    }),
  ])
);
