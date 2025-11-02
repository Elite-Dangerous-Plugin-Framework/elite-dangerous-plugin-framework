import { invoke } from "@tauri-apps/api/core";

export default async function startPluginFailed(
  pluginID: string,
  reasons: string[]
) {
  await invoke("start_plugin_failed", {
    pluginId: pluginID,
    reasons,
  });
}
