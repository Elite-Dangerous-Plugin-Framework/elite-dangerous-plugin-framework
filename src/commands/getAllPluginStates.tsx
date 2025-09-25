import { invoke } from "@tauri-apps/api/core";
import z from "zod";
import { PluginStateZod } from "../types/PluginState";

export async function getAllPluginStates() {
    const resp = await invoke("fetch_all_plugins")
    try {
        return z.record(z.string(), PluginStateZod).parse(resp);
    }
    catch (err) {
        throw err
    }
}