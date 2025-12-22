export interface PluginManifestV1Alpha {
  type: "v1alpha"
  name: string
  description?: string | null | undefined
  repository_url?: string | null | undefined
  support_url?: string | null | undefined
  version?: string | null | undefined
  // versions is not in here because it is ignored locally
  // same with remove_manifest
}

export type PluginManifestV1AlphaWithId = PluginManifestV1Alpha & { id: string }