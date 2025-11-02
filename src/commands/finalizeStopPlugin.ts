import { invoke } from "@tauri-apps/api/core";

export default async function finalizeStopPlugin(pluginId: string) {
  await invoke("finalize_stop_plugin", {
    pluginId,
  });
}
