import { invoke } from "@tauri-apps/api/core";
import z from "zod";
import { base64ToBytesNoPadding } from "./commandUtils";

export async function getRootToken() {
  const resp = await invoke("get_root_token_once");
  console.log({ resp })
  const response = z
    .object({ success: z.literal(true), data: z.string() })
    .or(z.object({ success: z.literal(false), reason: z.string() }))
    .parse(resp);
  if (!response.success) {
    throw new Error(
      "critital error: fetching the root token has failed: " + response.reason
    );
  } else {
    const keyBytes = base64ToBytesNoPadding(response.data)

    return crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    )
  }
}

