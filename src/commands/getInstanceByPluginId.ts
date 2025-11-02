import { invoke } from "@tauri-apps/api/core";
import z from "zod";

export default async function getInstanceByPluginId(
  pluginId: string,
  rootToken: string
) {
  const { data }: { data: string } = z.object({ data: z.string() }).parse(
    await invoke("get_instance_id_by_plugin", {
      pluginId,
      rootToken,
    })
  );
  return data;
}
