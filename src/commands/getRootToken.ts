import { invoke } from "@tauri-apps/api/core";
import z from "zod";

export async function getRootToken() {
  const resp = await invoke("get_root_token_once");
  const response = z
    .object({ success: z.literal(true), data: z.string() })
    .or(z.object({ success: z.literal(false), reason: z.string() }))
    .parse(resp);
  if (!response.success) {
    throw new Error(
      "critital error: root token was already requested, the main App cannot acquire it. Please restart EDPF."
    );
  } else {
    return response.data
  }
}