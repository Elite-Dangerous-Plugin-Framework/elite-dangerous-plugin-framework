import { invoke } from "@tauri-apps/api/core";

export default async function finalizeStartPlugin(pluginId: string) {
  await invoke("finalize_start_plugin", {
    pluginId,
  });
}
