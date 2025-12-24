import { invoke } from "@tauri-apps/api/core";
import { decryptPayload, encryptPayload } from "./commandUtils";
import { PluginStateZod } from "../types/PluginState";
import z from "zod";
import { PluginViewStructureZod } from "../main/layouts/types";
import { getRootToken } from "./getRootToken";


const ErrorZod = z.object({
  success: z.literal(false),
  reason: z.string()
})

const EncryptedHappyResponse = z.object({
  success: z.literal(true),
  iv: z.string(),
  payload: z.string()
})

const EncryptedCommandResponse = z.discriminatedUnion("success", [ErrorZod, EncryptedHappyResponse])
const EncryptedCommandEmptyResponse = z.discriminatedUnion("success", [ErrorZod, EncryptedHappyResponse.omit({ "iv": true, "payload": true })])

/**
 * This util handled encryption and decryption for commands. It is highly priviledged and mustn't be exposed to plugins!
 */
export class CommandWrapper {

  #key: CryptoKey;
  constructor(key: CryptoKey) {
    this.#key = key;
  }

  /**
   * this can be invoked once per Window Lifecycle. The Backend knows which Window is calling from
   * the IPC Impl. 
   */
  public static async createNew() {
    return new CommandWrapper(await getRootToken())
  }

  public async fetchAllPlugins() {
    const { iv: reqIv, payload: reqPayload } = await encryptPayload(this.#key, {})

    const response = await invoke("fetch_all_plugins", { iv: reqIv, payload: reqPayload })
    const parsedEncrypted = EncryptedCommandResponse.safeParse(response)
    console.log({ response, parsedEncrypted })

    if (!parsedEncrypted.success) {
      return {
        success: false as const,
        reason: "RESPONSE_STRUCTURE_INVALID",
        meta: z.treeifyError(parsedEncrypted.error)
      }
    }
    if (!parsedEncrypted.data.success) {
      return parsedEncrypted.data
    }

    // at this point we are successful. Time to decrypt
    let payload: object
    try {
      payload = await decryptPayload(this.#key, parsedEncrypted.data.iv, parsedEncrypted.data.payload)
    }
    catch (e) {
      return {
        success: false as const,
        reason: "DECRYPT_FAILED",
        meta: e
      }
    }

    const verifiedPayload = z.record(z.string(), PluginStateZod).safeParse(payload)
    if (verifiedPayload.error) {
      return {
        success: false as const,
        reason: "DECRYPTED_RESPONSE_STRUCTURE_INVALID",
        meta: z.treeifyError(verifiedPayload.error)
      }
    }
    return {
      success: true as const,
      data: verifiedPayload.data
    }
  }

  public async getImportPathForPlugin(pluginId: string) {
    const { iv: reqIv, payload: reqPayload } = await encryptPayload(this.#key, { pluginId })
    const response = await invoke("get_import_path_for_plugin", { iv: reqIv, payload: reqPayload })

    const parsedEncrypted = EncryptedCommandResponse.safeParse(response)

    if (!parsedEncrypted.success) {
      return {
        success: false as const,
        reason: "RESPONSE_STRUCTURE_INVALID",
        meta: z.treeifyError(parsedEncrypted.error)
      }
    }
    if (!parsedEncrypted.data.success) {
      return parsedEncrypted.data
    }


    // at this point we are successful. Time to decrypt
    let payload: object
    try {
      payload = await decryptPayload(this.#key, parsedEncrypted.data.iv, parsedEncrypted.data.payload)
    }
    catch (e) {
      return {
        success: false as const,
        reason: "DECRYPT_FAILED",
        meta: e
      }
    }

    const verifiedPayload = z.object({ hash: z.string(), import: z.string() }).safeParse(payload)
    if (verifiedPayload.error) {
      return {
        success: false as const,
        reason: "DECRYPTED_RESPONSE_STRUCTURE_INVALID",
        meta: z.treeifyError(verifiedPayload.error)
      }
    }
    return {
      success: true as const,
      data: verifiedPayload.data
    }
  }

  public async openPluginsDir(pluginId?: string | undefined) {
    if (!pluginId) {
      pluginId = undefined
    }
    const { iv: reqIv, payload: reqPayload } = await encryptPayload(this.#key, { pluginId })
    const response = await invoke("open_plugins_dir", { iv: reqIv, payload: reqPayload })

    const parsedEncrypted = EncryptedCommandEmptyResponse.safeParse(response)

    if (!parsedEncrypted.success) {
      return {
        success: false as const,
        reason: "RESPONSE_STRUCTURE_INVALID",
        meta: z.treeifyError(parsedEncrypted.error)
      }
    }
    return parsedEncrypted.data
  }

  public async openSettings() {
    const { iv, payload } = await encryptPayload(this.#key, {})
    console.log({ iv, payload })
    const response = await invoke("open_settings", { iv: iv, payload })

    const parsedEncrypted = EncryptedCommandEmptyResponse.safeParse(response)

    if (!parsedEncrypted.success) {
      return {
        success: false as const,
        reason: "RESPONSE_STRUCTURE_INVALID",
        meta: z.treeifyError(parsedEncrypted.error)
      }
    }
    return parsedEncrypted.data
  }

  public async startPlugin(pluginId: string) {
    const { iv: reqIv, payload: reqPayload } = await encryptPayload(this.#key, { pluginId })
    const response = await invoke("start_plugin", { iv: reqIv, payload: reqPayload })

    const parsedEncrypted = EncryptedCommandEmptyResponse.safeParse(response)

    if (!parsedEncrypted.success) {
      return {
        success: false as const,
        reason: "RESPONSE_STRUCTURE_INVALID",
        meta: z.treeifyError(parsedEncrypted.error)
      }
    }
    return parsedEncrypted.data
  }

  public async finalizeStartPlugin(pluginId: string) {
    const { iv: reqIv, payload: reqPayload } = await encryptPayload(this.#key, { pluginId })
    const response = await invoke("finalize_start_plugin", { iv: reqIv, payload: reqPayload })

    const parsedEncrypted = EncryptedCommandEmptyResponse.safeParse(response)

    if (!parsedEncrypted.success) {
      return {
        success: false as const,
        reason: "RESPONSE_STRUCTURE_INVALID",
        meta: z.treeifyError(parsedEncrypted.error)
      }
    }
    return parsedEncrypted.data
  }

  public async startPluginFailed(pluginId: string, reasons: string[]) {
    const { iv: reqIv, payload: reqPayload } = await encryptPayload(this.#key, { pluginId, reasons })
    const response = await invoke("start_plugin_failed", { iv: reqIv, payload: reqPayload })

    const parsedEncrypted = EncryptedCommandEmptyResponse.safeParse(response)

    if (!parsedEncrypted.success) {
      return {
        success: false as const,
        reason: "RESPONSE_STRUCTURE_INVALID",
        meta: z.treeifyError(parsedEncrypted.error)
      }
    }
    return parsedEncrypted.data
  }

  public async stopPlugin(pluginId: string) {
    const { iv: reqIv, payload: reqPayload } = await encryptPayload(this.#key, { pluginId })
    const response = await invoke("stop_plugin", { iv: reqIv, payload: reqPayload })

    const parsedEncrypted = EncryptedCommandEmptyResponse.safeParse(response)

    if (!parsedEncrypted.success) {
      return {
        success: false as const,
        reason: "RESPONSE_STRUCTURE_INVALID",
        meta: z.treeifyError(parsedEncrypted.error)
      }
    }
    return parsedEncrypted.data
  }

  public async finalizeStopPlugin(pluginId: string) {
    const { iv: reqIv, payload: reqPayload } = await encryptPayload(this.#key, { pluginId })
    const response = await invoke("finalize_stop_plugin", { iv: reqIv, payload: reqPayload })

    const parsedEncrypted = EncryptedCommandEmptyResponse.safeParse(response)

    if (!parsedEncrypted.success) {
      return {
        success: false as const,
        reason: "RESPONSE_STRUCTURE_INVALID",
        meta: z.treeifyError(parsedEncrypted.error)
      }
    }
    return parsedEncrypted.data
  }

  public async openUrl(pluginId: string, url: string) {
    const { iv: reqIv, payload: reqPayload } = await encryptPayload(this.#key, { url, pluginId })
    const response = await invoke("open_url", { iv: reqIv, payload: reqPayload })
    console.log(response)
    return z.discriminatedUnion("success", [z.object({ success: z.literal(true) }), z.object({
      success: z.literal(false), reason: z.string()
    })]).parse(response)
  }

  public async getPlugin(pluginId: string) {
    const { iv: reqIv, payload: reqPayload } = await encryptPayload(this.#key, { pluginId })

    const response = await invoke("get_plugin", { iv: reqIv, payload: reqPayload })

    const parsedEncrypted = EncryptedCommandResponse.safeParse(response)

    if (!parsedEncrypted.success) {
      return {
        success: false as const,
        reason: "RESPONSE_STRUCTURE_INVALID",
        meta: z.treeifyError(parsedEncrypted.error)
      }
    }
    if (!parsedEncrypted.data.success) {
      return parsedEncrypted.data
    }

    // at this point we are successful. Time to decrypt
    let payload: object
    try {
      payload = await decryptPayload(this.#key, parsedEncrypted.data.iv, parsedEncrypted.data.payload)
    }
    catch (e) {
      return {
        success: false as const,
        reason: "DECRYPT_FAILED",
        meta: e
      }
    }

    const verifiedPayload = PluginStateZod.safeParse(payload)
    if (verifiedPayload.error) {
      return {
        success: false as const,
        reason: "DECRYPTED_RESPONSE_STRUCTURE_INVALID",
        meta: z.treeifyError(verifiedPayload.error)
      }
    }
    return {
      success: true as const,
      data: verifiedPayload.data
    }
  }

  public async writeSetting(pluginId: string, key: string, value: any) {
    const { iv: reqIv, payload: reqPayload } = await encryptPayload(this.#key, { pluginId, key, value })

    const response = await invoke("write_setting", { iv: reqIv, payload: reqPayload })

    const parsedEncrypted = EncryptedCommandResponse.safeParse(response)

    if (!parsedEncrypted.success) {
      return {
        success: false as const,
        reason: "RESPONSE_STRUCTURE_INVALID",
        meta: z.treeifyError(parsedEncrypted.error)
      }
    }
    if (!parsedEncrypted.data.success) {
      return parsedEncrypted.data
    }

    // at this point we are successful. Time to decrypt
    let payload: object
    try {
      payload = await decryptPayload(this.#key, parsedEncrypted.data.iv, parsedEncrypted.data.payload)
    }
    catch (e) {
      return {
        success: false as const,
        reason: "DECRYPT_FAILED",
        meta: e
      }
    }

    const verifiedPayload = z.object({ key: z.string(), value: z.any().optional().nullable() }).safeParse(payload)
    if (verifiedPayload.error) {
      return {
        success: false as const,
        reason: "DECRYPTED_RESPONSE_STRUCTURE_INVALID",
        meta: z.treeifyError(verifiedPayload.error)
      }
    }
    return {
      success: true as const,
      data: verifiedPayload.data
    }
  }

  public async readSetting(pluginId: string, key: string) {
    const { iv: reqIv, payload: reqPayload } = await encryptPayload(this.#key, { pluginId, key })

    const response = await invoke("read_setting", { iv: reqIv, payload: reqPayload })
    return await this.decryptSettingsPayload(response)
  }

  /**
   * Not a command directly
   */
  public async decryptSettingsPayload(response: unknown) {
    const parsedEncrypted = EncryptedCommandResponse.safeParse(response)

    if (!parsedEncrypted.success) {
      return {
        success: false as const,
        reason: "RESPONSE_STRUCTURE_INVALID",
        meta: z.treeifyError(parsedEncrypted.error)
      }
    }
    if (!parsedEncrypted.data.success) {
      return parsedEncrypted.data
    }

    // at this point we are successful. Time to decrypt
    let payload: object
    try {
      payload = await decryptPayload(this.#key, parsedEncrypted.data.iv, parsedEncrypted.data.payload)
    }
    catch (e) {
      return {
        success: false as const,
        reason: "DECRYPT_FAILED",
        meta: e
      }
    }

    const verifiedPayload = z.object({ key: z.string(), value: z.any().optional().nullable() }).safeParse(payload)
    if (verifiedPayload.error) {
      console.error(payload)
      return {
        success: false as const,
        reason: "DECRYPTED_RESPONSE_STRUCTURE_INVALID",
        meta: z.treeifyError(verifiedPayload.error)
      }
    }
    return {
      success: true as const,
      data: verifiedPayload.data
    }
  }

  public async rereadActiveJournals() {
    const { iv: reqIv, payload: reqPayload } = await encryptPayload(this.#key, {})

    const response = await invoke("reread_active_journal", { iv: reqIv, payload: reqPayload })

    const parsedEncrypted = EncryptedCommandResponse.safeParse(response)

    if (!parsedEncrypted.success) {
      return {
        success: false as const,
        reason: "RESPONSE_STRUCTURE_INVALID",
        meta: z.treeifyError(parsedEncrypted.error)
      }
    }
    if (!parsedEncrypted.data.success) {
      return parsedEncrypted.data
    }

    // at this point we are successful. Time to decrypt
    let payload: object
    try {
      payload = await decryptPayload(this.#key, parsedEncrypted.data.iv, parsedEncrypted.data.payload)
    }
    catch (e) {
      return {
        success: false as const,
        reason: "DECRYPT_FAILED",
        meta: e
      }
    }

    const verifiedPayload = z.array(z.object({
      cmdr: z.string(),
      file: z.string(),
      entries: z.array(z.string())
    })).safeParse(payload)
    if (!verifiedPayload.success) {
      return {
        success: false as const,
        reason: "DECRYPTED_RESPONSE_STRUCTURE_INVALID",
        meta: z.treeifyError(verifiedPayload.error)
      }
    }
    return {
      success: true as const,
      data: verifiedPayload.data
    }
  }


  public async syncMainLayout(maybeNewLayout?: undefined | z.infer<typeof PluginViewStructureZod>) {
    if (!maybeNewLayout) {
      maybeNewLayout = undefined
    }
    const { iv: reqIv, payload: reqPayload } = await encryptPayload(this.#key, { layout: maybeNewLayout })
    const response = await invoke("sync_main_layout", { iv: reqIv, payload: reqPayload })

    const parsedEncrypted = EncryptedCommandResponse.safeParse(response)

    if (!parsedEncrypted.success) {
      return {
        success: false as const,
        reason: "RESPONSE_STRUCTURE_INVALID",
        meta: z.treeifyError(parsedEncrypted.error)
      }
    }
    if (!parsedEncrypted.data.success) {
      return parsedEncrypted.data
    }

    // at this point we are successful. Time to decrypt
    let payload: object
    try {
      payload = await decryptPayload(this.#key, parsedEncrypted.data.iv, parsedEncrypted.data.payload)
    }
    catch (e) {
      return {
        success: false as const,
        reason: "DECRYPT_FAILED",
        meta: e
      }
    }

    const verifiedPayload = PluginViewStructureZod.safeParse(payload)
    if (verifiedPayload.error) {
      return {
        success: false as const,
        reason: "DECRYPTED_RESPONSE_STRUCTURE_INVALID",
        meta: z.treeifyError(verifiedPayload.error)
      }
    }
    return {
      success: true as const,
      data: verifiedPayload.data
    }
  }



}
