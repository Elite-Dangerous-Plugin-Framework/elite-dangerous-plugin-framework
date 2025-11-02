import z from "zod";
import { PluginViewStructureZod } from "../main/layouts/types";
import { invoke } from "@tauri-apps/api/core";

export default async function syncMainLayout() {
  const { data } = z
    .object({ data: PluginViewStructureZod })
    .parse(await invoke("sync_main_layout"));
  return data;
}
