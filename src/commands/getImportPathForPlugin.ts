import { invoke } from "@tauri-apps/api/core";
import z from "zod";

export default async function getImportPathForPlugin(pluginID: string) {
  return z
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
    .parse(await invoke("get_import_path_for_plugin", { pluginId: pluginID }));
}
