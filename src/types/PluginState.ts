import z from "zod";
import { PluginCurrentStateZod } from "./PluginCurrentState";
import { ManifestZod } from "./PluginManifest";

export const PluginStateZod = z.object({
  current_state: PluginCurrentStateZod,
  plugin_dir: z.string(),
  manifest: ManifestZod,
  source: z.enum(["UserProvided", "Embedded"]),
});

export type PluginState = z.infer<typeof PluginStateZod>;
