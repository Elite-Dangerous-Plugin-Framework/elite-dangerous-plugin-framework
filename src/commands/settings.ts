import { invoke } from "@tauri-apps/api/core";
import z from "zod";

/**
 * Writes a setting. Only succeeds if the first key is the plugin ID associated with the Token. Passing `undefined` deletes the key
 *
 * Gets back the newly written Setting Value, just like {@link readSetting()}.
 */
export async function writeSetting(
  key: string,
  value: unknown | undefined,
  token: string
) {
  const resp = await invoke("write_setting", { key, value, token });

  return z
    .object({ success: z.literal(true), value: z.unknown().optional() })
    .or(z.object({ success: z.literal(false), reason: z.string() }))
    .parse(resp);
}

/**
 * Reads a setting. Only succeeds if the first key is the plugin ID associated with the Token, or if the setting is public (last segment starts Uppercase)
 */
export async function readSetting(key: string, token: string) {
  const resp = await invoke("read_setting", { key, token });

  return z
    .object({ success: z.literal(true), value: z.unknown().optional() })
    .or(z.object({ success: z.literal(false), reason: z.string() }))
    .parse(resp);
}
