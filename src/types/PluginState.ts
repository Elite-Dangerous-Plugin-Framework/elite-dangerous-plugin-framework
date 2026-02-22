import z from "zod";
import { ManifestZod } from "./PluginManifest";
import { GenericPluginSettingsZod } from "./GenericPluginSettings";

/**
 * These are the settings for the **BACKEND** state of a plugin.
 */
export const PluginStateZod = z.object({
  id: z.string(),
  plugin_dir: z.string(),
  frontend_hash: z.string(),
  manifest: ManifestZod,
  source: z.enum(["UserProvided", "Embedded"]),
  configuration: GenericPluginSettingsZod
});

export type PluginState = z.infer<typeof PluginStateZod>;
